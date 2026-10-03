/**
 * historyBackfill.service.js — Fill past days of the price history from a source that keeps a
 * daily history (tgju.org), so charts start with years of data instead of the day we started
 *
 * tgju's summary table gives one candle per trading day: open, low, high, close (in rials) and
 * the Gregorian and Jalali dates. Rows are turned into [open, high, low, close] in tomans and
 * written with importDailyCandles (days we already recorded are kept unless `overwrite`).
 * Admin only: POST /api/admin/price-history/backfill.
 */

import { importDailyCandles, tehranDay, addDays } from "../../repositories/priceHistory.repository.js";
import { jalaliToGregorian } from "../../domain/loanCalculator.js";
import { AppError } from "../../lib/AppError.js";
import { logger } from "../../lib/logger.js";
import { ensureSchema } from "../../repositories/schema.repository.js";

/**
 * Items that can be backfilled: the price book id → tgju's indicator and how its numbers become
 * tomans — `divisor: 10` for rials, `timesUsd` for dollar prices (each day × that day's dollar
 * close from our own history, so the dollar goes first). Order matters for "all": the dollar
 * leads. A wrong indicator or unit fails safely (unreadable answer, or the price check below).
 */
export const BACKFILL_SOURCES = {
  usd: { indicator: "price_dollar_rl", divisor: 10, label: "دلار آزاد" },
  gold_18k: { indicator: "geram18", divisor: 10, label: "طلای ۱۸ عیار" },
  mesghal: { indicator: "mesghal", divisor: 10, label: "مثقال طلا" },
  full_coin: { indicator: "sekee", divisor: 10, label: "سکه تمام بهار آزادی" },
  half_coin: { indicator: "nim", divisor: 10, label: "نیم سکه" },
  quarter_coin: { indicator: "rob", divisor: 10, label: "ربع سکه" },
  ons_gold: { indicator: "ons", timesUsd: true, label: "انس طلا" },
  ons_silver: { indicator: "silver", timesUsd: true, label: "انس نقره" },
  eur: { indicator: "price_eur", divisor: 10, label: "یورو" },
  gbp: { indicator: "price_gbp", divisor: 10, label: "پوند" },
  aed: { indicator: "price_aed", divisor: 10, label: "درهم امارات" },
  try: { indicator: "price_try", divisor: 10, label: "لیر ترکیه" },
  cny: { indicator: "price_cny", divisor: 10, label: "یوان چین" },
};

const TGJU_URL = "https://api.tgju.org/v1/market/indicator/summary-table-data/";
const PAGE = 500;
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

async function fetchTgjuPage(indicator, start, fetchImpl) {
  const url = `${TGJU_URL}${indicator}?start=${start}&length=${PAGE}&order_dir=desc`;
  const res = await fetchImpl(url, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (RealRate price history)" },
  });
  if (!res.ok) throw new AppError(`tgju پاسخ ${res.status} داد`, 502, "UPSTREAM_ERROR");
  const body = await res.json().catch(() => null);
  if (!body || !Array.isArray(body.data)) throw new AppError("پاسخ tgju قابل خواندن نبود", 502, "UPSTREAM_ERROR");
  return body.data;
}

/**
 * Backfill one item's past days
 * @param {object} env
 * @param {{ key?: string, days?: number, overwrite?: boolean, fetchImpl?: typeof fetch, now?: number }} options
 * @returns {Promise<{ key: string, source: string, fetched: number, valid: number, written: number, from: string|null, to: string|null }>}
 */
/** Dollar candles × each day's dollar candle from our history (days without one are dropped) */
async function inTomans(env, candles, fromDay) {
  const { results } = await env.DB.prepare(
    "SELECT day, value, open, high, low FROM price_daily WHERE item_key = 'usd' AND day >= ?"
  ).bind(fromDay).all();
  const usd = new Map((results || []).map((r) => [r.day, r]));
  const out = [];
  for (const c of candles) {
    const u = usd.get(c.day);
    if (!u) continue;
    const close = Number(u.value);
    const num = (v) => (v === null || v === undefined ? close : Number(v));
    out.push({ day: c.day, open: c.open * num(u.open), high: c.high * num(u.high), low: c.low * num(u.low), close: c.close * close });
  }
  if (candles.length && !out.length) throw new AppError("اول تاریخچه‌ی دلار را بارگذاری کنید", 409, "NEEDS_USD_HISTORY");
  return out;
}

export async function backfillPriceHistory(env, { key = "usd", days = 730, overwrite = false, fetchImpl = fetch, now = Date.now() } = {}) {
  const source = BACKFILL_SOURCES[key];
  if (!source) throw AppError.badRequest(`برای «${key}» منبع تاریخچه تعریف نشده است`);
  if (!env?.DB?.prepare) throw new AppError("پایگاه‌داده در دسترس نیست", 503, "NO_DATABASE");
  await ensureSchema(env);
  const span = Math.min(Math.max(Number(days) || 730, 1), 3650);
  const fromDay = addDays(tehranDay(now), -span);

  let candles = [];
  let fetched = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await fetchTgjuPage(source.indicator, page * PAGE, fetchImpl);
    fetched += rows.length;
    const parsed = parseTgjuRows(rows, source.divisor || 1);
    if (rows.length && !parsed.length) {
      logger.warn("[HistoryBackfill] Unreadable tgju rows:", { sample: JSON.stringify(rows[0]).slice(0, 300) });
      throw new AppError("ردیف‌های tgju قابل خواندن نبودند", 502, "UPSTREAM_ERROR");
    }
    candles.push(...parsed.filter((c) => c.day >= fromDay));
    const oldest = parsed.reduce((min, c) => (c.day < min ? c.day : min), "9999");
    if (rows.length < PAGE || oldest < fromDay) break;
  }

  if (source.timesUsd) candles = await inTomans(env, candles, fromDay);

  // A wrong unit or indicator would poison the chart: the newest candle must be near the price
  // we last recorded (an item we have never priced can't be checked, so it isn't written)
  const newest = candles.reduce((a, c) => (!a || c.day > a.day ? c : a), null);
  if (newest) {
    const ours = await env.DB.prepare("SELECT value FROM price_daily WHERE item_key = ? ORDER BY day DESC LIMIT 1").bind(key).first().catch(() => null);
    if (!ours) throw new AppError(`برای «${source.label}» هنوز قیمتی ثبت نشده که داده‌ی tgju با آن سنجیده شود`, 409, "NO_LIVE_PRICE");
    const ratio = newest.close / Number(ours.value);
    if (!(ratio > 0.5 && ratio < 2)) {
      throw new AppError(`قیمت tgju (${Math.round(newest.close)}) با قیمت ثبت‌شده (${Math.round(Number(ours.value))}) نمی‌خواند`, 502, "UPSTREAM_MISMATCH");
    }
  }

  const { written, valid } = await importDailyCandles(env, key, candles, { overwrite, now });
  const daysSorted = candles.map((c) => c.day).sort();
  logger.info("[HistoryBackfill] Done:", { key, fetched, valid, written });
  return { key, label: source.label, source: "tgju", fetched, valid, written, from: daysSorted[0] || null, to: daysSorted.at(-1) || null };
}
