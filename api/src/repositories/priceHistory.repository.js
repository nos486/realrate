/**
 * priceHistory.repository.js — Every price the app has ever seen, in Postgres (via Hyperdrive)
 *
 * One table for all sources: item key, time, value. Rows are never deleted.
 * A row is written each time an item's value changes; a sync that brings the same value again
 * adds nothing, so the table is the full step series of each price without repeats.
 *
 * Postgres is optional: without the HYPERDRIVE binding nothing is recorded, and a failed write
 * is logged and never breaks the price sync that called it.
 */

import { Client } from "pg";
import { logger } from "../lib/logger.js";

export const PRICE_HISTORY_SCHEMA = `
CREATE TABLE IF NOT EXISTS price_history (
  item_key    text        NOT NULL,
  recorded_at timestamptz NOT NULL,
  value       numeric     NOT NULL
);
CREATE INDEX IF NOT EXISTS price_history_key_time ON price_history (item_key, recorded_at DESC);
`;

/**
 * Insert the points whose value differs from the latest stored value of the same key.
 * $1: keys, $2: values (same order), $3: the time of this update.
 */
export const INSERT_CHANGED_SQL = `
INSERT INTO price_history (item_key, recorded_at, value)
SELECT n.item_key, $3::timestamptz, n.value
FROM unnest($1::text[], $2::numeric[]) AS n(item_key, value)
LEFT JOIN LATERAL (
  SELECT h.value FROM price_history h
  WHERE h.item_key = n.item_key
  ORDER BY h.recorded_at DESC
  LIMIT 1
) AS last ON true
WHERE last.value IS DISTINCT FROM n.value
`;

/**
 * Turn a source's items into history points: one per key (the last one wins), positive
 * finite values only. Keys are lower-cased so every source maps to the same key space.
 * @param {Array<{ id: string, price: number|string }>} items
 * @returns {{ keys: string[], values: string[] }}
 */
export function toHistoryPoints(items) {
  const byKey = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const key = String(item?.id ?? "").trim().toLowerCase();
    const value = Number(item?.price);
    if (!key || !Number.isFinite(value) || value <= 0) continue;
    byKey.set(key, value);
  }
  // Values go as strings so numeric keeps them exactly as JS printed them
  return { keys: [...byKey.keys()], values: [...byKey.values()].map(String) };
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

/**
 * Record the items of one update in the history
 * @param {object} env - needs env.HYPERDRIVE
 * @param {Array<{ id: string, price: number|string }>} items
 * @param {string} [recordedAt] - ISO time of the update (defaults to now)
 * @param {{ createClient?: (connectionString: string) => object }} [deps] - for tests
 * @returns {Promise<number>} How many rows were inserted
 */
export async function recordPriceHistory(env, items, recordedAt, deps = {}) {
  const connectionString = env?.HYPERDRIVE?.connectionString;
  if (!connectionString) return 0;

  const { keys, values } = toHistoryPoints(items);
  if (keys.length === 0) return 0;

  const time = recordedAt || new Date().toISOString();
  const createClient = deps.createClient || ((cs) => new Client({
    connectionString: cs,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
  }));
  const client = createClient(connectionString);
  let connected = false;
  try {
    await client.connect();
    connected = true;
    if (!schemaReady) {
      schemaReady = client.query(PRICE_HISTORY_SCHEMA).catch((err) => {
        schemaReady = null;
        throw err;
      });
    }
    await schemaReady;
    const res = await client.query(INSERT_CHANGED_SQL, [keys, values, time]);
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
