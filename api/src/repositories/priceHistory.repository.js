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

export const DAY_SEC = 86400;

/** Trend windows, in days (one point per day). "1d" — the old per-minute day — is a week now */
export const TREND_RANGES = {
  "7d": { days: 7, bucketSec: DAY_SEC },
  "30d": { days: 30, bucketSec: DAY_SEC },
  "90d": { days: 90, bucketSec: DAY_SEC },
  "1y": { days: 365, bucketSec: DAY_SEC },
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
 * ?1: the day, ?2: now (ms), ?3: the points as JSON [[key, value], …]. A row is (re)written only
 * when there is none for the day or its value changed. (`WHERE true` lets SQLite read the
 * ON CONFLICT clause of an INSERT … SELECT.)
 */
export const UPSERT_DAY_SQL = `
INSERT INTO price_daily (item_key, day, value, updated_at)
SELECT json_extract(p.value, '$[0]'), ?1, json_extract(p.value, '$[1]'), ?2
FROM json_each(?3) AS p
WHERE true
ON CONFLICT (item_key, day) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
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
SELECT item_key, day, value FROM price_daily
WHERE item_key IN (SELECT value FROM json_each(?1)) AND day >= ?2
ORDER BY item_key, day
`;

/** ?1: keys (JSON array), ?2: first day → each key's last value before the window */
export const TREND_BASELINE_SQL = `
SELECT p.item_key, p.value FROM price_daily p
JOIN (
  SELECT item_key, MAX(day) AS day FROM price_daily
  WHERE item_key IN (SELECT value FROM json_each(?1)) AND day < ?2
  GROUP BY item_key
) last ON last.item_key = p.item_key AND last.day = p.day
`;

/**
 * One key's series: a value per day from the window's first day to today, each carrying the last
 * known value forward. Days before the first known value are dropped.
 * @param {{ baseline?: number|null, byDay: Map<string, number>, fromDay: string, today: string }} input
 * @returns {{ points: number[], days: string[], first: number, last: number, changePct: number, since: string }|null}
 */
export function buildDailySeries({ baseline = null, byDay, fromDay, today }) {
  const points = [];
  const days = [];
  let carry = Number.isFinite(baseline) ? baseline : null;
  for (let day = fromDay; day <= today; day = addDays(day, 1)) {
    if (byDay.has(day)) carry = byDay.get(day);
    if (carry === null) continue;
    points.push(carry);
    days.push(day);
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
  };
}

/**
 * Daily series for asset keys over a window
 * @param {object} env - needs env.DB
 * @param {string[]} keys - asset ids (compared in the price book's id form, as they are recorded)
 * @param {{ range?: string, now?: number }} [options]
 * @returns {Promise<Record<string, ReturnType<typeof buildDailySeries>>|null>} null when history
 *   is unavailable (no database, or a database error); keys without data are left out
 */
export async function readPriceTrends(env, keys, { range = DEFAULT_TREND_RANGE, now = Date.now() } = {}) {
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
    for (const row of rowsRes?.results || []) {
      if (!byKey.has(row.item_key)) byKey.set(row.item_key, new Map());
      byKey.get(row.item_key).set(row.day, Number(row.value));
    }
    const baselineByKey = new Map((baseRes?.results || []).map((row) => [row.item_key, Number(row.value)]));

    const result = {};
    for (const key of wanted) {
      const series = buildDailySeries({
        baseline: baselineByKey.get(key) ?? null,
        byDay: byKey.get(key) || new Map(),
        fromDay,
        today,
      });
      if (series) result[key] = series;
    }
    return result;
  } catch (err) {
    logger.warn("[PriceHistory] Read failed:", { error: err.message, keys: wanted.length });
    return null;
  }
}
