/**
 * forexRates.js — Fetch live international Forex exchange rates (vs USD)
 * Throttled to 10 minutes. Cached in KV + in-memory.
 */

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
        const fetchedRates = {};
        for (const code of Object.keys(FOREX_FALLBACK)) {
          fetchedRates[code] = data.rates[code] || FOREX_FALLBACK[code];
        }

        const record = { rates: fetchedRates, last_updated: new Date().toISOString() };
        forexCache = record;

        if (env && env.REALRATE_KV) {
          try {
            await env.REALRATE_KV.put(cacheKey, JSON.stringify(record));
          } catch (e) {}
        }
        return fetchedRates;
      }
    }
  } catch (e) {
    console.error("Forex fetch error:", e);
  }

  return (stored && stored.rates) ? { ...FOREX_FALLBACK, ...stored.rates } : { ...FOREX_FALLBACK };
}
