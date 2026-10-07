/**
 * priceAggregator.service.js — Reading the price book, and admin tools for price sources
 *
 * Every price is in the price book ("prices", domain/priceBook.js), written by the sync
 * (sourceSync.service.js). Nothing here keeps another copy of a price; a source's test is a dry run.
 */

import { dbGetPriceSources } from "../../repositories/priceSource.repository.js";
import { getPriceBookCache, setPriceBookCache } from "../../repositories/priceBookStore.repository.js";
import { buildPriceBook } from "../../domain/priceBook.js";
import { legacyPricesOf } from "../../domain/priceBookViews.js";
import { getAdapterForSource } from "./sources/index.js";
import { logger } from "../../lib/logger.js";
import { getMasterPriceSourceById } from "../../config/sources.config.js";
import { withDayRange } from "./sourceSync.service.js";

/**
 * Rebuild the price book from what every source last gave (no fetching), keeping each source's
 * sync state and each item's day range and change (withDayRange). Called after an admin changes a
 * source.
 * @param {object} env
 * @returns {Promise<object|null>} the book
 */
export async function refreshPriceBook(env) {
  if (!env) return null;
  try {
    const previous = await getPriceBookCache(env, { fresh: true });
    const sources = await dbGetPriceSources(env, { book: previous });
    const book = withDayRange(buildPriceBook(sources.filter((s) => s.isActive !== false).map((s) => ({
      ...s,
      lastFetched: s.lastFetched || null,
    })), { sourceStates: previous?.sources || {} }), previous, Date.now());
    await setPriceBookCache(env, book);
    return book;
  } catch (e) {
    logger.warn("refreshPriceBook error:", { error: e.message });
    return null;
  }
}

/**
 * The price book: every price in the standard shape (see domain/priceBook.js), from the state store ("prices").
 * Built from the sources' stored items when none is stored yet.
 * @param {object} env
 * @returns {Promise<{ updatedAt: string, items: Record<string, object>, sources?: object }>}
 */
export async function getPriceBook(env) {
  const cached = await getPriceBookCache(env);
  if (cached?.items && Object.keys(cached.items).length > 0) return cached;
  const sources = await dbGetPriceSources(env, { book: cached }).catch(() => []);
  const book = buildPriceBook((sources || []).filter((s) => s.isActive !== false), {
    sourceStates: cached?.sources || {},
  });
  // Only a book with source prices is worth keeping (the next sync rewrites it anyway)
  if (Object.values(book.items).some((item) => item.sourceId)) await setPriceBookCache(env, book);
  return book;
}

/**
 * Every price, in the older /api/prices shape (see priceBookViews.legacyPricesOf)
 * @param {object} env
 * @param {boolean} [forceRefresh=false] - fetch every source first
 * @returns {Promise<object>}
 */
export async function fetchAllPrices(env, forceRefresh = false) {
  if (forceRefresh) {
    const { syncAllSources } = await import("./sourceSync.service.js");
    const { book } = await syncAllSources(env, { forceAll: true });
    if (book) return legacyPricesOf(book);
  }
  return legacyPricesOf(await getPriceBook(env));
}

/** Items a test shows (a catalog's thousands are summarized) */
const TEST_SAMPLE = 50;

/**
 * Try a source now without keeping anything: fetch, parse, and what came back (a dry run of the
 * sync's first two steps — nothing is stored, guarded or put in the book)
 * @param {object} env
 * @param {string} id - a configured source's id
 * @returns {Promise<{ success: boolean, error?: string, count?: number, sample?: Array<object>,
 *   price?: number|null, datetime?: string, ms: number }>}
 */
export async function testPriceSource(env, id) {
  const started = Date.now();
  const src = id ? getMasterPriceSourceById(id) : null;
  if (!src) return { success: false, error: "سورس پیدا نشد.", ms: 0 };
  const adapter = getAdapterForSource(src);
  if (!adapter) return { success: false, error: `آداپتری برای «${src.sourceType}» نیست.`, ms: 0 };
  try {
    const { items, datetime } = await adapter.parse(await adapter.fetchRaw(src, env), src);
    const list = Array.isArray(items) ? items : [];
    return {
      success: list.length > 0,
      ...(list.length ? {} : { error: "هیچ قیمتی برنگشت." }),
      count: list.length,
      sample: list.slice(0, TEST_SAMPLE),
      price: list.length === 1 ? Number(list[0].price) || null : null,
      datetime,
      ms: Date.now() - started,
    };
  } catch (err) {
    return { success: false, error: err?.message || "خطا در دریافت", ms: Date.now() - started };
  }
}
