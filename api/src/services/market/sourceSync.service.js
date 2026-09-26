/**
 * sourceSync.service.js — The one pipeline every price goes through
 *
 * Per tick:
 *   1. Read the price book (KV "prices"): it holds when each source last synced
 *   2. Pick the active sources whose fetchIntervalSec is due (all of them with forceAll, or only
 *      `sourceIds` when given)
 *   3. Fetch each endpoint once (sources sharing one are fetched together)
 *   4. adapter.parse(raw, src) → { items: [{ id, name, price }], datetime }
 *   5. Store a source's items (`source_items:${id}`) only when they changed
 *   6. Build the price book from every active source (synced or not) → KV "prices", one write
 *   7. Record the prices that came in this tick in the price history, keyed by the same ids
 *
 * Nothing else is written: every screen and route reads the book.
 */

import { dbGetPriceSources } from "../../repositories/priceSource.repository.js";
import { getAdapterForSource } from "./sources/index.js";
import { saveSourceItems } from "../../repositories/sourceItems.repository.js";
import { getPriceBookCache, setPriceBookCache } from "../../repositories/kvCache.repository.js";
import { logger } from "../../lib/logger.js";
import { buildPriceBook } from "../../domain/priceBook.js";

/**
 * Records a tick's prices in the price history. Registered by the Worker entry (index.js)
 * rather than imported here: the web app shares market modules with the API, and its bundle
 * must not pull in the Postgres driver.
 */
let priceHistoryWriter = null;

/** @param {((env: object, points: Array<{ id: string, price: number }>, recordedAt: string) => Promise<unknown>)|null} writer */
export function setPriceHistoryWriter(writer) {
  priceHistoryWriter = writer;
}

/** Seconds between two fetches of a source */
export const fetchIntervalSecOf = (src) => Math.max(15, Number(src.fetchIntervalSec) || 60);

const endpointKeyOf = (src) => `${src.sourceType}::${src.endpoint || src.apiUrl || ""}`;

/**
 * Synchronizes the active sources whose fetch interval is due, then rebuilds the price book.
 *
 * @param {object} env - Cloudflare Worker environment bindings
 * @param {object} [options={}]
 * @param {boolean} [options.forceAll=false] - fetch every (selected) source, due or not
 * @param {Array<string>} [options.sourceIds] - fetch only these sources (the book is still built
 *   from all of them)
 * @returns {Promise<{
 *   totalActive: number,
 *   dueCount: number,
 *   syncedCount: number,
 *   failedCount: number,
 *   results: Array<{ sourceId: string, success: boolean, itemsCount?: number, error?: string }>,
 *   book?: object
 * }>}
 */
export async function syncAllSources(env, options = {}) {
  const empty = { totalActive: 0, dueCount: 0, syncedCount: 0, failedCount: 0, results: [] };
  if (!env) return empty;

  const { forceAll = false, sourceIds = null } = options;

  let previousBook = null;
  let sources = [];
  try {
    previousBook = await getPriceBookCache(env);
    sources = await dbGetPriceSources(env, { book: previousBook });
  } catch (err) {
    logger.error("[SourceSync] Failed to load price sources:", { error: err.message });
    return empty;
  }

  const activeSources = (Array.isArray(sources) ? sources : []).filter((s) => s.isActive !== false);
  if (activeSources.length === 0) return empty;

  const selected = Array.isArray(sourceIds) && sourceIds.length > 0
    ? activeSources.filter((s) => sourceIds.includes(s.id))
    : activeSources;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const states = { ...(previousBook?.sources || {}) };

  // 1. Due sources
  const dueSources = selected.filter((src) => {
    if (forceAll) return true;
    const last = Date.parse(states[src.id]?.syncedAt || "") || 0;
    return nowMs - last >= fetchIntervalSecOf(src) * 1000;
  });

  logger.info(`[SourceSync] Running sync for ${dueSources.length}/${activeSources.length} due sources.`);
  if (dueSources.length === 0) {
    return { ...empty, totalActive: activeSources.length };
  }

  // 2. One network request per endpoint
  const requests = new Map();
  for (const src of dueSources) {
    const key = endpointKeyOf(src);
    if (requests.has(key)) continue;
    const adapter = getAdapterForSource(src);
    requests.set(key, adapter
      ? adapter.fetchRaw(src, env).catch((err) => {
        logger.warn(`[SourceSync] Fetch failed for ${key}:`, { error: err.message });
        return null;
      })
      : Promise.resolve(null));
  }
  const keys = [...requests.keys()];
  const raws = await Promise.all(requests.values());
  const rawByEndpoint = new Map(keys.map((k, i) => [k, raws[i]]));

  // 3. Parse and store each source
  const results = [];
  const syncedSourceIds = new Set();
  const fail = (src, error) => {
    results.push({ sourceId: src.id, success: false, error });
    states[src.id] = { ...states[src.id], error, failedAt: nowIso };
  };

  for (const src of dueSources) {
    const adapter = getAdapterForSource(src);
    if (!adapter) {
      fail(src, "No adapter registered");
      continue;
    }
    const raw = rawByEndpoint.get(endpointKeyOf(src));
    if (!raw) {
      fail(src, "Empty or failed raw fetch");
      continue;
    }

    try {
      const parsed = await adapter.parse(raw, src, env);
      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      if (items.length === 0) {
        fail(src, "Adapter returned 0 items");
        continue;
      }
      const fetchedAt = parsed?.datetime || nowIso;
      await saveSourceItems(env, src.id, items, { previous: src.storedItemsJson });
      src.items = items;
      states[src.id] = { syncedAt: nowIso, fetchedAt, count: items.length };
      syncedSourceIds.add(src.id);
      results.push({ sourceId: src.id, success: true, itemsCount: items.length });
    } catch (parseErr) {
      logger.warn(`[SourceSync] Parse failed for ${src.name} (${src.id}):`, { error: parseErr.message });
      fail(src, parseErr.message);
    }
  }

  const syncedCount = syncedSourceIds.size;
  const failedCount = results.length - syncedCount;

  // 4. The price book, from every active source, with each source's sync state. Written even when
  //    nothing synced, so failures show up in the book's `sources`.
  const book = buildPriceBook(activeSources.map((src) => ({
    ...src,
    lastFetched: states[src.id]?.fetchedAt || src.lastFetched || null,
  })), { now: nowIso, sourceStates: states });
  await setPriceBookCache(env, book);

  // 5. Price history, keyed by the book's ids (the writer never throws). Items of sources that
  // didn't sync keep their value, except those computed from the dollar and the ounce.
  if (priceHistoryWriter && syncedCount > 0) {
    const points = Object.values(book.items)
      .filter((item) => !item.sourceId || syncedSourceIds.has(item.sourceId)
        || item.params?.usd !== undefined || item.params?.usdCross !== undefined)
      .map((item) => ({ id: item.id, price: item.price }));
    await priceHistoryWriter(env, points, book.updatedAt);
  }

  return {
    totalActive: activeSources.length,
    dueCount: dueSources.length,
    syncedCount,
    failedCount,
    results,
    book,
  };
}
