/**
 * bourseSymbols.source.adapter.js — Adapter for Tehran Stock Exchange (TSETMC / BRS API)
 * Fetches, merges incrementally, and caches Iranian stock symbols and mutual funds in KV.
 */

import {
  getBourseSymbolsCache,
  setBourseSymbolsCache,
  getBourseLastSync,
  setBourseLastSync,
} from "../../../repositories/kvCache.repository.js";
import { logger } from "../../../lib/logger.js";
import { resolveApiUrl } from "./apiUrl.source.adapter.js";

export const BOURSE_API_BASE_URL = "https://api.brsapi.ir/Tsetmc/AllSymbols.php?type=1";

/**
 * Resolve BRS API Key from Worker env or Node environment
 * @param {object} [env]
 * @returns {string}
 */
export function resolveBrsApiKey(env = null) {
  return env?.BRS_API_KEY || (typeof process !== "undefined" && process.env?.BRS_API_KEY) || "";
}

/**
 * Get dynamic Bourse API URL with key query parameter
 * @param {object} [env]
 * @returns {string}
 */
export function getBourseApiUrl(env = null) {
  const key = resolveBrsApiKey(env);
  return key ? `${BOURSE_API_BASE_URL}&key=${key}` : BOURSE_API_BASE_URL;
}

export const BOURSE_API_URL = BOURSE_API_BASE_URL;

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
    .trim();
}

/**
 * Merges raw BRS API symbol records with an existing symbol list:
 * - 100% preservation of missing symbols (symbols not in new API response keep their existing price & timestamp).
 * - Never overwrite an existing price with zero or null.
 * - Convert prices from Rials (pl) to Tomans (/ 10).
 *
 * @param {Array} existingList
 * @param {Array} rawApiArray
 * @param {string} [nowIso]
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
export function mergeBourseSymbols(existingList = [], rawApiArray = [], nowIso = new Date().toISOString(), sourceConfig = null) {
  const symbolMap = new Map();

  // 1. Initialize map with existing symbols (supports both { id, name, price } and legacy formats)
  if (Array.isArray(existingList)) {
    for (const item of existingList) {
      if (!item) continue;
      const key = String(item.id || item.symbol || item.s || "").trim();
      if (!key) continue;

      let price = 0;
      if (item.price !== undefined && Number(item.price) > 0) {
        price = Number(item.price);
      } else if (item.priceToman !== undefined && Number(item.priceToman) > 0) {
        price = Number(item.priceToman);
      } else if (item.p !== undefined && Number(item.p) > 0) {
        price = Number(item.p);
      } else if (item.priceRial !== undefined && Number(item.priceRial) > 0) {
        price = Math.round(Number(item.priceRial) / 10);
      } else if (item.pl !== undefined && Number(item.pl) > 0) {
        price = Math.round(Number(item.pl) / 10);
      }

      const name = String(item.name || item.n || key).trim();

      symbolMap.set(key, {
        id: key,
        name: name || key,
        price,
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
      const sym = String(item.l18 || item.id || item.symbol || item.s || "").trim();
      const name = String(item.l30 || item.name || item.n || sym).trim();
      if (!sym) continue;

      seenKeysInApi.add(sym);

      // Raw price from API: 'pl' is in RIALS (TSETMC standard)
      const rawPl = item.pl !== undefined && item.pl !== null ? item.pl : (item.priceRial || item.price || item.p || 0);
      const rawPriceRial = Number(String(rawPl).replace(/,/g, '').trim()) || 0;

      const existing = symbolMap.get(sym);

      if (rawPriceRial > 0) {
        // Convert Rials to Tomans
        const priceToman = Math.round(rawPriceRial / 10);
        const priceChanged = existing ? (existing.price !== priceToman) : true;

        symbolMap.set(sym, {
          id: sym,
          name: name || existing?.name || sym,
          price: priceToman,
        });

        if (existing) {
          if (priceChanged) updatedCount++;
        } else {
          addedCount++;
        }
      } else if (existing) {
        // Price in API is zero/invalid -> RETAIN PREVIOUS VALID PRICE!
        if (name && name !== existing.name) {
          existing.name = name;
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
 * Bourse Symbols Source Adapter Implementation
 * @type {import("./ISourceAdapter.js").SourceAdapter}
 */
export const bourseSymbolsSourceAdapter = {
  id: "bourse_symbols",
  name: "بورس اوراق بهادار تهران (TSETMC / BRS API)",

  supports(sourceConfig) {
    if (sourceConfig.id === "src_def_bourse") return true;
    const sType = (sourceConfig.sourceType || sourceConfig.source_type || "").toLowerCase();
    if (sType === "bourse_symbols" || sType === "bourse") return true;

    const pType = (sourceConfig.priceType || sourceConfig.price_type || "").toLowerCase();
    return pType === "bourse" || pType === "bourse_fund";
  },

  async fetchRaw(sourceConfig = {}, env = null) {
    const fallbackUrl = getBourseApiUrl(env);
    const target = sourceConfig.endpoint || sourceConfig.apiUrl || fallbackUrl;
    const url = resolveApiUrl(target, env);

    const res = await fetch(url, {
      headers: { "User-Agent": "RealRateWorker/1.0", "Accept": "application/json" },
    });

    if (!res.ok) {
      throw new Error(`خطای دریافت اطلاعات بورس (کد ${res.status})`);
    }

    return await res.json();
  },

  async parse(raw, sourceConfig = {}, env = null) {
    const rawData = typeof raw === "string" ? JSON.parse(raw) : raw;
    let rawArray = Array.isArray(rawData) ? rawData : (rawData?.symbols || rawData?.data || []);

    if (!Array.isArray(rawArray) || rawArray.length === 0) {
      throw new Error("آرایه نمادهای بورس در پاسخ وب‌سرویس یافت نشد.");
    }

    let previousList = inMemoryBourseList || [];
    if (previousList.length === 0 && env) {
      try {
        const { cached, backup } = await getBourseSymbolsCache(env);
        if (cached) {
          previousList = JSON.parse(cached);
        } else if (backup) {
          previousList = JSON.parse(backup);
        }
      } catch (e) {
        logger.error("Error loading previous bourse symbols for merge:", { error: e.message });
      }
    }

    const nowIso = new Date().toISOString();
    const { mergedList, stats } = mergeBourseSymbols(previousList, rawArray, nowIso, sourceConfig);

    if (mergedList.length === 0) {
      throw new Error("هیچ نماد معتبری از پاسخ بورس استخراج یا ابقا نشد.");
    }

    const compactJson = JSON.stringify(mergedList);

    if (env) {
      await setBourseSymbolsCache(env, compactJson, mergedList.length >= 100);
    }

    inMemoryBourseList = mergedList;

    return {
      price: mergedList.length,
      datetime: nowIso,
      label: sourceConfig.name || "بورس اوراق بهادار تهران (TSETMC / BRS API)",
      multiData: {
        isCatalog: true,
        totalCount: mergedList.length,
        items: mergedList,
        compactList: mergedList,
        sampleItems: mergedList.slice(0, 50),
        datetime: nowIso,
        stats,
      },
      compactList: mergedList,
      sampleItems: mergedList.slice(0, 50),
      sampleSymbols: mergedList.slice(0, 10).map(x => x.id || x.s),
    };
  },

  async test(sourceConfig, env = null) {
    try {
      const raw = await this.fetchRaw(sourceConfig, env);
      const parsed = await this.parse(raw, sourceConfig, null);
      return {
        success: true,
        source_type: "api_url",
        price: parsed.price,
        multiData: parsed.multiData,
        sampleItems: parsed.compactList || parsed.sampleItems,
        compactList: parsed.compactList,
        sampleSymbols: parsed.sampleSymbols,
        datetime: parsed.datetime,
        label: parsed.label,
        message: `تعداد ${parsed.price} نماد بورس با موفقیت دریافت و پردازش شد.`,
      };
    } catch (e) {
      return { success: false, error: e.message || "خطا در تست وب‌سرویس بورس" };
    }
  },

  /**
   * Helper to get symbol list for search / lookup
   */
  async getSymbols(env) {
    if (inMemoryBourseList && inMemoryBourseList.length > 0) {
      return inMemoryBourseList;
    }
    if (env) {
      const { cached, backup } = await getBourseSymbolsCache(env);
      if (cached) {
        inMemoryBourseList = JSON.parse(cached);
        return inMemoryBourseList;
      }
      if (backup) {
        inMemoryBourseList = JSON.parse(backup);
        return inMemoryBourseList;
      }
    }
    return [];
  },

  async getItems(env = null) {
    return await this.getSymbols(env);
  },

  /**
   * Scheduled sync for Bourse symbols governed by sources.config.js (fetchIntervalSec)
   */
  async handleScheduledSync(env, sourceConfig = null) {
    try {
      const lastSyncStr = await getBourseLastSync(env);
      const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;
      const now = Date.now();

      const intervalSec = Number(sourceConfig?.fetchIntervalSec) > 0
        ? Number(sourceConfig.fetchIntervalSec)
        : 3600;
      const intervalMs = intervalSec * 1000;

      if (now - lastSync < intervalMs) {
        return false;
      }

      const url = getBourseApiUrl(env);
      const raw = await this.fetchRaw({ apiUrl: url }, env);
      const parsed = await this.parse(raw, { name: sourceConfig?.name || "بورس اوراق بهادار تهران (TSETMC / BRS API)" }, env);
      if (parsed && parsed.price > 0) {
        const expirationTtl = Math.max(86400, intervalSec * 3);
        await setBourseLastSync(env, now, expirationTtl);
        return true;
      }
    } catch (err) {
      logger.error("[BourseAdapter] Scheduled sync error:", { error: err.message, stack: err.stack });
    }
    return false;
  },
};
