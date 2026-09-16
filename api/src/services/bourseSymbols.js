/**
 * bourseSymbols.js — Backward-Compatible Facade for Bourse Service
 * Delegates to Unified Catalog Feeds Engine (catalogFeeds.service.js)
 */

import {
  bourseSymbolsSourceAdapter,
  mergeBourseSymbols,
  BOURSE_API_URL,
} from "./market/sources/bourseSymbols.source.adapter.js";
import { normalizePersian } from "./market/sources/parsingUtils.js";
import {
  BOURSE_KV_KEY,
  BOURSE_BACKUP_KV_KEY,
  BOURSE_LAST_SYNC_KEY,
} from "../repositories/kvCache.repository.js";
import { dbUpdateSourceLastPrice } from "../repositories/priceSource.repository.js";
import { DEFAULT_BOURSE_SEARCH_LIMIT } from "../config/constants.js";
import {
  searchCatalogItems,
  getCatalogItemDetail,
} from "./market/catalogFeeds.service.js";
import { logger } from "../lib/logger.js";

export {
  BOURSE_API_URL,
  BOURSE_KV_KEY,
  BOURSE_BACKUP_KV_KEY,
  BOURSE_LAST_SYNC_KEY,
  normalizePersian,
  mergeBourseSymbols,
};

/**
 * Fetch fresh symbols from BRS API, merge with existing, and update KV & D1
 * @param {object} env
 * @returns {Promise<{ success: boolean, count?: number, symbols?: Array, error?: string }>}
 */
export async function fetchAndStoreBourseSymbols(env) {
  try {
    const raw = await bourseSymbolsSourceAdapter.fetchRaw({}, env);
    const parsed = await bourseSymbolsSourceAdapter.parse(raw, { name: "بورس اوراق بهادار تهران (TSETMC / BRS API)" }, env);

    if (env?.DB) {
      await dbUpdateSourceLastPrice(
        env,
        'src_def_bourse',
        parsed.price,
        parsed.datetime,
        parsed.multiData
      );
    }

    return { success: true, count: parsed.price, symbols: parsed.compactList };
  } catch (err) {
    logger.error("fetchAndStoreBourseSymbols error:", { error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Get symbols list with optional search query (Delegates to Catalog Feeds Engine)
 * @param {object} env
 * @param {string} [query=""]
 * @param {number} [limit=DEFAULT_BOURSE_SEARCH_LIMIT]
 * @returns {Promise<Array>}
 */
export async function getBourseSymbols(env, query = "", limit = DEFAULT_BOURSE_SEARCH_LIMIT) {
  // Ensure KV/memory is primed if completely empty
  const list = await bourseSymbolsSourceAdapter.getSymbols(env);
  if (!list || list.length === 0) {
    await fetchAndStoreBourseSymbols(env);
  }

  return await searchCatalogItems(env, {
    q: query,
    sourceId: "src_def_bourse",
    limit,
  });
}

/**
 * Look up a single stock symbol by ticker code (Delegates to Catalog Feeds Engine)
 * @param {object} env
 * @param {string} symbol
 * @returns {Promise<object|null>}
 */
export async function getBourseSymbolDetail(env, symbol) {
  return await getCatalogItemDetail(env, symbol, "src_def_bourse");
}

/**
 * Scheduled handler for daily Bourse sync
 */
export async function handleScheduledBourseSync(env) {
  return await bourseSymbolsSourceAdapter.handleScheduledSync(env);
}
