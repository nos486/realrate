/**
 * forexRates.js — Fetch live international Forex exchange rates (vs USD)
 * Throttled to 10 minutes. Cached in KV + in-memory.
 */

import { normalizeForexToUsdCrossRate } from "./priceSources.js";
import {
  getForexRatesCache,
  setForexRatesCache,
  getLastForexD1RecordTime,
  setLastForexD1RecordTime,
} from "../repositories/kvCache.repository.js";
import { dbBatchUpdateForexPrices } from "../repositories/priceSource.repository.js";
import { logger } from "../lib/logger.js";
import {
  FOREX_CACHE_THROTTLE_MS,
  FOREX_HISTORY_EXPIRATION_TTL,
} from "../config/constants.js";

// Module-level in-memory cache
let forexCache = null;

export const FOREX_FALLBACK = {
  EUR: 0.915,
  AED: 3.6725,
  TRY: 33.50,
  CNY: 7.18,
  GBP: 0.782,
  CAD: 1.370,
  AUD: 1.520,
  CHF: 0.865,
  JPY: 147.50,
  SAR: 3.75,
  QAR: 3.64,
  KWD: 0.306,
  RUB: 88.50,
  IQD: 1310.0,
  AFN: 70.50,
};

/**
 * Fetch live Forex rates against USD
 * @param {object} env
 * @param {boolean} [forceRefresh=false]
 * @returns {object} rates keyed by currency code
 */
export async function fetchForexRates(env, forceRefresh = false) {
  let stored = forexCache;
  const nowMs = Date.now();

  const kvVal = await getForexRatesCache(env);
  if (kvVal) stored = kvVal;

  const lastCheckMs = (stored && stored.last_updated) ? new Date(stored.last_updated).getTime() : 0;
  const isFresh = (nowMs - lastCheckMs) < FOREX_CACHE_THROTTLE_MS; // 10-minute throttle

  if (isFresh && !forceRefresh && stored && stored.rates && stored.rates.AUD) {
    return { ...FOREX_FALLBACK, ...stored.rates };
  }

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (res.ok) {
      const data = await res.json();
      if (data && data.rates) {
        const fetchedRates = { ...FOREX_FALLBACK, ...data.rates };

        const record = { rates: fetchedRates, last_updated: new Date().toISOString() };
        forexCache = record;

        await setForexRatesCache(env, record);

        // Sync forex rates into D1 price_sources table
        syncForexRatesToPriceSources(env, fetchedRates).catch(() => {});

        return fetchedRates;
      }
    }
  } catch (e) {
    logger.error("Forex fetch error:", { error: e.message, stack: e.stack });
  }

  return (stored && stored.rates) ? { ...FOREX_FALLBACK, ...stored.rates } : { ...FOREX_FALLBACK };
}

/**
 * Synchronize forex cross rates (relative to USD) into D1 price_sources table
 * Throttled to at most once per 15 minutes to prevent redundant DB writes.
 * @param {object} env
 * @param {object} fetchedRates
 */
export async function syncForexRatesToPriceSources(env, fetchedRates) {
  if (!env?.DB || !fetchedRates) return;
  try {
    const nowMs = Date.now();
    let lastRecordMs = 0;
    const val = await getLastForexD1RecordTime(env);
    if (val) lastRecordMs = parseInt(val, 10) || 0;

    // Record at most once every 15 minutes
    if (nowMs - lastRecordMs < 900000) return;

    const nowIso = new Date(nowMs).toISOString();
    const currenciesToRecord = ['EUR', 'TRY', 'AED', 'GBP', 'CHF', 'CAD', 'AUD', 'CNY'];
    const updates = [];

    for (const code of currenciesToRecord) {
      const raw = fetchedRates[code];
      if (raw && Number(raw) > 0) {
        const priceType = code.toLowerCase();
        const crossRate = normalizeForexToUsdCrossRate(priceType, raw);
        if (!crossRate || crossRate <= 0) continue;

        updates.push({ priceType, crossRate });
      }
    }

    if (updates.length > 0) {
      await dbBatchUpdateForexPrices(env, updates, nowIso);
    }

    await setLastForexD1RecordTime(env, nowMs, FOREX_HISTORY_EXPIRATION_TTL);
  } catch (err) {
    logger.warn("[Forex] Error recording history in D1:", { error: err.message });
  }
}
