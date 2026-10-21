/**
 * tgju.client.js — Read tgju.org: its daily series (the summary table: one candle per day, newest
 * first), for the history backfill (historyBackfill.service.js: years of past days), and its live
 * feed (the one the site's own pages poll: every series' current price), for the live tgju source
 * (sources/tgjuIndicators.source.adapter.js), which falls back to a series' summary table.
 *
 * A series is named by its slug, the last part of its page address (tgju.org/profile/<slug>); the
 * live feed keys its series by the same slug. Numbers come in the series' own unit (rial for most);
 * callers convert.
 */

import { AppError } from "../../lib/AppError.js";
import { logger } from "../../lib/logger.js";
import { jalaliToGregorian } from "../../domain/loanCalculator.js";

export const TGJU_URL = "https://api.tgju.org/v1/market/indicator/summary-table-data/";
/** tgju's live feed: `{ current: { [slug]: { p, h, l, ts, ... } } }`. The summary table only
 *  gains a day's row once that day has closed, so its newest close lags the market; this is not. */
export const TGJU_LIVE_URL = "https://call1.tgju.org/ajax.json";
const PAGE = 500;
/** How long one tgju request may take: the live source is read every minute, with every other
 *  source, so a slow tgju must never hold the sync up */
export const TGJU_TIMEOUT_MS = 10_000;
const MAX_PAGES = 12;

const toLatinDigits = (s) =>
  s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660));

/** A table cell as plain text (tgju wraps some cells in HTML) */
export function cellText(cell) {
  return toLatinDigits(String(cell ?? "").replace(/<[^>]*>/g, "")).trim();
}

/** A price cell ("1,234,500") as a number, or NaN */
export function cellNumber(cell) {
  const text = cellText(cell).replace(/[,\s٬]/g, "");
  return /^\d+(\.\d+)?$/.test(text) ? Number(text) : NaN;
}

/** The row's day (YYYY-MM-DD, Gregorian) from a Gregorian or a Jalali date cell */
export function cellDay(cells) {
  const dates = cells.map(cellText).map((t) => t.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)).filter(Boolean);
  const greg = dates.find((m) => Number(m[1]) > 1900);
  if (greg) return `${greg[1]}-${greg[2].padStart(2, "0")}-${greg[3].padStart(2, "0")}`;
  const jal = dates.find((m) => Number(m[1]) > 1300 && Number(m[1]) < 1500);
  if (!jal) return null;
  const g = jalaliToGregorian(Number(jal[1]), Number(jal[2]), Number(jal[3]));
  return `${g.year}-${String(g.month).padStart(2, "0")}-${String(g.day).padStart(2, "0")}`;
}

/**
 * tgju summary-table rows → candles. A row's first four price cells are open, low, high, close;
 * high and low are taken as the max / min of the four, whichever order the table uses.
 * @param {Array<Array<unknown>|object>} rows
 * @param {number} divisor - 10 for rials → tomans
 */
export function parseTgjuRows(rows, divisor = 1) {
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const cells = Array.isArray(row) ? row : Object.values(row || {});
    const prices = cells.map(cellNumber).filter((n) => Number.isFinite(n) && n > 0);
    const day = cellDay(cells);
    if (!day || prices.length < 4) continue;
    const [open, a, b, close] = prices.slice(0, 4).map((n) => n / divisor);
    out.push({ day, open, high: Math.max(open, a, b, close), low: Math.min(open, a, b, close), close });
  }
  return out;
}

export async function fetchTgjuPage(slug, start, length, fetchImpl) {
  const url = `${TGJU_URL}${slug}?start=${start}&length=${length}&order_dir=desc`;
  const res = await fetchImpl(url, {
    signal: AbortSignal.timeout(TGJU_TIMEOUT_MS),
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (RealRate price history)" },
  });
  if (res.status === 404) throw new AppError(`سری «${slug}» در tgju پیدا نشد`, 404, "TGJU_NOT_FOUND");
  if (!res.ok) throw new AppError(`tgju پاسخ ${res.status} داد`, 502, "UPSTREAM_ERROR");
  const body = await res.json().catch(() => null);
  if (!body || !Array.isArray(body.data)) throw new AppError("پاسخ tgju قابل خواندن نبود", 502, "UPSTREAM_ERROR");
  return body.data;
}

/**
 * A tgju series' daily candles, as tgju gives them (its own unit), newest first, back to `fromDay`
 * @returns {Promise<{ fetched: number, candles: Array<{ day: string, open: number, high: number, low: number, close: number }> }>}
 */
export async function fetchTgjuSeries(slug, { fromDay, fetchImpl = fetch, pageSize = PAGE, maxPages = MAX_PAGES } = {}) {
  const candles = [];
  let fetched = 0;
  for (let page = 0; page < maxPages; page++) {
    const rows = await fetchTgjuPage(slug, page * pageSize, pageSize, fetchImpl);
    fetched += rows.length;
    const parsed = parseTgjuRows(rows, 1);
    if (rows.length && !parsed.length) {
      logger.warn("[HistoryBackfill] Unreadable tgju rows:", { slug, sample: JSON.stringify(rows[0]).slice(0, 300) });
      throw new AppError("ردیف‌های tgju قابل خواندن نبودند", 502, "UPSTREAM_ERROR");
    }
    candles.push(...(fromDay ? parsed.filter((c) => c.day >= fromDay) : parsed));
    const oldest = parsed.reduce((min, c) => (c.day < min ? c.day : min), "9999");
    if (rows.length < pageSize || (fromDay && oldest < fromDay)) break;
  }
  candles.sort((a, b) => (a.day < b.day ? 1 : -1));
  return { fetched, candles };
}

/**
 * A series' latest candle (its newest day), as tgju gives it (its own unit)
 * @param {string} slug
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ day: string, open: number, high: number, low: number, close: number }>}
 */
export async function fetchTgjuLatest(slug, fetchImpl = fetch) {
  const [latest] = parseTgjuRows(await fetchTgjuPage(slug, 0, 1, fetchImpl), 1);
  if (!latest) throw new AppError(`سری «${slug}» در tgju مقداری نداشت`, 502, "UPSTREAM_ERROR");
  return latest;
}

/**
 * Every series' current price from tgju's live feed, as tgju gives it (its own unit)
 *
 * The feed sits behind a CDN that caches it for minutes; a query that changes every minute asks
 * past it (the source is read every few minutes, so this is still one request per read).
 * @param {typeof fetch} [fetchImpl]
 * @param {number} [nowMs]
 * @returns {Promise<Record<string, { price: number, high?: number, low?: number, ts?: string }>>} by slug
 */
export async function fetchTgjuCurrent(fetchImpl = fetch, nowMs = Date.now()) {
  const res = await fetchImpl(`${TGJU_LIVE_URL}?rev=${Math.floor(nowMs / 60_000)}`, {
    signal: AbortSignal.timeout(TGJU_TIMEOUT_MS),
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (RealRate live prices)" },
  });
  if (!res.ok) throw new AppError(`tgju پاسخ ${res.status} داد`, 502, "UPSTREAM_ERROR");
  const body = await res.json().catch(() => null);
  return parseTgjuCurrent(body?.current);
}

/**
 * The live feed's `current` object → each series' price (a series without a positive price is left out)
 * @param {Record<string, object>} current
 */
export function parseTgjuCurrent(current) {
  if (!current || typeof current !== "object") throw new AppError("پاسخ زنده‌ی tgju قابل خواندن نبود", 502, "UPSTREAM_ERROR");
  const out = {};
  for (const [slug, row] of Object.entries(current)) {
    const price = cellNumber(row?.p);
    if (!(price > 0)) continue;
    const high = cellNumber(row?.h);
    const low = cellNumber(row?.l);
    out[slug] = {
      price,
      ...(high > 0 ? { high } : {}),
      ...(low > 0 ? { low } : {}),
      ...(row?.ts ? { ts: String(row.ts) } : {}),
    };
  }
  return out;
}
