/**
 * Bourse (Tehran Stock Exchange - TSETMC) Service
 * Fetches, compacts, caches in KV, and searches Iranian stock market symbols from BRS API.
 */

import { dbUpdateSourceLastPrice } from '../lib/db.js';

export const BOURSE_API_URL = "https://api.brsapi.ir/Tsetmc/AllSymbols.php?key=BDqzgcZZ5rGg4Z6uSEs9bMyx2E2vXrkd&type=1";
export const BOURSE_FUNDS_API_URL = "https://Api.BrsApi.ir/IME/Fund.php?key=BDqzgcZZ5rGg4Z6uSEs9bMyx2E2vXrkd";
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
 * Get active Bourse source configuration from D1 (URL, field mappings, interval)
 * @param {object} env
 * @returns {Promise<object|null>}
 */
export async function getActiveBourseSource(env) {
  if (!env || !env.DB) return null;
  try {
    const row = await env.DB.prepare(`
      SELECT id, endpoint, field_mapping AS fieldMapping, fetch_interval_sec AS fetchIntervalSec
      FROM price_sources
      WHERE price_type = 'bourse' AND (id = 'src_def_bourse' OR endpoint NOT LIKE '%Fund.php%') AND is_active = 1
      ORDER BY is_primary DESC, updated_at DESC
      LIMIT 1
    `).first();
    return row || null;
  } catch (e) {
    console.error("getActiveBourseSource error:", e);
    return null;
  }
}

/**
 * Get active Bourse Funds source configuration from D1
 * @param {object} env
 * @returns {Promise<object|null>}
 */
export async function getActiveBourseFundsSource(env) {
  if (!env || !env.DB) return null;
  try {
    const row = await env.DB.prepare(`
      SELECT id, endpoint, field_mapping AS fieldMapping, fetch_interval_sec AS fetchIntervalSec
      FROM price_sources
      WHERE (id = 'src_def_bourse_funds' OR endpoint LIKE '%Fund.php%') AND is_active = 1
      ORDER BY updated_at DESC
      LIMIT 1
    `).first();
    return row || null;
  } catch (e) {
    console.error("getActiveBourseFundsSource error:", e);
    return null;
  }
}

/**
 * Fetch all symbols from configured API URLs (equities + funds), compact the payload with dynamic mapping, and store in KV.
 * @param {object} env
 * @returns {Promise<{ success: boolean, count: number, fundsCount?: number, error?: string }>}
 */
export async function fetchAndStoreBourseSymbols(env) {
  try {
    const [bourseSrc, fundsSrc] = await Promise.all([
      getActiveBourseSource(env),
      getActiveBourseFundsSource(env),
    ]);

    const targetUrl = bourseSrc?.endpoint || BOURSE_API_URL;
    const fundsUrl = fundsSrc?.endpoint || BOURSE_FUNDS_API_URL;

    let fieldMapping = null;
    if (bourseSrc?.fieldMapping) {
      try {
        fieldMapping = typeof bourseSrc.fieldMapping === "string" ? JSON.parse(bourseSrc.fieldMapping) : bourseSrc.fieldMapping;
      } catch {}
    }

    let fundsFieldMapping = null;
    if (fundsSrc?.fieldMapping) {
      try {
        fundsFieldMapping = typeof fundsSrc.fieldMapping === "string" ? JSON.parse(fundsSrc.fieldMapping) : fundsSrc.fieldMapping;
      } catch {}
    }

    // Fetch both General Equities and IME Funds concurrently
    const [stocksResult, fundsResult] = await Promise.allSettled([
      fetch(targetUrl, {
        headers: { "User-Agent": "RealRateWorker/1.0", "Accept": "application/json" },
      }).then(r => r.ok ? r.json() : Promise.reject(`Status ${r.status}`)),
      fetch(fundsUrl, {
        headers: { "User-Agent": "RealRateWorker/1.0", "Accept": "application/json" },
      }).then(r => r.ok ? r.json() : Promise.reject(`Status ${r.status}`)),
    ]);

    const symbolMap = new Map();

    // 1. Process General Equities
    if (stocksResult.status === "fulfilled" && stocksResult.value) {
      const data = stocksResult.value;
      const arrayPath = fieldMapping?.arrayPath || "";
      let rawArray = arrayPath ? (data?.[arrayPath] || null) : data;
      if (!Array.isArray(rawArray) && data && Array.isArray(data.symbols)) {
        rawArray = data.symbols;
      } else if (!Array.isArray(rawArray) && data && Array.isArray(data.data)) {
        rawArray = data.data;
      } else if (!Array.isArray(rawArray) && data && Array.isArray(data.result)) {
        rawArray = data.result;
      }

      if (Array.isArray(rawArray)) {
        const symKey = fieldMapping?.symbolField || "l18";
        const nameKey = fieldMapping?.nameField || "l30";
        const priceKey = fieldMapping?.priceField || "pl";
        const altPriceKey = fieldMapping?.altPriceField || "pc";
        const changeKey = fieldMapping?.changeField || "plc";
        const changePctKey = fieldMapping?.changePercentField || "plp";
        const volumeKey = fieldMapping?.volumeField || "tno";
        const isRial = fieldMapping?.priceUnit !== "toman";

        for (const item of rawArray) {
          if (!item || typeof item !== "object") continue;
          const sym = (item[symKey] || item.l18 || item.symbol || item.ticker || item.l18_formatted || "").trim();
          if (!sym) continue;

          let rawPrice = Number(item[priceKey]);
          if (!rawPrice || isNaN(rawPrice) || rawPrice <= 0) {
            rawPrice = Number(item[altPriceKey]) || Number(item.pl) || Number(item.pc) || Number(item.lastPrice) || Number(item.price) || 0;
          }
          if (rawPrice <= 0) continue;

          const priceInRials = isRial ? Math.round(rawPrice) : Math.round(rawPrice * 10);
          const c = Number(item[changeKey] !== undefined ? item[changeKey] : (item.plc !== undefined ? item.plc : 0)) || 0;
          const cp = Number(item[changePctKey] !== undefined ? item[changePctKey] : (item.plp !== undefined ? item.plp : 0)) || 0;
          const t = Number(item[volumeKey] !== undefined ? item[volumeKey] : (item.tno !== undefined ? item.tno : 0)) || 0;

          symbolMap.set(sym, {
            s: sym,
            n: (item[nameKey] || item.l30 || item.name || item.title || item.company || sym).trim(),
            p: priceInRials,
            c,
            cp,
            t,
            f: 0,
          });
        }
      }
    }

    // 2. Process IME Investment Funds (Commodity, Gold, Silver Funds)
    let fundsCount = 0;
    if (fundsResult.status === "fulfilled" && fundsResult.value) {
      const data = fundsResult.value;
      const arrayPath = fundsFieldMapping?.arrayPath || "data";
      let rawArray = arrayPath ? (data?.[arrayPath] || null) : data;
      if (!Array.isArray(rawArray) && data && Array.isArray(data.data)) {
        rawArray = data.data;
      } else if (!Array.isArray(rawArray) && data && Array.isArray(data.symbols)) {
        rawArray = data.symbols;
      }

      if (Array.isArray(rawArray)) {
        const symKey = fundsFieldMapping?.symbolField || "l18";
        const nameKey = fundsFieldMapping?.nameField || "l30";
        const priceKey = fundsFieldMapping?.priceField || "pl";
        const altPriceKey = fundsFieldMapping?.altPriceField || "pc";
        const changeKey = fundsFieldMapping?.changeField || "plc";
        const changePctKey = fundsFieldMapping?.changePercentField || "plp";
        const volumeKey = fundsFieldMapping?.volumeField || "tno";
        const isRial = fundsFieldMapping?.priceUnit !== "toman";

        for (const item of rawArray) {
          if (!item || typeof item !== "object") continue;
          const sym = (item[symKey] || item.l18 || item.symbol || "").trim();
          if (!sym) continue;

          let rawPrice = Number(item[priceKey]);
          if (!rawPrice || isNaN(rawPrice) || rawPrice <= 0) {
            rawPrice = Number(item[altPriceKey]) || Number(item.pl) || Number(item.pc) || 0;
          }
          if (rawPrice <= 0) continue;

          const priceInRials = isRial ? Math.round(rawPrice) : Math.round(rawPrice * 10);
          const c = Number(item[changeKey] !== undefined ? item[changeKey] : (item.plc !== undefined ? item.plc : 0)) || 0;
          const cp = Number(item[changePctKey] !== undefined ? item[changePctKey] : (item.plp !== undefined ? item.plp : (item.pcp || 0))) || 0;
          const t = Number(item[volumeKey] !== undefined ? item[volumeKey] : (item.tno !== undefined ? item.tno : 0)) || 0;

          // Dedicated Fund data overrides or enriches general equity data
          symbolMap.set(sym, {
            s: sym,
            n: (item[nameKey] || item.l30 || item.name || sym).trim(),
            p: priceInRials,
            c,
            cp,
            t,
            f: 1, // Fund flag
          });
          fundsCount++;
        }
      }
    }

    if (symbolMap.size === 0) {
      throw new Error("No valid symbols found from Bourse or Funds APIs");
    }

    const compactList = Array.from(symbolMap.values());
    // Sort by trade activity or volume
    compactList.sort((a, b) => b.t - a.t);

    const compactJson = JSON.stringify(compactList);

    // Cache in Cloudflare KV for 48 hours
    if (env.REALRATE_KV) {
      await env.REALRATE_KV.put(BOURSE_KV_KEY, compactJson, {
        expirationTtl: 86400 * 2, // 2 days
      });
    }

    const now = new Date().toISOString();
    const sourceId = bourseSrc?.id || 'src_def_bourse';
    // Update D1 price source record for Bourse
    await dbUpdateSourceLastPrice(
      env,
      sourceId,
      compactList.length,
      now,
      {
        totalSymbols: compactList.length,
        fundsCount,
        updatedAt: now,
        topSymbols: compactList.slice(0, 10).map(x => x.s),
      }
    );

    // Update D1 price source record for Funds if present
    if (fundsSrc?.id) {
      await dbUpdateSourceLastPrice(
        env,
        fundsSrc.id,
        fundsCount,
        now,
        {
          totalFunds: fundsCount,
          updatedAt: now,
        }
      );
    }

    return { success: true, count: compactList.length, fundsCount };
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
 * @returns {Promise<Array<{ symbol: string, name: string, priceRial: number, priceToman: number, changePercent: number, isFund: boolean }>>}
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
    isFund: Boolean(item.f),
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
      isFund: Boolean(found.f),
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
    const bourseSrc = await getActiveBourseSource(env);
    const intervalSec = (bourseSrc && bourseSrc.fetchIntervalSec > 0) ? bourseSrc.fetchIntervalSec : 86400;
    const intervalMs = intervalSec * 1000;

    const lastSyncStr = await env.REALRATE_KV.get(BOURSE_LAST_SYNC_KEY);
    const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;
    const now = Date.now();
    if (now - lastSync < intervalMs) {
      return false;
    }

    console.log("[Bourse] Scheduled sync triggered...");
    const res = await fetchAndStoreBourseSymbols(env);
    if (res.success) {
      await env.REALRATE_KV.put(BOURSE_LAST_SYNC_KEY, String(now), {
        expirationTtl: Math.max(intervalSec * 3, 86400 * 2),
      });
      console.log(`[Bourse] Scheduled sync completed successfully (${res.count} symbols).`);
      return true;
    }
  } catch (err) {
    console.error("[Bourse] Scheduled sync error:", err);
  }
  return false;
}

