/**
 * forexRates.js — Fetch live international Forex exchange rates (vs USD)
 * Throttled to 10 minutes. Cached in KV + in-memory.
 */

import { normalizeForexToUsdCrossRate } from "./priceSources.js";

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
  const cacheKey = "forex_rates";
  let stored = forexCache;
  const nowMs = Date.now();

  if (env && env.REALRATE_KV) {
    try {
      const kvVal = await env.REALRATE_KV.get(cacheKey, "json");
      if (kvVal) stored = kvVal;
    } catch (e) {}
  }

  const lastCheckMs = (stored && stored.last_updated) ? new Date(stored.last_updated).getTime() : 0;
  const isFresh = (nowMs - lastCheckMs) < 600000; // 10-minute throttle

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

        if (env && env.REALRATE_KV) {
          try {
            await env.REALRATE_KV.put(cacheKey, JSON.stringify(record));
          } catch (e) {}
        }

        // Record history in D1 for periodic sparklines and benchmarks
        recordForexHistoryInD1(env, fetchedRates).catch(() => {});

        return fetchedRates;
      }
    }
  } catch (e) {
    console.error("Forex fetch error:", e);
  }

  return (stored && stored.rates) ? { ...FOREX_FALLBACK, ...stored.rates } : { ...FOREX_FALLBACK };
}

/**
 * Record historical cross rates (relative to USD) in D1 price_history table
 * Throttled to at most once per 15 minutes to prevent redundant DB writes.
 * @param {object} env
 * @param {object} fetchedRates
 */
export async function recordForexHistoryInD1(env, fetchedRates) {
  if (!env?.DB || !fetchedRates) return;
  try {
    const cacheKey = "last_forex_d1_record";
    const nowMs = Date.now();
    let lastRecordMs = 0;
    if (env.REALRATE_KV) {
      try {
        const val = await env.REALRATE_KV.get(cacheKey);
        if (val) lastRecordMs = parseInt(val, 10) || 0;
      } catch (ignore) {}
    }

    // Record at most once every 15 minutes
    if (nowMs - lastRecordMs < 900000) return;

    const nowIso = new Date(nowMs).toISOString();
    const currenciesToRecord = ['EUR', 'TRY', 'AED', 'GBP', 'CHF', 'CAD', 'AUD', 'CNY'];
    const statements = [];

    for (const code of currenciesToRecord) {
      const raw = fetchedRates[code];
      if (raw && Number(raw) > 0) {
        const priceType = code.toLowerCase();
        const crossRate = normalizeForexToUsdCrossRate(priceType, raw);
        if (!crossRate || crossRate <= 0) continue;
        statements.push(
          env.DB.prepare(`
            INSERT INTO price_history (source_id, price_type, source_name, price, timestamp, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(`src_def_${priceType}`, priceType, `Open Forex API (${code}/USD)`, crossRate, nowIso, nowIso)
        );

        statements.push(
          env.DB.prepare(`
            UPDATE price_sources
            SET last_price = ?, last_fetched = ?, updated_at = ?
            WHERE price_type = ? AND is_primary = 1
          `).bind(crossRate, nowIso, nowIso, priceType)
        );
      }
    }

    if (statements.length > 0) {
      await env.DB.batch(statements);
    }

    if (env.REALRATE_KV) {
      await env.REALRATE_KV.put(cacheKey, String(nowMs), { expirationTtl: 3600 }).catch(() => {});
    }
  } catch (err) {
    console.warn("[Forex] Error recording history in D1:", err.message);
  }
}
