/**
 * Bourse (Tehran Stock Exchange - TSETMC) Service
 * Fetches, compacts, caches in KV, and searches Iranian stock market symbols from BRS API.
 */

import { dbUpdateSourceLastPrice } from '../lib/db.js';

export const BOURSE_API_URL = "https://api.brsapi.ir/Tsetmc/AllSymbols.php?key=BDqzgcZZ5rGg4Z6uSEs9bMyx2E2vXrkd&type=1";
export const BOURSE_KV_KEY = "bourse_symbols_compact";

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
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width spaces
    .replace(/‌/g, " ") // half space to standard space
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Fetch all symbols from BRS API, compact the payload, and store in KV.
 * Raw payload is ~1MB with 1,140+ objects.
 * Compact format reduces size to ~130KB.
 * @param {object} env
 * @returns {Promise<{ success: boolean, count: number, error?: string }>}
 */
export async function fetchAndStoreBourseSymbols(env) {
  try {
    const res = await fetch(BOURSE_API_URL, {
      headers: {
        "User-Agent": "RealRateWorker/1.0",
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`BRS API returned status ${res.status}`);
    }

    const rawData = await res.json();
    if (!Array.isArray(rawData) || rawData.length === 0) {
      throw new Error("Invalid or empty response from BRS API");
    }

    // Transform into compact structure
    // s: Symbol name (l18), n: Company name (l30), p: Last price in Rials (pl/pc),
    // c: Change (plc), cp: Change percent (plp), t: Trade volume/count
    const compactList = [];
    for (const item of rawData) {
      const sym = (item.l18 || item.l18_formatted || "").trim();
      if (!sym) continue;

      const price = Number(item.pl) || Number(item.pc) || 0;
      if (price <= 0) continue;

      compactList.push({
        s: sym,
        n: (item.l30 || item.title || sym).trim(),
        p: price, // Price in Rials
        c: Number(item.plc) || 0,
        cp: Number(item.plp) || 0,
        t: Number(item.tno) || 0,
      });
    }

    if (compactList.length === 0) {
      throw new Error("No valid symbols found after filtering");
    }

    // Sort by trade activity or alphabetically
    compactList.sort((a, b) => b.t - a.t);

    const compactJson = JSON.stringify(compactList);

    // Cache in Cloudflare KV for 48 hours
    if (env.REALRATE_KV) {
      await env.REALRATE_KV.put(BOURSE_KV_KEY, compactJson, {
        expirationTtl: 86400 * 2, // 2 days
      });
    }

    const now = new Date().toISOString();
    // Update D1 price source record for 'src_def_bourse'
    await dbUpdateSourceLastPrice(
      env,
      'src_def_bourse',
      compactList.length,
      now,
      {
        totalSymbols: compactList.length,
        updatedAt: now,
        topSymbols: compactList.slice(0, 10).map(x => x.s),
      }
    );

    return { success: true, count: compactList.length };
  } catch (err) {
    console.error("fetchAndStoreBourseSymbols error:", err);
    return { success: false, count: 0, error: err.message };
  }
}

/**
 * Get cached stock symbols with search filtering
 * @param {object} env
 * @param {string} [query] - Search term for symbol or name
 * @param {number} [limit=50] - Maximum items to return
 * @returns {Promise<Array<{ symbol: string, name: string, priceRial: number, priceToman: number, changePercent: number }>>}
 */
export async function getBourseSymbols(env, query = "", limit = 50) {
  let list = [];

  if (env.REALRATE_KV) {
    try {
      const cached = await env.REALRATE_KV.get(BOURSE_KV_KEY);
      if (cached) {
        list = JSON.parse(cached);
      }
    } catch (e) {
      console.error("Error reading bourse KV:", e);
    }
  }

  // If KV is empty, try to fetch immediately
  if (!list || list.length === 0) {
    const fetchRes = await fetchAndStoreBourseSymbols(env);
    if (fetchRes.success && env.REALRATE_KV) {
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

    // Smart ranking: Exact symbol match > symbol startsWith > symbol contains > name match, then trade volume
    filtered.sort((a, b) => {
      const aSym = normalizePersian(a.s);
      const bSym = normalizePersian(b.s);

      const aExact = aSym === cleanQuery ? 1 : 0;
      const bExact = bSym === cleanQuery ? 1 : 0;
      if (bExact !== aExact) return bExact - aExact;

      const aPrefix = aSym.startsWith(cleanQuery) ? 1 : 0;
      const bPrefix = bSym.startsWith(cleanQuery) ? 1 : 0;
      if (bPrefix !== aPrefix) return bPrefix - aPrefix;

      const aSymHas = aSym.includes(cleanQuery) ? 1 : 0;
      const bSymHas = bSym.includes(cleanQuery) ? 1 : 0;
      if (bSymHas !== aSymHas) return bSymHas - aSymHas;

      return (b.t || 0) - (a.t || 0);
    });
  }

  const maxResults = Math.min(Number(limit) || 50, 100);
  const sliced = filtered.slice(0, maxResults);

  return sliced.map(item => ({
    symbol: item.s,
    name: item.n,
    priceRial: item.p,
    priceToman: Math.round(item.p / 10),
    changePercent: item.cp,
    changeRial: item.c,
    trades: item.t,
  }));
}

/**
 * Look up a single stock symbol by its ticker code
 * @param {object} env
 * @param {string} symbol
 * @returns {Promise<object|null>}
 */
export async function getBourseSymbolDetail(env, symbol) {
  if (!symbol || !env.REALRATE_KV) return null;
  try {
    const cached = await env.REALRATE_KV.get(BOURSE_KV_KEY);
    if (!cached) return null;
    const list = JSON.parse(cached);
    const targetNorm = normalizePersian(symbol);
    const found = list.find(item => normalizePersian(item.s) === targetNorm);
    if (!found) return null;

    return {
      symbol: found.s,
      name: found.n,
      priceRial: found.p,
      priceToman: Math.round(found.p / 10),
      changePercent: found.cp,
      trades: found.t,
    };
  } catch (e) {
    console.error("getBourseSymbolDetail error:", e);
    return null;
  }
}

export const BOURSE_LAST_SYNC_KEY = "bourse_symbols_last_sync";

/**
 * Scheduled handler to sync bourse symbols once per day (24 hours).
 * Can be called safely from worker scheduled cron trigger.
 * @param {object} env
 * @returns {Promise<boolean>}
 */
export async function handleScheduledBourseSync(env) {
  if (!env.REALRATE_KV) return false;
  try {
    const lastSyncStr = await env.REALRATE_KV.get(BOURSE_LAST_SYNC_KEY);
    const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;
    const now = Date.now();
    // 24 hours in ms
    if (now - lastSync < 24 * 60 * 60 * 1000) {
      return false;
    }

    console.log("[Bourse] Daily sync triggered...");
    const res = await fetchAndStoreBourseSymbols(env);
    if (res.success) {
      await env.REALRATE_KV.put(BOURSE_LAST_SYNC_KEY, String(now), {
        expirationTtl: 86400 * 3,
      });
      console.log(`[Bourse] Daily sync completed successfully (${res.count} symbols).`);
      return true;
    }
  } catch (err) {
    console.error("[Bourse] Scheduled sync error:", err);
  }
  return false;
}

