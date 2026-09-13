/**
 * forexRates.js — Backward-compatible wrapper for Forex Rates Service
 * Logic has been migrated to api/src/services/market/sources/forexApi.source.adapter.js
 */

import {
  forexApiSourceAdapter,
  FOREX_FALLBACK,
} from "./market/sources/forexApi.source.adapter.js";
import { getForexRatesCache } from "../repositories/kvCache.repository.js";
import { FOREX_CACHE_THROTTLE_MS } from "../config/constants.js";
import { logger } from "../lib/logger.js";

export { FOREX_FALLBACK };

let forexCache = null;

/**
 * Fetch live Forex rates against USD
 * @param {object} env
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<object>}
 */
export async function fetchForexRates(env, forceRefresh = false) {
  let stored = forexCache;
  const nowMs = Date.now();

  const kvVal = await getForexRatesCache(env);
  if (kvVal) stored = kvVal;

  const lastCheckMs = (stored && stored.last_updated) ? new Date(stored.last_updated).getTime() : 0;
  const isFresh = (nowMs - lastCheckMs) < FOREX_CACHE_THROTTLE_MS;

  if (isFresh && !forceRefresh && stored && stored.rates && stored.rates.AUD) {
    return { ...FOREX_FALLBACK, ...stored.rates };
  }

  try {
    const raw = await forexApiSourceAdapter.fetchRaw({});
    const parsed = await forexApiSourceAdapter.parse(raw, { name: "نرخ‌های جهانی فارکس (Open ER-API)" }, env);
    if (parsed && parsed.multiData) {
      const dataRates = (raw && raw.rates) ? { ...FOREX_FALLBACK, ...raw.rates } : FOREX_FALLBACK;
      forexCache = { rates: dataRates, last_updated: new Date().toISOString() };
      return dataRates;
    }
  } catch (e) {
    logger.error("Forex fetch error:", { error: e.message, stack: e.stack });
  }

  return (stored && stored.rates) ? { ...FOREX_FALLBACK, ...stored.rates } : { ...FOREX_FALLBACK };
}

/**
 * Synchronize forex cross rates into D1 price_sources table
 */
export async function syncForexRatesToPriceSources(env, fetchedRates) {
  return await forexApiSourceAdapter.syncToPriceSourcesD1(env, fetchedRates);
}
