/**
 * Bourse (Tehran Stock Exchange - TSETMC) Service
 * Fetches, compacts, caches in KV, and searches Iranian stock market symbols from BRS API.
 * Strictly extracts: Symbol (l18), Name (l30), Price (pl in Tomans).
 * No change/percent/volume or extra fields.
 */

import { dbUpdateSourceLastPrice } from '../lib/db.js';

export const BOURSE_API_URL = "https://api.brsapi.ir/Tsetmc/AllSymbols.php?key=BDqzgcZZ5rGg4Z6uSEs9bMyx2E2vXrkd&type=1";
export const BOURSE_KV_KEY = "bourse_symbols_toman_v3";
export const BOURSE_LAST_SYNC_KEY = "bourse_symbols_last_sync_v3";

let inMemoryBourseList = null;

/**
 * Normalize Persian text for search matching (handles Arabic kaf/yeh and half-spaces)
 * @param {string} str
 * @returns {string}
 */
export function normalizePersian(str) {
  if (!str) return "";
  return String(str)
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/‌/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Fetch all symbols from BRS API, compact payload to strictly { s, n, p }, and store in KV.
 * s: Symbol (l18)
 * n: Name (l30)
 * p: Last price in Tomans (pl / 10)
 * @param {object} env
 * @returns {Promise<{ success: boolean, count: number, error?: string }>}
 */
export async function fetchAndStoreBourseSymbols(env) {
  try {
    const res = await fetch(BOURSE_API_URL, {
      headers: { "User-Agent": "RealRateWorker/1.0", "Accept": "application/json" },
    });

    if (!res.ok) {
      throw new Error(`BRS API HTTP error: ${res.status}`);
    }

    const rawData = await res.json();
    let rawArray = Array.isArray(rawData) ? rawData : (rawData?.symbols || rawData?.data || []);

    if (!Array.isArray(rawArray) || rawArray.length === 0) {
      throw new Error("No symbols returned from Bourse API");
    }

    const symbolMap = new Map();

    for (const item of rawArray) {
      if (!item || typeof item !== "object") continue;
      const sym = (item.l18 || item.symbol || "").trim();
      const name = (item.l30 || item.name || sym).trim();
      if (!sym || !name) continue;

      let rawPrice = Number(item.pl);
      if (!rawPrice || isNaN(rawPrice) || rawPrice <= 0) {
        rawPrice = Number(item.pc) || 0;
      }
      if (rawPrice <= 0) continue;

      // Price in Tomans (BRS API / TSETMC is in Rials -> divide by 10)
      const priceToman = Math.round(rawPrice / 10);

      symbolMap.set(sym, {
        s: sym,
        n: name,
        p: priceToman,
        priceToman: priceToman,
        priceRial: rawPrice,
      });
    }

    if (symbolMap.size === 0) {
      throw new Error("No valid symbols extracted from Bourse API");
    }

    const compactList = Array.from(symbolMap.values());
    const compactJson = JSON.stringify(compactList);

    // Cache in Cloudflare KV for 48 hours
    if (env.REALRATE_KV) {
      await env.REALRATE_KV.put(BOURSE_KV_KEY, compactJson, {
        expirationTtl: 86400 * 2,
      });
    }

    const now = new Date().toISOString();
    await dbUpdateSourceLastPrice(
      env,
      'src_def_bourse',
      compactList.length,
      now,
      {
        totalSymbols: compactList.length,
        updatedAt: now,
      }
    );

    inMemoryBourseList = compactList;

    return { success: true, count: compactList.length, symbols: compactList };
  } catch (err) {
    console.error("fetchAndStoreBourseSymbols error:", err);
    return { success: false, count: 0, error: err.message };
  }
}

/**
 * Get cached stock symbols with search filtering.
 * Strictly returns: symbol, name, price, priceToman.
 * @param {object} env
 * @param {string} [query]
 * @param {number} [limit=50]
 * @returns {Promise<Array<{ symbol: string, name: string, price: number, priceToman: number }>>}
 */
export async function getBourseSymbols(env, query = "", limit = 50) {
  let list = inMemoryBourseList || [];

  if ((!list || list.length === 0) && env.REALRATE_KV) {
    try {
      const cached = await env.REALRATE_KV.get(BOURSE_KV_KEY);
      if (cached) {
        list = JSON.parse(cached);
        inMemoryBourseList = list;
      }
    } catch (e) {
      console.error("Error reading bourse KV:", e);
    }
  }

  // If KV is empty, fetch immediately
  if (!list || list.length === 0) {
    const fetchRes = await fetchAndStoreBourseSymbols(env);
    if (fetchRes.success && fetchRes.symbols) {
      list = fetchRes.symbols;
    } else if (fetchRes.success && env.REALRATE_KV) {
      try {
        const fresh = await env.REALRATE_KV.get(BOURSE_KV_KEY);
        if (fresh) list = JSON.parse(fresh);
      } catch (ignore) {}
    }
  }

  const cleanQuery = normalizePersian(query);

  let filtered = list;
  if (cleanQuery) {
    filtered = list.filter(item => {
      const symNorm = normalizePersian(item.s);
      const nameNorm = normalizePersian(item.n);
      return symNorm.includes(cleanQuery) || nameNorm.includes(cleanQuery);
    });

    filtered.sort((a, b) => {
      const aSym = normalizePersian(a.s);
      const bSym = normalizePersian(b.s);

      const aExact = aSym === cleanQuery ? 1 : 0;
      const bExact = bSym === cleanQuery ? 1 : 0;
      if (bExact !== aExact) return bExact - aExact;

      const aPrefix = aSym.startsWith(cleanQuery) ? 1 : 0;
      const bPrefix = bSym.startsWith(cleanQuery) ? 1 : 0;
      if (bPrefix !== aPrefix) return bPrefix - aPrefix;

      return 0;
    });
  }

  const maxResults = Math.min(Number(limit) || 50, 2000);
  const sliced = filtered.slice(0, maxResults);

  return sliced.map(item => {
    let toman = item.priceToman;
    let rial = item.priceRial;
    if (toman === undefined) {
      const raw = Number(item.p || 0);
      toman = Math.round(raw / 10);
      rial = raw;
    } else if (rial && toman === rial) {
      toman = Math.round(rial / 10);
    }
    if (!rial) {
      rial = toman * 10;
    }
    return {
      symbol: item.s,
      name: item.n,
      price: toman,
      priceToman: toman,
      priceRial: rial,
    };
  });
}

/**
 * Look up a single stock symbol by its ticker code
 * @param {object} env
 * @param {string} symbol
 * @returns {Promise<object|null>}
 */
export async function getBourseSymbolDetail(env, symbol) {
  if (!symbol) return null;
  try {
    let list = inMemoryBourseList || [];
    if ((!list || list.length === 0) && env.REALRATE_KV) {
      const cached = await env.REALRATE_KV.get(BOURSE_KV_KEY);
      if (cached) list = JSON.parse(cached);
    }
    if (!list || list.length === 0) return null;

    const targetNorm = normalizePersian(symbol);
    const found = list.find(item => normalizePersian(item.s) === targetNorm);
    if (!found) return null;

    let toman = found.priceToman;
    let rial = found.priceRial;
    if (toman === undefined) {
      const raw = Number(found.p || 0);
      toman = Math.round(raw / 10);
      rial = raw;
    } else if (rial && toman === rial) {
      toman = Math.round(rial / 10);
    }
    if (!rial) {
      rial = toman * 10;
    }

    return {
      symbol: found.s,
      name: found.n,
      price: toman,
      priceToman: toman,
      priceRial: rial,
    };
  } catch (e) {
    console.error("getBourseSymbolDetail error:", e);
    return null;
  }
}

/**
 * Scheduled handler to sync bourse symbols once per day (24 hours).
 * @param {object} env
 * @returns {Promise<boolean>}
 */
export async function handleScheduledBourseSync(env) {
  if (!env.REALRATE_KV) return false;
  try {
    const lastSyncStr = await env.REALRATE_KV.get(BOURSE_LAST_SYNC_KEY);
    const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;
    const now = Date.now();
    // 24 hours
    if (now - lastSync < 86400 * 1000) {
      return false;
    }

    const res = await fetchAndStoreBourseSymbols(env);
    if (res.success) {
      await env.REALRATE_KV.put(BOURSE_LAST_SYNC_KEY, String(now), {
        expirationTtl: 86400 * 3,
      });
      return true;
    }
  } catch (err) {
    console.error("[Bourse] Scheduled sync error:", err);
  }
  return false;
}
