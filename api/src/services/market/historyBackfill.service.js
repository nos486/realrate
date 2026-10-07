/**
 * historyBackfill.service.js — Fill past days of the price history from tgju.org, which keeps a
 * daily candle for every series it tracks, so charts start with years of data
 *
 * - Mappings (D1 state, key `tgju_history_mappings`): which tgju series fills which price book
 *   item, in which unit (rial ÷ 10, toman, or usd × that day's dollar from our own history), with
 *   the last run's outcome. The admin builds them from the catalog (config/tgjuCatalog.js) or any
 *   slug, and can preview a series first (its latest days and the unit that matches the item).
 * - A run writes one candle per day with importDailyCandles: never today (the live sync owns it),
 *   days already recorded are kept unless `overwrite`, and nothing is written unless the item is
 *   in the live price book and tgju's newest price is within ×0.5–×2 of the item's live price.
 * - The history itself can be listed per id, and an id the book doesn't know moved or deleted.
 * Admin only: /api/admin/history/* (handlers/historyRoutes.js).
 */

import { importDailyCandles, tehranDay, addDays } from "../../repositories/priceHistory.repository.js";
import { dropHistorySnapshots } from "../../repositories/priceHistoryStore.repository.js";
import { resetPriceAverages } from "./priceAverages.service.js";
import { fetchTgjuSeries } from "./tgju.client.js";
import { normalizePriceId, currencyOf, usdSeriesKey, historyKeysOf, USD_SERIES_SUFFIX } from "../../domain/priceBook.js";
import { AppError } from "../../lib/AppError.js";
import { logger } from "../../lib/logger.js";
import { ensureSchema } from "../../repositories/schema.repository.js";
import { getPriceBookCache } from "../../repositories/priceBookStore.repository.js";
import { getStateStore } from "../../repositories/stateStore.repository.js";
import { TGJU_UNITS, normalizeTgjuSlug } from "../../config/tgjuCatalog.js";

/**
 * Past days of these keys changed: their history snapshots are rebuilt on the next read, and the
 * price averages are summed again (priceAverages.service.js)
 */
async function pastDaysChanged(env, keys) {
  await dropHistorySnapshots(env, keys);
  await resetPriceAverages(env);
}

export const MAX_BACKFILL_DAYS = 3650;
export const MAPPINGS_KEY = "tgju_history_mappings";

// The tgju client is shared with the live tgju source; its parsing helpers stay importable here
export { cellText, cellNumber, cellDay, parseTgjuRows, fetchTgjuSeries } from "./tgju.client.js";

/** Our dollar candles by day (for usd-priced series) */
async function usdCandles(env, fromDay, usdTarget) {
  const { results } = await env.DB.prepare(
    "SELECT day, value, open, high, low FROM price_daily WHERE item_key = ? AND day >= ?"
  ).bind(usdTarget, fromDay).all();
  return new Map((results || []).map((r) => [r.day, r]));
}

/**
 * tgju candles → tomans. usd: each day × that day's dollar candle (days without one are dropped;
 * high / low are products of the highs / lows, so an upper / lower bound)
 */
export async function toTomans(env, candles, unit, { fromDay = "0000-00-00", usdTarget = "usd" } = {}) {
  if (unit === "rial") return candles.map((c) => ({ day: c.day, open: c.open / 10, high: c.high / 10, low: c.low / 10, close: c.close / 10 }));
  if (unit === "toman") return candles;
  const usd = await usdCandles(env, fromDay, normalizePriceId(usdTarget));
  const out = [];
  for (const c of candles) {
    const u = usd.get(c.day);
    if (!u) continue;
    const close = Number(u.value);
    const num = (v) => (v === null || v === undefined ? close : Number(v));
    out.push({ day: c.day, open: c.open * num(u.open), high: c.high * num(u.high), low: c.low * num(u.low), close: c.close * close });
  }
  if (candles.length && !out.length) throw new AppError("اول تاریخچه‌ی دلار را بارگذاری کنید (این سری دلاری است)", 409, "NEEDS_USD_HISTORY");
  return out;
}

/** The book item a series may be written to, or an error naming the problem */
async function liveItem(env, target, getBook) {
  const id = normalizePriceId(target);
  const book = await getBook(env);
  const item = id ? book?.items?.[id] : null;
  if (!item) throw AppError.badRequest(`«${target || "-"}» در دفتر قیمت نیست؛ مورد مقصد را از فهرست انتخاب کنید`);
  return { id, item, usdLive: Number(book.items.usd?.price) || null };
}

/**
 * Which unit turns a tgju number into the item's live price: the one whose ratio is nearest 1
 * (within ×0.5–×2), or null
 */
export function guessUnit(raw, live, usdLive) {
  if (!(raw > 0) || !(live > 0)) return null;
  const options = [
    { unit: "rial", value: raw / 10 },
    { unit: "toman", value: raw },
    ...(usdLive > 0 ? [{ unit: "usd", value: raw * usdLive }] : []),
  ].map((o) => ({ ...o, ratio: o.value / live }));
  const fits = options.filter((o) => o.ratio > 0.5 && o.ratio < 2);
  if (!fits.length) return null;
  return fits.sort((a, b) => Math.abs(Math.log(a.ratio)) - Math.abs(Math.log(b.ratio)))[0];
}

/**
 * A series' latest days, and (with a target) the unit that matches the item's live price
 * @returns {Promise<{ slug: string, latest: Array<object>, target?: string, live?: number, guess?: object|null }>}
 */
export async function previewTgju(env, { slug: rawSlug, target, fetchImpl = fetch, getBook = getPriceBookCache } = {}) {
  const slug = normalizeTgjuSlug(rawSlug);
  if (!slug) throw AppError.badRequest("شناسه‌ی سری tgju نامعتبر است");
  const { candles } = await fetchTgjuSeries(slug, { fetchImpl, pageSize: 7, maxPages: 1 });
  if (!candles.length) throw new AppError(`سری «${slug}» در tgju داده‌ای ندارد`, 404, "TGJU_EMPTY");
  const out = { slug, latest: candles.slice(0, 7) };
  if (target) {
    const { id, item, usdLive } = await liveItem(env, target, getBook);
    out.target = id;
    out.live = Number(item.price) || null;
    out.guess = guessUnit(candles[0].close, out.live, usdLive);
  }
  return out;
}

/**
 * Backfill one price book item's past days from a tgju series
 * @param {object} env
 * @param {{ slug: string, target: string, unit: 'rial'|'toman'|'usd', usdTarget?: string, days?: number,
 *   overwrite?: boolean, fetchImpl?: typeof fetch, now?: number, getBook?: (env: object) => Promise<object|null> }} options
 * @returns {Promise<{ slug: string, target: string, unit: string, fetched: number, valid: number, written: number, from: string|null, to: string|null }>}
 */
export async function backfillPriceHistory(env, {
  slug: rawSlug,
  target,
  unit,
  usdTarget = "usd",
  days = 730,
  overwrite = false,
  fetchImpl = fetch,
  now = Date.now(),
  getBook = getPriceBookCache,
} = {}) {
  const slug = normalizeTgjuSlug(rawSlug);
  if (!slug) throw AppError.badRequest("شناسه‌ی سری tgju نامعتبر است");
  if (!TGJU_UNITS.includes(unit)) throw AppError.badRequest("واحد سری باید ریال، تومان یا دلار باشد");
  if (!env?.DB?.prepare) throw new AppError("پایگاه‌داده در دسترس نیست", 503, "NO_DATABASE");
  // Only a live price book item can receive history, so nothing lands under an id no card reads
  const { id, item } = await liveItem(env, target, getBook);
  await ensureSchema(env);
  const span = Math.min(Math.max(Number(days) || 730, 1), MAX_BACKFILL_DAYS);
  const fromDay = addDays(tehranDay(now), -span);

  const { fetched, candles: raw } = await fetchTgjuSeries(slug, { fromDay, fetchImpl });
  const candles = await toTomans(env, raw, unit, { fromDay, usdTarget });

  // A wrong unit or a wrong item would poison the chart: the newest candle must be near the
  // item's live price
  const newest = candles[0];
  const live = Number(item.price);
  if (newest && Number.isFinite(live) && live > 0) {
    const ratio = newest.close / live;
    if (!(ratio > 0.5 && ratio < 2)) {
      throw new AppError(`قیمت tgju (${Math.round(newest.close).toLocaleString("en")}) با قیمت فعلی «${item.name || id}» (${Math.round(live).toLocaleString("en")}) نمی‌خواند؛ واحد یا مقصد را بررسی کنید`, 502, "UPSTREAM_MISMATCH");
    }
  }

  const { written, valid } = await importDailyCandles(env, id, candles, { overwrite, now });
  // A dollar series of a dollar-priced item (the ounce, oil) also fills its dollar history as is
  let usdWritten = 0;
  if (unit === "usd" && currencyOf(item) === "usd") {
    usdWritten = (await importDailyCandles(env, usdSeriesKey(id), raw, { overwrite, now })).written;
  }
  if (written > 0 || usdWritten > 0) await pastDaysChanged(env, [id, usdSeriesKey(id)]);
  const daysSorted = candles.map((c) => c.day).sort();
  logger.info("[HistoryBackfill] Done:", { slug, target: id, unit, fetched, valid, written });
  return { slug, target: id, unit, fetched, valid, written, from: daysSorted[0] || null, to: daysSorted.at(-1) || null };
}

// ── Mappings ──────────────────────────────────────────────────────────────

/**
 * @typedef {{ slug: string, label: string, unit: 'rial'|'toman'|'usd', target: string,
 *   lastRun?: { at: string, ok: boolean, written?: number, from?: string|null, to?: string|null, error?: string } }} TgjuMapping
 */

/** @returns {Promise<TgjuMapping[]>} */
export async function getMappings(env) {
  const list = await getStateStore(env)?.get(MAPPINGS_KEY, "json").catch(() => null);
  return Array.isArray(list) ? list : [];
}

/**
 * Save the mappings (one per slug; unknown units and bad slugs dropped; lastRun kept from the
 * stored copy, so a client can't write one)
 * @param {object} env
 * @param {Array<Partial<TgjuMapping>>} input
 * @returns {Promise<TgjuMapping[]>}
 */
export async function saveMappings(env, input) {
  const store = getStateStore(env);
  if (!store) throw new AppError("پایگاه‌داده در دسترس نیست", 503, "NO_DATABASE");
  const stored = new Map((await getMappings(env)).map((m) => [m.slug, m]));
  const seen = new Set();
  const list = [];
  for (const m of Array.isArray(input) ? input : []) {
    const slug = normalizeTgjuSlug(m?.slug);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    list.push({
      slug,
      label: String(m.label || slug).slice(0, 80),
      unit: TGJU_UNITS.includes(m.unit) ? m.unit : "rial",
      target: normalizePriceId(m.target || ""),
      ...(stored.get(slug)?.lastRun ? { lastRun: stored.get(slug).lastRun } : {}),
    });
  }
  if (list.length > 300) throw AppError.badRequest("حداکثر ۳۰۰ نگاشت");
  await store.put(MAPPINGS_KEY, JSON.stringify(list));
  return list;
}

/** Note a run's outcome on its mapping */
export async function recordMappingRun(env, slug, run) {
  const list = await getMappings(env);
  const m = list.find((x) => x.slug === slug);
  if (!m) return;
  m.lastRun = { at: new Date().toISOString(), ...run };
  await getStateStore(env)?.put(MAPPINGS_KEY, JSON.stringify(list));
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
  const known = new Set(historyKeysOf(items));
  // A dollar series (`${id}@usd`) is named after its item
  const nameOf = (key) => items[key]?.name || (known.has(key) ? `${items[key.slice(0, -USD_SERIES_SUFFIX.length)]?.name} (دلار)` : null);
  return (results || []).map((r) => ({
    key: r.item_key,
    name: nameOf(r.item_key),
    inBook: known.has(r.item_key),
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
  await pastDaysChanged(env, [itemKey]);
  return Number(res?.meta?.changes) || 0;
}

/**
 * Drop the history of every id the live price book doesn't know (refused while the book is
 * empty, which would make every id look unknown)
 * @returns {Promise<{ keys: string[], deleted: number }>}
 */
export async function deleteOrphanKeys(env, { getBook = getPriceBookCache } = {}) {
  const book = await getBook(env);
  // The items' ids and the dollar series of the dollar-priced ones
  const known = historyKeysOf(book?.items);
  if (known.length < 5) throw new AppError("دفتر قیمت فعلاً در دسترس نیست؛ بعداً دوباره امتحان کنید", 503, "NO_PRICE_BOOK");
  await ensureSchema(env);
  const { results } = await env.DB.prepare(
    "SELECT DISTINCT item_key FROM price_daily WHERE item_key NOT IN (SELECT value FROM json_each(?))"
  ).bind(JSON.stringify(known)).all();
  const keys = (results || []).map((r) => r.item_key);
  if (!keys.length) return { keys, deleted: 0 };
  const res = await env.DB.prepare("DELETE FROM price_daily WHERE item_key IN (SELECT value FROM json_each(?))").bind(JSON.stringify(keys)).run();
  await pastDaysChanged(env, keys);
  return { keys, deleted: Number(res?.meta?.changes) || 0 };
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
  await pastDaysChanged(env, [src, dst]);
  const movedCount = Number(moved?.meta?.changes) || 0;
  return { moved: movedCount, dropped: (Number(dropped?.meta?.changes) || 0) - movedCount };
}
