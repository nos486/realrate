/**
 * Bourse (Tehran Stock Exchange - TSETMC) Service
 * Fetches, compacts, caches in KV, and searches Iranian stock market symbols from BRS API.
 * Strictly extracts: Symbol (l18), Name (l30), Price (pl in Tomans).
 * No change/percent/volume or extra fields.
 */

import { dbUpdateSourceLastPrice } from '../lib/db.js';

export const BOURSE_API_URL = "https://api.brsapi.ir/Tsetmc/AllSymbols.php?key=BDqzgcZZ5rGg4Z6uSEs9bMyx2E2vXrkd&type=1";
export const BOURSE_KV_KEY = "bourse_symbols_toman_v3";
export const BOURSE_BACKUP_KV_KEY = "bourse_symbols_backup_v1";
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
 * Smart incremental merge of incoming raw BRS API symbols with existing symbols.
 * Guarantees that:
 * 1. Previously known symbols are NEVER deleted, even if absent in the new API response.
 * 2. If a symbol in the new response has an invalid or zero price, its previous valid price is retained.
 * 3. New symbols are added.
 * 4. Active symbols with valid new prices are updated with a fresh timestamp.
 *
 * @param {Array} existingList - Current list of stored symbols
 * @param {Array} rawApiArray - New array from BRS API
 * @param {string} [nowIso] - Current ISO timestamp
 * @returns {{
 *   mergedList: Array,
 *   stats: {
 *     totalSymbols: number,
 *     updatedCount: number,
 *     addedCount: number,
 *     retainedCount: number,
 *     apiSymbolCount: number,
 *   }
 * }}
 */
export function mergeBourseSymbols(existingList = [], rawApiArray = [], nowIso = new Date().toISOString()) {
  const symbolMap = new Map();

  // 1. Initialize map with existing symbols
  if (Array.isArray(existingList)) {
    for (const item of existingList) {
      if (!item || !item.s) continue;
      const key = String(item.s).trim();
      if (!key) continue;

      let toman = item.priceToman;
      let rial = item.priceRial;
      if (toman === undefined) {
        const raw = Number(item.p || 0);
        toman = Math.round(raw / 10);
        rial = raw;
      }
      if (!rial && toman) {
        rial = toman * 10;
      }

      symbolMap.set(key, {
        s: key,
        n: item.n || item.name || key,
        p: toman,
        priceToman: toman,
        priceRial: rial,
        updatedAt: item.updatedAt || nowIso,
        isFund: Boolean(item.isFund || (item.n && item.n.includes('صندوق'))),
      });
    }
  }

  let updatedCount = 0;
  let addedCount = 0;
  const seenKeysInApi = new Set();

  // 2. Incremental upsert from rawApiArray
  if (Array.isArray(rawApiArray)) {
    for (const item of rawApiArray) {
      if (!item || typeof item !== "object") continue;
      const sym = (item.l18 || item.symbol || "").trim();
      const name = (item.l30 || item.name || sym).trim();
      if (!sym) continue;

      seenKeysInApi.add(sym);

      let rawPrice = Number(item.pl);
      if (!rawPrice || isNaN(rawPrice) || rawPrice <= 0) {
        rawPrice = Number(item.pc) || 0;
      }

      const existing = symbolMap.get(sym);

      if (rawPrice > 0) {
        const priceToman = Math.round(rawPrice / 10);
        const isFund = Boolean(name.includes('صندوق') || existing?.isFund);

        if (existing) {
          // Update existing symbol with new price
          const priceChanged = existing.priceToman !== priceToman;
          symbolMap.set(sym, {
            s: sym,
            n: name || existing.n,
            p: priceToman,
            priceToman: priceToman,
            priceRial: rawPrice,
            updatedAt: priceChanged ? nowIso : existing.updatedAt,
            isFund,
          });
          if (priceChanged) {
            updatedCount++;
          }
        } else {
          // Brand new symbol added
          symbolMap.set(sym, {
            s: sym,
            n: name,
            p: priceToman,
            priceToman: priceToman,
            priceRial: rawPrice,
            updatedAt: nowIso,
            isFund,
          });
          addedCount++;
        }
      } else if (existing) {
        // Price in API is zero/invalid, but symbol previously had a price -> RETAIN PREVIOUS PRICE!
        if (name && name !== existing.n) {
          existing.n = name;
        }
      }
    }
  }

  // Count retained symbols that were not in the latest API response
  let retainedCount = 0;
  for (const sym of symbolMap.keys()) {
    if (!seenKeysInApi.has(sym)) {
      retainedCount++;
    }
  }

  const mergedList = Array.from(symbolMap.values());

  return {
    mergedList,
    stats: {
      totalSymbols: mergedList.length,
      updatedCount,
      addedCount,
      retainedCount,
      apiSymbolCount: seenKeysInApi.size,
    },
  };
}

/**
 * Fetch all symbols from BRS API, incrementally merge with existing data, and persist.
 * Guaranteed zero data loss when symbols are omitted from newer API responses.
 * @param {object} env
 * @returns {Promise<{ success: boolean, count: number, symbols?: Array, stats?: object, error?: string }>}
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

    // Load previous symbols from memory or KV or Backup
    let previousList = inMemoryBourseList || [];
    if (previousList.length === 0 && env?.REALRATE_KV) {
      try {
        const cached = await env.REALRATE_KV.get(BOURSE_KV_KEY);
        if (cached) {
          previousList = JSON.parse(cached);
        } else {
          const backup = await env.REALRATE_KV.get(BOURSE_BACKUP_KV_KEY);
          if (backup) {
            previousList = JSON.parse(backup);
          }
        }
      } catch (e) {
        console.error("Error loading previous bourse symbols for merge:", e);
      }
    }

    const nowIso = new Date().toISOString();
    const { mergedList, stats } = mergeBourseSymbols(previousList, rawArray, nowIso);

    if (mergedList.length === 0) {
      throw new Error("No valid symbols extracted or retained from Bourse API");
    }

    const compactJson = JSON.stringify(mergedList);

    // Persist in Cloudflare KV permanently (no 48h expiration TTL to prevent wipeouts)
    if (env?.REALRATE_KV) {
      await env.REALRATE_KV.put(BOURSE_KV_KEY, compactJson);
      // Update backup when symbol list is substantial
      if (mergedList.length >= 100) {
        await env.REALRATE_KV.put(BOURSE_BACKUP_KV_KEY, compactJson).catch(() => {});
      }
    }

    inMemoryBourseList = mergedList;

    // Update D1 price_sources table with detailed audit metrics
    if (env?.DB) {
      await dbUpdateSourceLastPrice(
        env,
        'src_def_bourse',
        mergedList.length,
        nowIso,
        {
          totalSymbols: stats.totalSymbols,
          updatedCount: stats.updatedCount,
          addedCount: stats.addedCount,
          retainedCount: stats.retainedCount,
          apiCount: stats.apiSymbolCount,
          updatedAt: nowIso,
        }
      ).catch(() => {});
    }

    return {
      success: true,
      count: mergedList.length,
      symbols: mergedList,
      stats,
    };
  } catch (err) {
    console.error("fetchAndStoreBourseSymbols error:", err);
    return { success: false, count: inMemoryBourseList?.length || 0, error: err.message };
  }
}

/**
 * Get cached stock symbols with search filtering.
 * Strictly returns: symbol, name, price, priceToman, priceRial, updatedAt, isFund.
 * @param {object} env
 * @param {string} [query]
 * @param {number} [limit=50]
 * @returns {Promise<Array<{ symbol: string, name: string, price: number, priceToman: number, priceRial: number, updatedAt: string, isFund: boolean }>>}
 */
export async function getBourseSymbols(env, query = "", limit = 50) {
  let list = inMemoryBourseList || [];

  if ((!list || list.length === 0) && env?.REALRATE_KV) {
    try {
      const cached = await env.REALRATE_KV.get(BOURSE_KV_KEY);
      if (cached) {
        list = JSON.parse(cached);
        inMemoryBourseList = list;
      } else {
        const backup = await env.REALRATE_KV.get(BOURSE_BACKUP_KV_KEY);
        if (backup) {
          list = JSON.parse(backup);
          inMemoryBourseList = list;
        }
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
    } else if (fetchRes.success && env?.REALRATE_KV) {
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
      updatedAt: item.updatedAt || null,
      isFund: Boolean(item.isFund || (item.n && item.n.includes('صندوق'))),
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
    if ((!list || list.length === 0) && env?.REALRATE_KV) {
      const cached = await env.REALRATE_KV.get(BOURSE_KV_KEY);
      if (cached) {
        list = JSON.parse(cached);
      } else {
        const backup = await env.REALRATE_KV.get(BOURSE_BACKUP_KV_KEY);
        if (backup) list = JSON.parse(backup);
      }
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
      updatedAt: found.updatedAt || null,
      isFund: Boolean(found.isFund || (found.n && found.n.includes('صندوق'))),
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
