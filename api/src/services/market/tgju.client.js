/**
 * tgju.client.js — Read tgju.org's daily series (its summary table: one candle per day, newest
 * first), shared by the history backfill (historyBackfill.service.js: years of past days) and the
 * live tgju source (sources/tgjuIndicators.source.adapter.js: each series' latest value)
 *
 * A series is named by its slug, the last part of its page address (tgju.org/profile/<slug>).
 * Numbers come in the series' own unit (rial for most); callers convert.
 */

import { AppError } from "../../lib/AppError.js";
import { logger } from "../../lib/logger.js";
import { jalaliToGregorian } from "../../domain/loanCalculator.js";

export const TGJU_URL = "https://api.tgju.org/v1/market/indicator/summary-table-data/";
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
