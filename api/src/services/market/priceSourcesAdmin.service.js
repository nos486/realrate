/**
 * priceSourcesAdmin.service.js — The admin's price sources page: every source with what it is,
 * how often it is fetched and how its sync is doing, its items on demand, a dry-run test and a
 * sync of one source now
 *
 * The list is light: each source's config summary, schedule and status (domain/priceSources.js)
 * and a short preview — a catalog's thousands of items are loaded only when asked for (items).
 */

import { dbGetPriceSources } from "../../repositories/priceSource.repository.js";
import { getSourceItems } from "../../repositories/sourceItems.repository.js";
import { getPriceBookCache } from "../../repositories/priceBookStore.repository.js";
import { getMasterPriceSourceById } from "../../config/sources.config.js";
import { CATEGORY_MAP } from "../../config/categories.config.js";
import { sourceKindOf, sourceScheduleOf, guardOf, SOURCE_KIND_LABELS, QUOTE_LABELS } from "../../domain/priceSources.js";
import { getAdapterForSource } from "./sources/index.js";
import { syncAllSources } from "./sourceSync.service.js";

/** How often the scheduled sync runs (the Worker's cron: every minute) */
export const SYNC_TICK_SEC = 60;

/** Items shown in a multi-output or catalog source's row */
const PREVIEW_ITEMS = 3;

/**
 * One source as the admin sees it
 * @param {object} src - a source with its stored items (dbGetPriceSources)
 * @param {object|null} state - its entry in the price book's `sources`
 * @param {number} nowMs
 */
export function priceSourceView(src, state, nowMs = Date.now()) {
  const kind = sourceKindOf(src);
  const items = Array.isArray(src.items) ? src.items : [];
  const quote = src.quote || "toman";
  const adapter = getAdapterForSource(src);
  return {
    id: src.id,
    name: src.name,
    brand: src.brand || "",
    sourceType: src.sourceType,
    adapterName: adapter?.name || src.sourceType,
    kind,
    kindLabel: SOURCE_KIND_LABELS[kind],
    priceType: src.priceType,
    market: src.market || null,
    category: src.category || null,
    categoryName: CATEGORY_MAP[src.category]?.name || src.category || "",
    unit: src.unit || "",
    quote,
    quoteLabel: QUOTE_LABELS[quote] || quote,
    endpoint: src.endpoint || "",
    series: Array.isArray(src.series) ? src.series.map((s) => s.slug) : null,
    isActive: src.isActive !== false,
    isPrimary: Boolean(src.isPrimary),
    isReferenceRate: Boolean(src.isReferenceRate),
    // The jump guard as the sync applies it (domain/priceGuard.js)
    guard: guardOf(src),
    schedule: sourceScheduleOf(src, state, nowMs),
    count: items.length,
    held: Object.keys(state?.held || {}).length,
    price: kind === "single" ? Number(items[0]?.price) || null : null,
    preview: kind === "single" ? [] : items.slice(0, PREVIEW_ITEMS).map(({ id, name, price }) => ({ id, name, price })),
  };
}

/**
 * Every source for the admin, with a summary of their states
 * @param {object} env
 * @returns {Promise<{ tickSec: number, summary: Record<string, number>, sources: Array<object> }>}
 */
export async function listPriceSourcesForAdmin(env, nowMs = Date.now()) {
  const book = await getPriceBookCache(env);
  const sources = (await dbGetPriceSources(env, { book })).map((src) => priceSourceView(src, book?.sources?.[src.id] || null, nowMs));
  const summary = { total: sources.length, ok: 0, error: 0, stale: 0, pending: 0, off: 0 };
  for (const s of sources) summary[s.schedule.status]++;
  return { tickSec: SYNC_TICK_SEC, summary, sources };
}

/**
 * A source's items as its last sync stored them
 * @param {object} env
 * @param {string} id
 */
export async function priceSourceItemsForAdmin(env, id) {
  if (!getMasterPriceSourceById(id)) return null;
  return getSourceItems(env, id);
}

/**
 * Sync one source now, through the same pipeline as the cron (guard, storage, price book, history)
 * @param {object} env
 * @param {string} id
 * @returns {Promise<{ success: boolean, count?: number, error?: string }>}
 */
export async function syncPriceSourceNow(env, id) {
  if (!getMasterPriceSourceById(id)) return { success: false, error: "سورس پیدا نشد." };
  const { results } = await syncAllSources(env, { forceAll: true, sourceIds: [id] });
  const result = results.find((r) => r.sourceId === id);
  if (!result) return { success: false, error: "سورس غیرفعال است." };
  return result.success ? { success: true, count: result.itemsCount } : { success: false, error: result.error };
}
