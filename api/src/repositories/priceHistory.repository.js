/**
 * priceHistory.repository.js — The price of every item per day, in D1 (table `price_daily`)
 *
 * One row per item and Tehran day: the last price seen that day. Every sync upserts the day's
 * rows in one statement (the points go in as one JSON parameter, read with json_each), and a row
 * is rewritten only when its value changed — so a day costs one insert per item plus its changes.
 * The first sync of a day inserts every item, so each day has its own row (no gaps to carry over
 * while the sources work).
 *
 * Reads (readPriceTrends) return one point per day of the window for trend cards and charts, each
 * carrying the last known value forward; today's point is the latest price.
 *
 * Without a database nothing is recorded, and a failed write is logged and never breaks the price
 * sync that called it.
 */

import { logger } from "../lib/logger.js";
import { normalizePriceId } from "../domain/priceBook.js";
import { ensureSchema } from "./schema.repository.js";
import { AVERAGE_WINDOWS, AVERAGE_WINDOW_KEYS, AVERAGE_MAX_DAYS, windowStart } from "../domain/priceAverages.js";

export const DAY_SEC = 86400;

/** Trend windows, in days (one point per day). "1d" — the old per-minute day — is a week now */
export const TREND_RANGES = {
  "7d": { days: 7, bucketSec: DAY_SEC },
  "30d": { days: 30, bucketSec: DAY_SEC },
  "90d": { days: 90, bucketSec: DAY_SEC },
  "180d": { days: 180, bucketSec: DAY_SEC },
  "1y": { days: 365, bucketSec: DAY_SEC },
  "2y": { days: 730, bucketSec: DAY_SEC },
};
export const RANGE_ALIASES = { "1d": "7d" };
export const DEFAULT_TREND_RANGE = "30d";

/** The range a request names (an old name maps to today's), or the default */
export function resolveTrendRange(name) {
  const key = RANGE_ALIASES[name] || name;
  return Object.hasOwn(TREND_RANGES, key) ? key : DEFAULT_TREND_RANGE;
}

const tehranDayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" });

/** The Tehran calendar day (YYYY-MM-DD) of a moment */
export function tehranDay(ms = Date.now()) {
  return tehranDayFormat.format(new Date(ms));
}

/** A YYYY-MM-DD day moved by `n` days */
export function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** When a Tehran day starts (Iran has had no daylight saving since 2022: UTC+3:30) */
export function tehranDayStart(day) {
  return `${day}T00:00:00+03:30`;
}

/**
 * Turn items into history points: one per key (the last one wins), positive finite values only.
 * Keys are in the price book's id form (normalizePriceId).
 * @param {Array<{ id: string, price: number|string }>} items
 * @returns {Array<[string, number]>}
 */
export function toHistoryPoints(items) {
  const byKey = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const key = normalizePriceId(item?.id);
    const value = Number(item?.price);
    if (!key || !Number.isFinite(value) || value <= 0) continue;
    byKey.set(key, value);
  }
  return [...byKey.entries()];
}

/**
 * ?1: the day, ?2: now (ms), ?3: the points as JSON [[key, value], …]. A new day starts a candle
 * at the price (open = high = low = close); later prices move the close and stretch high / low.
 * A row is rewritten only when its close changed (an unchanged close is already inside
 * high / low). (`WHERE true` lets SQLite read the ON CONFLICT clause of an INSERT … SELECT.)
 */
export const UPSERT_DAY_SQL = `
INSERT INTO price_daily (item_key, day, value, updated_at, open, high, low)
SELECT k, ?1, v, ?2, v, v, v
FROM (SELECT json_extract(p.value, '$[0]') AS k, json_extract(p.value, '$[1]') AS v FROM json_each(?3) AS p)
WHERE true
ON CONFLICT (item_key, day) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at,
  open = COALESCE(price_daily.open, price_daily.value),
  high = MAX(COALESCE(price_daily.high, price_daily.value), excluded.value),
  low = MIN(COALESCE(price_daily.low, price_daily.value), excluded.value)
WHERE price_daily.value <> excluded.value
`;

/**
 * Record the prices of one update into their day
 * @param {object} env - needs env.DB
 * @param {Array<{ id: string, price: number|string }>} items
 * @param {string} [recordedAt] - ISO time of the update (defaults to now); its Tehran day is the row's
 * @returns {Promise<number>} how many rows were written
 */
export async function recordPriceHistory(env, items, recordedAt) {
  if (!env?.DB?.prepare) return 0;
  const points = toHistoryPoints(items);
  if (points.length === 0) return 0;
  const at = Date.parse(recordedAt || "") || Date.now();
  try {
    await ensureSchema(env);
    const res = await env.DB.prepare(UPSERT_DAY_SQL).bind(tehranDay(at), at, JSON.stringify(points)).run();
    return Number(res?.meta?.changes) || 0;
  } catch (err) {
    logger.warn("[PriceHistory] Write failed:", { error: err.message, points: points.length });
    return 0;
  }
}

/** ?1: keys (JSON array), ?2: first day → the window's rows */
export const TREND_ROWS_SQL = `
SELECT item_key, day, value, open, high, low FROM price_daily
WHERE item_key IN (SELECT value FROM json_each(?1)) AND day >= ?2
ORDER BY item_key, day
`;

/**
 * ?1: keys (JSON array), ?2: first day → each key's last value before the window. One lookup per
 * key on the primary key (item_key, day), newest first: a row read per key, however long the
 * history before the window is.
 */
export const TREND_BASELINE_SQL = `
SELECT k.value AS item_key,
  (SELECT p.value FROM price_daily p WHERE p.item_key = k.value AND p.day < ?2 ORDER BY p.day DESC LIMIT 1) AS value
FROM json_each(?1) AS k
`;

/**
 * One key's series: a value per day from the window's first day to today, each carrying the last
 * known value forward. Days before the first known value are dropped. With `candlesByDay`, the
 * series also has `candles` ([open, high, low, close] per day; a carried day is flat).
 * @param {{ baseline?: number|null, byDay: Map<string, number>, fromDay: string, today: string,
 *   candlesByDay?: Map<string, number[]> }} input
 * @returns {{ points: number[], days: string[], first: number, last: number, changePct: number, since: string, candles?: number[][] }|null}
 */
export function buildDailySeries({ baseline = null, byDay, fromDay, today, candlesByDay = null }) {
  const points = [];
  const days = [];
  const candles = [];
  let carry = Number.isFinite(baseline) ? baseline : null;
  for (let day = fromDay; day <= today; day = addDays(day, 1)) {
    const recorded = byDay.has(day);
    if (recorded) carry = byDay.get(day);
    if (carry === null) continue;
    points.push(carry);
    days.push(day);
    if (candlesByDay) candles.push(recorded && candlesByDay.has(day) ? candlesByDay.get(day) : [carry, carry, carry, carry]);
  }
  if (points.length === 0) return null;
  const first = points[0];
  const last = points[points.length - 1];
  return {
    points,
    days,
    first,
    last,
    changePct: first > 0 ? ((last - first) / first) * 100 : 0,
    since: tehranDayStart(days[0]),
    ...(candlesByDay ? { candles } : {}),
  };
}

/** A row's candle: [open, high, low, close] (columns missing on old rows fall back to the close) */
export function candleOf(row) {
  const close = Number(row.value);
  const num = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? close : Number(v));
  return [num(row.open), num(row.high), num(row.low), close];
}

/**
 * Daily series for asset keys over a window
 * @param {object} env - needs env.DB
 * @param {string[]} keys - asset ids (compared in the price book's id form, as they are recorded)
 * @param {{ range?: string, now?: number, candles?: boolean }} [options] - `candles` adds each
 *   day's [open, high, low, close]
 * @returns {Promise<Record<string, ReturnType<typeof buildDailySeries>>|null>} null when history
 *   is unavailable (no database, or a database error); keys without data are left out
 */
export async function readPriceTrends(env, keys, { range = DEFAULT_TREND_RANGE, now = Date.now(), candles = false } = {}) {
  if (!env?.DB?.prepare) return null;
  const { days } = TREND_RANGES[resolveTrendRange(range)];
  const wanted = [...new Set((keys || []).map(normalizePriceId).filter(Boolean))];
  if (wanted.length === 0) return {};

  const today = tehranDay(now);
  const fromDay = addDays(today, -(days - 1));
  const json = JSON.stringify(wanted);
  try {
    await ensureSchema(env);
    const [rowsRes, baseRes] = await env.DB.batch([
      env.DB.prepare(TREND_ROWS_SQL).bind(json, fromDay),
      env.DB.prepare(TREND_BASELINE_SQL).bind(json, fromDay),
    ]);
    const byKey = new Map();
    const candlesByKey = new Map();
    for (const row of rowsRes?.results || []) {
      if (!byKey.has(row.item_key)) {
        byKey.set(row.item_key, new Map());
        candlesByKey.set(row.item_key, new Map());
      }
      byKey.get(row.item_key).set(row.day, Number(row.value));
      if (candles) candlesByKey.get(row.item_key).set(row.day, candleOf(row));
    }
    const baselineByKey = new Map(
      (baseRes?.results || []).filter((row) => row.value !== null && row.value !== undefined).map((row) => [row.item_key, Number(row.value)]),
    );

    const result = {};
    for (const key of wanted) {
      const series = buildDailySeries({
        baseline: baselineByKey.get(key) ?? null,
        byDay: byKey.get(key) || new Map(),
        fromDay,
        today,
        candlesByDay: candles ? candlesByKey.get(key) || new Map() : null,
      });
      if (series) result[key] = series;
    }
    return result;
  } catch (err) {
    logger.warn("[PriceHistory] Read failed:", { error: err.message, keys: wanted.length });
    return null;
  }
}

/** ?1: the key, ?2: the last day → every recorded day's close up to it, oldest first */
export const FULL_HISTORY_SQL = `SELECT day, value FROM price_daily WHERE item_key = ?1 AND day <= ?2 ORDER BY day`;

/**
 * One key's whole daily history, as one close per day from its first recorded day to `through`
 * (today by default; a day without a row carries the last close). Clients read any past day's
 * price off it — a record's dollar rate, a compared asset's price on a purchase day — through the
 * snapshot in priceHistoryStore.repository.js, which reads this once a day.
 * @param {object} env - needs env.DB
 * @param {string} key - price book id
 * @param {{ now?: number, through?: string }} [options] - through: the last day (YYYY-MM-DD)
 * @returns {Promise<{ since: string, values: number[] }|null|undefined>} null when the history is
 *   unavailable, undefined when the key has none
 */
export async function readFullHistory(env, key, { now = Date.now(), through = tehranDay(now) } = {}) {
  if (!env?.DB?.prepare) return null;
  const id = normalizePriceId(key);
  if (!id) return undefined;
  try {
    await ensureSchema(env);
    const res = await env.DB.prepare(FULL_HISTORY_SQL).bind(id, through).all();
    const rows = res?.results || [];
    if (rows.length === 0) return undefined;
    const byDay = new Map(rows.map((r) => [r.day, Number(r.value)]));
    const series = buildDailySeries({ byDay, fromDay: rows[0].day, today: through });
    return series ? { since: series.days[0], values: series.points } : undefined;
  } catch (err) {
    logger.warn("[PriceHistory] Full read failed:", { error: err.message, key: id });
    return null;
  }
}

/**
 * ?1: the key, ?2: now (ms), ?3: candles as JSON [[day, open, high, low, close], …]. Days already
 * recorded are kept (OR IGNORE) unless the overwrite variant is used.
 */
const importDaysSql = (overwrite) => `
INSERT ${overwrite ? "OR REPLACE" : "OR IGNORE"} INTO price_daily (item_key, day, value, updated_at, open, high, low)
SELECT ?1, json_extract(p.value, '$[0]'), json_extract(p.value, '$[4]'), ?2,
       json_extract(p.value, '$[1]'), json_extract(p.value, '$[2]'), json_extract(p.value, '$[3]')
FROM json_each(?3) AS p
`;

/**
 * Write past days of one item from another source (a backfill). Today belongs to the live sync
 * and is never written; invalid candles are dropped.
 * @param {object} env - needs env.DB
 * @param {string} key - the item's price book id
 * @param {Array<{ day: string, open: number, high: number, low: number, close: number }>} candles
 * @param {{ overwrite?: boolean, now?: number }} [options] - overwrite: replace days already recorded
 * @returns {Promise<{ written: number, valid: number }>}
 */
export async function importDailyCandles(env, key, candles, { overwrite = false, now = Date.now() } = {}) {
  const itemKey = normalizePriceId(key);
  if (!env?.DB?.prepare || !itemKey) return { written: 0, valid: 0 };
  const today = tehranDay(now);
  const rows = [];
  for (const c of Array.isArray(candles) ? candles : []) {
    const day = String(c?.day || "");
    const vals = [c?.open, c?.high, c?.low, c?.close].map(Number);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day >= today) continue;
    if (!vals.every((v) => Number.isFinite(v) && v > 0)) continue;
    const [open, high, low, close] = vals;
    rows.push([day, open, Math.max(high, open, close), Math.min(low, open, close), close]);
  }
  if (!rows.length) return { written: 0, valid: 0 };
  await ensureSchema(env);
  let written = 0;
  // Groups well under D1's 2 MB bound value
  for (let i = 0; i < rows.length; i += 2000) {
    const res = await env.DB.prepare(importDaysSql(overwrite)).bind(itemKey, now, JSON.stringify(rows.slice(i, i + 2000))).run();
    written += Number(res?.meta?.changes) || 0;
  }
  return { written, valid: rows.length };
}

// ── Averages (domain/priceAverages.js) ─────────────────────────────────────────────────────

/**
 * ?1: keys (JSON array), ?2: the last day, ?3: the first day read, then each window's first day
 * in AVERAGE_WINDOWS order → per key, each window's sum and count of closes. One primary-key range
 * per key: only the rows inside the longest window are read.
 */
export const AVERAGE_SUMS_SQL = `
SELECT item_key, ${AVERAGE_WINDOW_KEYS.map((w, i) => `SUM(CASE WHEN day >= ?${i + 4} THEN value END) AS sum_${w}, COUNT(CASE WHEN day >= ?${i + 4} THEN 1 END) AS n_${w}`).join(", ")}
FROM price_daily
WHERE item_key IN (SELECT value FROM json_each(?1)) AND day >= ?3 AND day <= ?2
GROUP BY item_key
`;

/** ?1: keys (JSON array), ?2: days (JSON array) → those days' closes: a lookup per key and day */
export const AVERAGE_DAYS_SQL = `
SELECT item_key, day, value FROM price_daily
WHERE item_key IN (SELECT value FROM json_each(?1)) AND day IN (SELECT value FROM json_each(?2))
`;

/**
 * Each key's sum and count of closes per averaging window ending on `through`
 * @returns {Promise<Array<object>|null>} null when the history is unavailable
 */
export async function readAverageSums(env, keys, through) {
  if (!env?.DB?.prepare) return null;
  const starts = AVERAGE_WINDOW_KEYS.map((w) => windowStart(through, AVERAGE_WINDOWS[w].days));
  try {
    await ensureSchema(env);
    const res = await env.DB.prepare(AVERAGE_SUMS_SQL)
      .bind(JSON.stringify(keys), through, windowStart(through, AVERAGE_MAX_DAYS), ...starts)
      .all();
    return res?.results || [];
  } catch (err) {
    logger.warn("[PriceHistory] Average sums failed:", { error: err.message, keys: keys.length });
    return null;
  }
}

/**
 * The closes of a few days (the days an averages move reads)
 * @returns {Promise<Array<{ item_key: string, day: string, value: number }>|null>}
 */
export async function readDayCloses(env, keys, days) {
  if (!env?.DB?.prepare) return null;
  try {
    await ensureSchema(env);
    const res = await env.DB.prepare(AVERAGE_DAYS_SQL).bind(JSON.stringify(keys), JSON.stringify(days)).all();
    return res?.results || [];
  } catch (err) {
    logger.warn("[PriceHistory] Day closes failed:", { error: err.message, keys: keys.length });
    return null;
  }
}
