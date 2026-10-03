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
import { getPriceBookCache } from "../../repositories/priceBookStore.repository.js";
import { normalizePriceId } from "../../domain/priceBook.js";

/**
 * tgju indicators that can be backfilled, and how their numbers become tomans — `divisor: 10`
 * for rials, `timesUsd` for dollar prices (each day × that day's dollar close from our own
 * history of `usdTarget`, so the dollar goes first). Which price book item a series is written to
 * is the admin's choice (`target`); `suggest` is the book id offered first when the book has it.
 */
export const BACKFILL_SOURCES = {
  price_dollar_rl: { divisor: 10, label: "دلار آزاد", suggest: "usd" },
  geram18: { divisor: 10, label: "طلای ۱۸ عیار", suggest: "gold_18k" },
  mesghal: { divisor: 10, label: "مثقال طلا", suggest: "mesghal" },
  sekee: { divisor: 10, label: "سکه تمام بهار آزادی", suggest: "full_coin" },
  nim: { divisor: 10, label: "نیم سکه", suggest: "half_coin" },
  rob: { divisor: 10, label: "ربع سکه", suggest: "quarter_coin" },
  ons: { timesUsd: true, label: "انس طلا (دلار × دلار روز)", suggest: "ons_gold" },
  silver: { timesUsd: true, label: "انس نقره (دلار × دلار روز)", suggest: "ons_silver" },
  price_eur: { divisor: 10, label: "یورو", suggest: "eur" },
  price_gbp: { divisor: 10, label: "پوند", suggest: "gbp" },
  price_aed: { divisor: 10, label: "درهم امارات", suggest: "aed" },
  price_try: { divisor: 10, label: "لیر ترکیه", suggest: "try" },
  price_cny: { divisor: 10, label: "یوان چین", suggest: "cny" },
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

/** Dollar candles × each day's dollar candle from our history (days without one are dropped) */
async function inTomans(env, candles, fromDay, usdTarget) {
  const { results } = await env.DB.prepare(
    "SELECT day, value, open, high, low FROM price_daily WHERE item_key = ? AND day >= ?"
  ).bind(usdTarget, fromDay).all();
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

/**
 * Backfill one price book item's past days from a tgju indicator
 * @param {object} env
 * @param {{ source: string, target: string, usdTarget?: string, days?: number, overwrite?: boolean,
 *   fetchImpl?: typeof fetch, now?: number, getBook?: (env: object) => Promise<object|null> }} options
 *   target: the price book id the days are written to (must be in the live book)
 * @returns {Promise<{ source: string, target: string, label: string, fetched: number, valid: number, written: number, from: string|null, to: string|null }>}
 */
export async function backfillPriceHistory(env, {
  source: sourceId,
  target: rawTarget,
  usdTarget = "usd",
  days = 730,
  overwrite = false,
  fetchImpl = fetch,
  now = Date.now(),
  getBook = getPriceBookCache,
} = {}) {
  const source = BACKFILL_SOURCES[sourceId];
  if (!source) throw AppError.badRequest(`منبع تاریخچه‌ی «${sourceId}» تعریف نشده است`);
  if (!env?.DB?.prepare) throw new AppError("پایگاه‌داده در دسترس نیست", 503, "NO_DATABASE");
  // Only a live price book item can receive history, so nothing lands under an id no card reads
  const target = normalizePriceId(rawTarget);
  const book = await getBook(env);
  const item = target ? book?.items?.[target] : null;
  if (!item) throw AppError.badRequest(`«${rawTarget || "-"}» در دفتر قیمت نیست؛ مورد مقصد را از فهرست انتخاب کنید`);
  await ensureSchema(env);
  const span = Math.min(Math.max(Number(days) || 730, 1), 3650);
  const fromDay = addDays(tehranDay(now), -span);

  let candles = [];
  let fetched = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await fetchTgjuPage(sourceId, page * PAGE, fetchImpl);
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

  if (source.timesUsd) candles = await inTomans(env, candles, fromDay, normalizePriceId(usdTarget));

  // A wrong unit or a wrong item would poison the chart: the newest candle must be near the
  // item's live price
  const newest = candles.reduce((a, c) => (!a || c.day > a.day ? c : a), null);
  const live = Number(item.price);
  if (newest && Number.isFinite(live) && live > 0) {
    const ratio = newest.close / live;
    if (!(ratio > 0.5 && ratio < 2)) {
      throw new AppError(`قیمت tgju (${Math.round(newest.close).toLocaleString("en")}) با قیمت فعلی «${item.name || target}» (${Math.round(live).toLocaleString("en")}) نمی‌خواند`, 502, "UPSTREAM_MISMATCH");
    }
  }

  const { written, valid } = await importDailyCandles(env, target, candles, { overwrite, now });
  const daysSorted = candles.map((c) => c.day).sort();
  logger.info("[HistoryBackfill] Done:", { source: sourceId, target, fetched, valid, written });
  return { source: sourceId, target, label: source.label, fetched, valid, written, from: daysSorted[0] || null, to: daysSorted.at(-1) || null };
}

// ── What the history holds, and fixing it ─────────────────────────────────

/**
 * Every item in the history: days, first and last day, and whether the live price book has it
 * (rows under an id the book doesn't know are read by no card)
 */
export async function listHistoryKeys(env, { getBook = getPriceBookCache } = {}) {
  if (!env?.DB?.prepare) return [];
  await ensureSchema(env);
  const [{ results }, book] = await Promise.all([
    env.DB.prepare("SELECT item_key, COUNT(*) AS days, MIN(day) AS first, MAX(day) AS last FROM price_daily GROUP BY item_key ORDER BY item_key").all(),
    getBook(env),
  ]);
  const items = book?.items || {};
  return (results || []).map((r) => ({
    key: r.item_key,
    name: items[r.item_key]?.name || null,
    inBook: Boolean(items[r.item_key]),
    days: Number(r.days),
    first: r.first,
    last: r.last,
  }));
}

/** Drop an item's whole history. @returns {Promise<number>} rows deleted */
export async function deleteHistoryKey(env, key) {
  const itemKey = normalizePriceId(key);
  if (!itemKey) throw AppError.badRequest("شناسه لازم است");
  await ensureSchema(env);
  const res = await env.DB.prepare("DELETE FROM price_daily WHERE item_key = ?").bind(itemKey).run();
  return Number(res?.meta?.changes) || 0;
}

/**
 * Move an item's history to another id (days the destination already has are kept there), in
 * one transaction. @returns {Promise<{ moved: number, dropped: number }>}
 */
export async function moveHistoryKey(env, from, to, { getBook = getPriceBookCache } = {}) {
  const src = normalizePriceId(from);
  const dst = normalizePriceId(to);
  if (!src || !dst || src === dst) throw AppError.badRequest("مبدأ و مقصد باید متفاوت باشند");
  const book = await getBook(env);
  if (!book?.items?.[dst]) throw AppError.badRequest(`«${to}» در دفتر قیمت نیست`);
  await ensureSchema(env);
  const [moved, dropped] = await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO price_daily (item_key, day, value, updated_at, open, high, low)
       SELECT ?2, day, value, updated_at, open, high, low FROM price_daily WHERE item_key = ?1`
    ).bind(src, dst),
    env.DB.prepare("DELETE FROM price_daily WHERE item_key = ?").bind(src),
  ]);
  const movedCount = Number(moved?.meta?.changes) || 0;
  return { moved: movedCount, dropped: (Number(dropped?.meta?.changes) || 0) - movedCount };
}
