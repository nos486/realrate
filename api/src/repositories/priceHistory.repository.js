/**
 * priceHistory.repository.js — Every price the app has ever seen, in Postgres (via Hyperdrive)
 *
 * One table for all sources: item key, time, value. Rows are never deleted.
 * A row is written each time an item's value changes; a sync that brings the same value again
 * adds nothing, so the table is the full step series of each price without repeats.
 *
 * Postgres is optional: without the HYPERDRIVE binding nothing is recorded, and a failed write
 * is logged and never breaks the price sync that called it.
 *
 * Reads (readPriceTrends) return a small fixed-size series per key for trend cards: the window
 * is cut into equal buckets, each holding the last value known at its end.
 */

import { Client } from "pg";
import { logger } from "../lib/logger.js";
import { normalizePriceId } from "../domain/priceBook.js";

export const PRICE_HISTORY_SCHEMA = `
CREATE TABLE IF NOT EXISTS price_history (
  item_key    text        NOT NULL,
  recorded_at timestamptz NOT NULL,
  value       numeric     NOT NULL
);
CREATE INDEX IF NOT EXISTS price_history_key_time ON price_history (item_key, recorded_at DESC);
`;

/** A price that hasn't changed for this long is written again, so "flat" and "dead" differ */
export const HEARTBEAT_SEC = 3600;

/**
 * Insert the points whose value differs from the latest stored value of the same key, and the
 * heartbeat points whose key has no row for HEARTBEAT_SEC.
 * $1: keys, $2: values, $3: the time of this update, $4: each point's own time (null: $3),
 * $5: whether a point may be a heartbeat, $6: the heartbeat interval in seconds.
 * A point is recorded at its own time — when its source priced it — but never after this update
 * and never at or before the key's latest row (so the latest row is always the latest value).
 */
export const INSERT_CHANGED_SQL = `
INSERT INTO price_history (item_key, recorded_at, value)
SELECT n.item_key,
       GREATEST(
         LEAST(COALESCE(n.at, $3::timestamptz), $3::timestamptz),
         COALESCE(last.recorded_at + interval '1 millisecond', '-infinity'::timestamptz)
       ),
       n.value
FROM unnest($1::text[], $2::numeric[], $4::timestamptz[], $5::boolean[]) AS n(item_key, value, at, heartbeat)
LEFT JOIN LATERAL (
  SELECT h.value, h.recorded_at FROM price_history h
  WHERE h.item_key = n.item_key
  ORDER BY h.recorded_at DESC
  LIMIT 1
) AS last ON true
WHERE last.value IS DISTINCT FROM n.value
   OR (n.heartbeat AND last.recorded_at < $3::timestamptz - make_interval(secs => $6))
`;

/**
 * Turn items into history points: one per key (the last one wins), positive finite values only.
 * Keys are in the price book's id form (normalizePriceId).
 * @param {Array<{ id: string, price: number|string, at?: string|null, heartbeat?: boolean }>} items
 *   `at`: when the price is from; `heartbeat`: write it again after HEARTBEAT_SEC even if unchanged
 * @returns {{ keys: string[], values: string[], ats: Array<string|null>, heartbeats: boolean[] }}
 */
export function toHistoryPoints(items) {
  const byKey = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const key = normalizePriceId(item?.id);
    const value = Number(item?.price);
    if (!key || !Number.isFinite(value) || value <= 0) continue;
    const at = Date.parse(item?.at || "");
    byKey.set(key, { value, at: Number.isFinite(at) ? new Date(at).toISOString() : null, heartbeat: Boolean(item?.heartbeat) });
  }
  const points = [...byKey.values()];
  // Values go as strings so numeric keeps them exactly as JS printed them
  return {
    keys: [...byKey.keys()],
    values: points.map((p) => String(p.value)),
    ats: points.map((p) => p.at),
    heartbeats: points.map((p) => p.heartbeat),
  };
}

/** Trend windows: length and bucket size (the day is per minute, as often as prices are synced) */
export const TREND_RANGES = {
  "1d": { ms: 24 * 3600e3, bucketSec: 60 },
  "7d": { ms: 7 * 24 * 3600e3, bucketSec: 3 * 3600 },
  "30d": { ms: 30 * 24 * 3600e3, bucketSec: 12 * 3600 },
  "1y": { ms: 365 * 24 * 3600e3, bucketSec: 7 * 24 * 3600 },
};
export const DEFAULT_TREND_RANGE = "1d";

/** $1: keys, $2: window start, $3: bucket size in seconds → the last value of each bucket */
export const TREND_BUCKETS_SQL = `
SELECT item_key,
       floor(extract(epoch FROM recorded_at) / $3)::bigint AS bucket,
       ((array_agg(value ORDER BY recorded_at DESC))[1])::float8 AS value
FROM price_history
WHERE item_key = ANY($1::text[]) AND recorded_at >= $2::timestamptz
GROUP BY item_key, bucket
`;

/** $1: keys, $2: window start → each key's value when the window starts (its last value before) */
export const TREND_BASELINE_SQL = `
SELECT k.item_key, b.value::float8 AS value
FROM unnest($1::text[]) AS k(item_key)
CROSS JOIN LATERAL (
  SELECT h.value FROM price_history h
  WHERE h.item_key = k.item_key AND h.recorded_at < $2::timestamptz
  ORDER BY h.recorded_at DESC
  LIMIT 1
) AS b
`;

/**
 * One key's series: a value per bucket from the window start to now, each carrying the last
 * known value forward. Buckets before the first known value are dropped.
 * @param {{ baseline?: number|null, buckets: Map<number, number>, fromMs: number, nowMs: number, bucketSec: number }} input
 * @returns {{ points: number[], first: number, last: number, changePct: number, since: string }|null}
 */
export function buildTrendSeries({ baseline = null, buckets, fromMs, nowMs, bucketSec }) {
  const size = bucketSec * 1000;
  const firstBucket = Math.floor(fromMs / size);
  const lastBucket = Math.floor(nowMs / size);
  const points = [];
  let carry = Number.isFinite(baseline) ? baseline : null;
  let sinceBucket = null;
  for (let b = firstBucket; b <= lastBucket; b++) {
    if (buckets.has(b)) carry = buckets.get(b);
    if (carry === null) continue;
    if (sinceBucket === null) sinceBucket = b;
    points.push(carry);
  }
  if (points.length === 0) return null;
  const first = points[0];
  const last = points[points.length - 1];
  return {
    points,
    first,
    last,
    changePct: first > 0 ? ((last - first) / first) * 100 : 0,
    since: new Date(Math.max(sinceBucket * size, fromMs)).toISOString(),
  };
}

// A dead database must not stall the price sync that is writing
const CONNECT_TIMEOUT_MS = 5000;
const QUERY_TIMEOUT_MS = 10000;

// The table is created once per isolate, on the first write
let schemaReady = null;

/** For tests: forget that the schema was created */
export function resetPriceHistorySchemaCache() {
  schemaReady = null;
}

function connectClient(connectionString, deps) {
  const createClient = deps.createClient || ((cs) => new Client({
    connectionString: cs,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
  }));
  return createClient(connectionString);
}

/**
 * Trend series for asset keys over a window
 * @param {object} env - needs env.HYPERDRIVE
 * @param {string[]} keys - asset ids (compared in the price book's id form, as they are recorded)
 * @param {{ range?: string, now?: number }} [options]
 * @param {{ createClient?: (connectionString: string) => object }} [deps] - for tests
 * @returns {Promise<Record<string, ReturnType<typeof buildTrendSeries>>|null>} null when history
 *   is unavailable (no binding or a database error); keys without data are left out
 */
export async function readPriceTrends(env, keys, { range = DEFAULT_TREND_RANGE, now = Date.now() } = {}, deps = {}) {
  const connectionString = env?.HYPERDRIVE?.connectionString;
  if (!connectionString) return null;
  const window = TREND_RANGES[range] || TREND_RANGES[DEFAULT_TREND_RANGE];
  const wanted = [...new Set((keys || []).map(normalizePriceId).filter(Boolean))];
  if (wanted.length === 0) return {};

  const fromMs = now - window.ms;
  const fromIso = new Date(fromMs).toISOString();
  const client = connectClient(connectionString, deps);
  let connected = false;
  try {
    await client.connect();
    connected = true;
    const [bucketRes, baseRes] = await Promise.all([
      client.query(TREND_BUCKETS_SQL, [wanted, fromIso, window.bucketSec]),
      client.query(TREND_BASELINE_SQL, [wanted, fromIso]),
    ]);

    const bucketsByKey = new Map();
    for (const row of bucketRes.rows || []) {
      if (!bucketsByKey.has(row.item_key)) bucketsByKey.set(row.item_key, new Map());
      bucketsByKey.get(row.item_key).set(Number(row.bucket), Number(row.value));
    }
    const baselineByKey = new Map((baseRes.rows || []).map((row) => [row.item_key, Number(row.value)]));

    const result = {};
    for (const key of wanted) {
      const series = buildTrendSeries({
        baseline: baselineByKey.get(key) ?? null,
        buckets: bucketsByKey.get(key) || new Map(),
        fromMs,
        nowMs: now,
        bucketSec: window.bucketSec,
      });
      if (series) result[key] = series;
    }
    return result;
  } catch (err) {
    logger.warn("[PriceHistory] Read failed:", { error: err.message, keys: wanted.length });
    return null;
  } finally {
    if (connected) await client.end().catch(() => {});
  }
}

/**
 * Record the items of one update in the history
 * @param {object} env - needs env.HYPERDRIVE
 * @param {Array<{ id: string, price: number|string, at?: string|null, heartbeat?: boolean }>} items
 * @param {string} [recordedAt] - ISO time of the update (defaults to now)
 * @param {{ createClient?: (connectionString: string) => object }} [deps] - for tests
 * @returns {Promise<number>} How many rows were inserted
 */
export async function recordPriceHistory(env, items, recordedAt, deps = {}) {
  const connectionString = env?.HYPERDRIVE?.connectionString;
  if (!connectionString) return 0;

  const { keys, values, ats, heartbeats } = toHistoryPoints(items);
  if (keys.length === 0) return 0;

  const time = recordedAt || new Date().toISOString();
  const client = connectClient(connectionString, deps);
  let connected = false;
  try {
    await client.connect();
    connected = true;
    if (!schemaReady) {
      schemaReady = client.query(PRICE_HISTORY_SCHEMA)
        .catch((err) => {
          schemaReady = null;
          throw err;
        });
    }
    await schemaReady;
    const res = await client.query(INSERT_CHANGED_SQL, [keys, values, time, ats, heartbeats, HEARTBEAT_SEC]);
    return res?.rowCount || 0;
  } catch (err) {
    logger.warn("[PriceHistory] Write failed:", { error: err.message, items: keys.length });
    return 0;
  } finally {
    // Hyperdrive keeps the real connection pooled, so closing this one is cheap.
    // A client that never connected is not closed: its end() would wait forever.
    if (connected) await client.end().catch(() => {});
  }
}
