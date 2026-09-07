/**
 * goldPrice.js — Fetch live international spot gold price (XAU/USD)
 * Throttled to 1 minute. Cached in KV + in-memory.
 */

// Module-level in-memory cache (shared across requests in the same isolate)
let goldCache = null;

/**
 * Fetch the live spot gold price in USD
 * @param {object} env
 * @param {boolean} [forceRefresh=false]
 * @returns {number|null} price per troy ounce in USD
 */
export async function fetchGlobalSpotGold(env, forceRefresh = false) {
  const cacheKey = "spot_gold_usd";
  let stored = goldCache;
  const nowMs = Date.now();

  if (env && env.REALRATE_KV) {
    try {
      const kvVal = await env.REALRATE_KV.get(cacheKey, "json");
      if (kvVal) stored = kvVal;
    } catch (e) {
      console.error("KV Read Error for Spot Gold:", e);
    }
  }

  const lastCheckMs = (stored && stored.last_updated) ? new Date(stored.last_updated).getTime() : 0;
  const isFresh = (nowMs - lastCheckMs) < 60000; // 1-minute throttle

  if (isFresh && !forceRefresh && stored && typeof stored.price === "number") {
    return stored.price;
  }

  try {
    const res = await fetch("https://api.gold-api.com/price/XAU", {
      headers: { "User-Agent": "RealRate/1.0" },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.price) {
        const newPrice = Math.round(data.price * 100) / 100;
        const record = { price: newPrice, last_updated: new Date().toISOString() };
        goldCache = record;

        if (env && env.REALRATE_KV) {
          try {
            await env.REALRATE_KV.put(cacheKey, JSON.stringify(record));
          } catch (e) {
            console.error("KV Write Error for Spot Gold:", e);
          }
        }
        return newPrice;
      }
    }
  } catch (e) {
    console.error("Gold spot API fetch error:", e);
  }

  return stored ? stored.price : null;
}

// Module-level in-memory cache for silver
let silverCache = null;

/**
 * Fetch the live spot silver price in USD (XAG/USD)
 * @param {object} env
 * @param {boolean} [forceRefresh=false]
 * @returns {number|null} price per troy ounce in USD
 */
export async function fetchGlobalSpotSilver(env, forceRefresh = false) {
  const cacheKey = "spot_silver_usd";
  let stored = silverCache;
  const nowMs = Date.now();

  if (env && env.REALRATE_KV) {
    try {
      const kvVal = await env.REALRATE_KV.get(cacheKey, "json");
      if (kvVal) stored = kvVal;
    } catch (e) {
      console.error("KV Read Error for Spot Silver:", e);
    }
  }

  const lastCheckMs = (stored && stored.last_updated) ? new Date(stored.last_updated).getTime() : 0;
  const isFresh = (nowMs - lastCheckMs) < 60000; // 1-minute throttle

  if (isFresh && !forceRefresh && stored && typeof stored.price === "number") {
    return stored.price;
  }

  try {
    const res = await fetch("https://api.gold-api.com/price/XAG", {
      headers: { "User-Agent": "RealRate/1.0" },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.price) {
        const newPrice = Math.round(data.price * 100) / 100;
        const record = { price: newPrice, last_updated: new Date().toISOString() };
        silverCache = record;

        if (env && env.REALRATE_KV) {
          try {
            await env.REALRATE_KV.put(cacheKey, JSON.stringify(record));
          } catch (e) {
            console.error("KV Write Error for Spot Silver:", e);
          }
        }
        return newPrice;
      }
    }
  } catch (e) {
    console.error("Silver spot API fetch error:", e);
  }

  return stored ? stored.price : 33.5;
}

