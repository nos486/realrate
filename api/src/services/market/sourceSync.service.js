/**
 * sourceSync.service.js — Unified Orchestrator for Price & Catalog Sources Sync
 *
 * Merges handleScheduledPriceExtraction and syncAllCatalogSources into a single,
 * cohesive polling pipeline.
 *
 * Pipeline per active due source:
 *   1. Check fetchIntervalSec & lastSync (skip if not due, unless forceAll=true)
 *   2. Deduplicate network fetch by endpoint
 *   3. adapter.fetchRaw(src, env)
 *   4. adapter.parse(raw, src, env) -> returns { items: [{id, name, price}], datetime }
 *   5. saveSourceItems(env, src.id, items, { datetime })
 *   6. setSourceLastSync(env, src.id, nowMs)
 *   7. Recompile homepage latest_rates cache
 *   8. Record the tick's prices in the price history (one write, keyed by asset id)
 *
 * Guarantees that in any single tick, no source is fetched more than once.
 */

import { dbGetPriceSources } from "../../repositories/priceSource.repository.js";
import { getAdapterForSource } from "./sources/index.js";
import {
  saveSourceItems,
  getSourceLastSync,
  setSourceLastSync,
} from "../../repositories/sourceItems.repository.js";
import {
  setLatestRatesCache,
  setSourcePriceCache,
} from "../../repositories/kvCache.repository.js";
import { compileLatestMarketRates } from "./priceAggregator.service.js";
import { logger } from "../../lib/logger.js";
import { catalogHistoryPoints, marketRateHistoryPoints } from "../../domain/priceHistoryKeys.js";

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

/**
 * Synchronizes all active sources whose fetch interval is due.
 *
 * @param {object} env - Cloudflare Worker environment bindings
 * @param {object} [options={}] - Execution options
 * @param {boolean} [options.forceAll=false] - If true, bypasses interval check and syncs all active sources
 * @param {Array<string>} [options.sourceIds] - Optional filter for specific source IDs
 * @returns {Promise<{
 *   totalActive: number,
 *   dueCount: number,
 *   syncedCount: number,
 *   failedCount: number,
 *   results: Array<{ sourceId: string, success: boolean, itemsCount?: number, error?: string }>,
 *   rates?: object
 * }>}
 */
export async function syncAllSources(env, options = {}) {
  if (!env) {
    return { totalActive: 0, dueCount: 0, syncedCount: 0, failedCount: 0, results: [] };
  }

  const { forceAll = false, sourceIds = null } = options;

  let sources = [];
  try {
    sources = await dbGetPriceSources(env);
  } catch (err) {
    logger.error("[SourceSync] Failed to load price sources:", { error: err.message });
    return { totalActive: 0, dueCount: 0, syncedCount: 0, failedCount: 0, results: [] };
  }

  if (!Array.isArray(sources) || sources.length === 0) {
    return { totalActive: 0, dueCount: 0, syncedCount: 0, failedCount: 0, results: [] };
  }

  let activeSources = sources.filter(s => s.isActive !== false);
  if (Array.isArray(sourceIds) && sourceIds.length > 0) {
    const filterSet = new Set(sourceIds);
    activeSources = activeSources.filter(s => filterSet.has(s.id));
  }

  if (activeSources.length === 0) {
    return { totalActive: 0, dueCount: 0, syncedCount: 0, failedCount: 0, results: [] };
  }

  const nowMs = Date.now();

  // 1. Identify due sources based on fetchIntervalSec & lastSync
  const dueSources = [];
  for (const src of activeSources) {
    if (forceAll) {
      dueSources.push(src);
      continue;
    }

    const intervalSec = Math.max(15, Number(src.fetchIntervalSec) || 60);
    const intervalMs = intervalSec * 1000;

    const lastSyncVal = await getSourceLastSync(env, src.id);
    const lastSyncMs = lastSyncVal
      ? Number(lastSyncVal)
      : (src.lastFetched ? new Date(src.lastFetched).getTime() : 0);

    if (nowMs - lastSyncMs >= intervalMs) {
      dueSources.push(src);
    }
  }

  logger.info(`[SourceSync] Running sync for ${dueSources.length}/${activeSources.length} due sources.`);

  const results = [];
  let syncedCount = 0;
  let failedCount = 0;

  if (dueSources.length === 0) {
    return {
      totalActive: activeSources.length,
      dueCount: 0,
      syncedCount: 0,
      failedCount: 0,
      results: [],
    };
  }

  // 2. Deduplicate network requests by (sourceType + "::" + endpoint)
  const endpointRequests = new Map();
  for (const src of dueSources) {
    const endpointKey = `${src.sourceType}::${src.endpoint || src.apiUrl || ""}`;
    if (!endpointRequests.has(endpointKey)) {
      const adapter = getAdapterForSource(src);
      if (!adapter) {
        endpointRequests.set(endpointKey, Promise.resolve(null));
        continue;
      }
      endpointRequests.set(
        endpointKey,
        adapter.fetchRaw(src, env).catch(err => {
          logger.warn(`[SourceSync] Fetch failed for ${endpointKey}:`, { error: err.message });
          return null;
        })
      );
    }
  }

  const endpointKeys = Array.from(endpointRequests.keys());
  const rawResults = await Promise.all(endpointRequests.values());
  const endpointContentMap = new Map();
  for (let i = 0; i < endpointKeys.length; i++) {
    endpointContentMap.set(endpointKeys[i], rawResults[i]);
  }

  // Catalog prices of this tick, for the price history
  const catalogPoints = [];

  // 3. Process, parse, and persist each source (uniform pipeline)
  for (const src of dueSources) {
    const adapter = getAdapterForSource(src);
    if (!adapter) {
      results.push({ sourceId: src.id, success: false, error: "No adapter registered" });
      failedCount++;
      continue;
    }

    const endpointKey = `${src.sourceType}::${src.endpoint || src.apiUrl || ""}`;
    const raw = endpointContentMap.get(endpointKey);
    if (!raw) {
      results.push({ sourceId: src.id, success: false, error: "Empty or failed raw fetch" });
      failedCount++;
      continue;
    }

    try {
      const parsed = await adapter.parse(raw, src, env);
      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      const datetime = parsed?.datetime || new Date().toISOString();
      const intervalSec = Math.max(15, Number(src.fetchIntervalSec) || 60);

      if (items.length > 0) {
        // Unified single write path to KV + D1
        await saveSourceItems(env, src.id, items, {
          datetime,
          ttlSeconds: Math.max(86400, intervalSec * 3),
        });

        if (src.isCatalog) catalogPoints.push(...catalogHistoryPoints(src.id, items));

        // Set last sync timestamp
        await setSourceLastSync(env, src.id, nowMs, Math.max(86400, intervalSec * 3));

        // Update in-memory source state for latest rates compile
        src.lastFetched = datetime;
        src.lastPrice = items.length === 1 ? Number(items[0]?.price) || 0 : items.length;
        if (items.length > 1) {
          src.lastMultiData = {
            isCatalog: Boolean(src.isCatalog),
            totalCount: items.length,
            items,
            datetime,
          };
        }

        // Fast KV cache path (source_price:{id}) for sub-millisecond dbGetPriceSources lookup
        await setSourcePriceCache(env, src.id, {
          price: src.lastPrice,
          lastFetched: datetime,
          lastMultiData: src.lastMultiData || null,
        });

        results.push({ sourceId: src.id, success: true, itemsCount: items.length });
        syncedCount++;
      } else {
        results.push({ sourceId: src.id, success: false, error: "Adapter returned 0 items" });
        failedCount++;
      }
    } catch (parseErr) {
      logger.warn(`[SourceSync] Parse failed for ${src.name} (${src.id}):`, { error: parseErr.message });
      results.push({ sourceId: src.id, success: false, error: parseErr.message });
      failedCount++;
    }
  }

  // 4. Recompile latest market rates for homepage
  let latestRates = {};
  try {
    latestRates = compileLatestMarketRates(activeSources);
    await setLatestRatesCache(env, latestRates);
  } catch (rateErr) {
    logger.warn("[SourceSync] Error updating latest rates cache:", { error: rateErr.message });
  }

  // 5. Price history: every app price of this tick, in one write (the writer never throws)
  if (priceHistoryWriter && syncedCount > 0) {
    await priceHistoryWriter(env, [...marketRateHistoryPoints(latestRates), ...catalogPoints], new Date(nowMs).toISOString());
  }

  return {
    totalActive: activeSources.length,
    dueCount: dueSources.length,
    syncedCount,
    failedCount,
    results,
    rates: latestRates,
  };
}
