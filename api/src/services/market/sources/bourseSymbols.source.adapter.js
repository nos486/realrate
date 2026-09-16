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
import {
  BOURSE_SYNC_INTERVAL_MS,
  BOURSE_SYNC_EXPIRATION_TTL,
} from "../../../config/constants.js";
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
  const defaultSourceName = sourceConfig?.name || "";
  const defaultSourceId = sourceConfig?.id || "";
  const symbolMap = new Map();

  // 1. Initialize map with existing symbols
  if (Array.isArray(existingList)) {
    for (const item of existingList) {
      if (!item || !item.s) continue;
      const key = String(item.s).trim();
      if (!key) continue;

      let toman = 0;
      let rial = 0;

      if (item.priceToman !== undefined && Number(item.priceToman) > 0) {
        toman = Number(item.priceToman);
      } else if (item.p !== undefined && Number(item.p) > 0) {
        toman = Number(item.p);
      } else if (item.price !== undefined && Number(item.price) > 0) {
        toman = Number(item.price);
      }

      if (item.priceRial !== undefined && Number(item.priceRial) > 0) {
        rial = Number(item.priceRial);
      } else if (item.pl !== undefined && Number(item.pl) > 0) {
        rial = Number(item.pl);
      }

      if (!toman && rial > 0) {
        toman = Math.round(rial / 10);
      }
      if (!rial && toman > 0) {
        rial = toman * 10;
      }

        symbolMap.set(key, {
          s: key,
          n: item.n || item.name || key,
          p: toman,
          price: toman,
          priceToman: toman,
          priceRial: rial,
          pl: rial,
          updatedAt: item.updatedAt || nowIso,
          isFund: Boolean(item.isFund || (item.n && item.n.includes('صندوق'))),
          sourceName: item.sourceName || defaultSourceName,
          sourceId: item.sourceId || defaultSourceId,
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

      // Raw price from API: 'pl' is in RIALS (TSETMC standard)
      const rawPl = item.pl !== undefined && item.pl !== null ? item.pl : 0;
      const rawPriceRial = Number(String(rawPl).replace(/,/g, '').trim()) || 0;

      const existing = symbolMap.get(sym);

      if (rawPriceRial > 0) {
        // Convert Rials to Tomans
        const priceToman = Math.round(rawPriceRial / 10);
        const isFund = Boolean(name.includes('صندوق') || existing?.isFund);

        const priceChanged = existing ? (existing.priceRial !== rawPriceRial) : true;

        symbolMap.set(sym, {
          s: sym,
          n: name || existing?.n || sym,
          p: priceToman,
          price: priceToman,
          priceToman: priceToman,
          priceRial: rawPriceRial,
          pl: rawPriceRial,
          updatedAt: (existing && !priceChanged) ? existing.updatedAt : nowIso,
          isFund,
          sourceName: existing?.sourceName || defaultSourceName,
          sourceId: existing?.sourceId || defaultSourceId,
        });

        if (existing) {
          if (priceChanged) updatedCount++;
        } else {
          addedCount++;
        }
      } else if (existing) {
        // Price in API is zero/invalid -> RETAIN PREVIOUS VALID PRICE!
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
 * Bourse Symbols Source Adapter Implementation
 * @type {import("./ISourceAdapter.js").SourceAdapter}
 */
export const bourseSymbolsSourceAdapter = {
  id: "bourse_symbols",
  name: "بورس اوراق بهادار تهران (TSETMC / BRS API)",

  supports(sourceConfig) {
    const sType = (sourceConfig.sourceType || sourceConfig.source_type || "").toLowerCase();
    if (sType === "bourse_symbols") return true;
    if (sType === "api_url") return false;

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

  async parse(raw, sourceConfig, env = null) {
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
      multiData: {
        totalSymbols: mergedList.length,
        updatedAt: nowIso,
        stats,
      },
      compactList: mergedList,
      sampleItems: mergedList.slice(0, 30),
      sampleSymbols: mergedList.slice(0, 10).map(x => x.s),
      datetime: nowIso,
      label: sourceConfig.name || "بورس اوراق بهادار تهران (TSETMC / BRS API)",
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

  /**
   * Daily scheduled sync for Bourse symbols
   */
  async handleScheduledSync(env) {
    try {
      const lastSyncStr = await getBourseLastSync(env);
      const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;
      const now = Date.now();

      if (now - lastSync < BOURSE_SYNC_INTERVAL_MS) {
        return false;
      }

      const url = getBourseApiUrl(env);
      const raw = await this.fetchRaw({ apiUrl: url }, env);
      const parsed = await this.parse(raw, { name: "بورس اوراق بهادار تهران (TSETMC / BRS API)" }, env);
      if (parsed && parsed.price > 0) {
        await setBourseLastSync(env, now, BOURSE_SYNC_EXPIRATION_TTL);
        return true;
      }
    } catch (err) {
      logger.error("[BourseAdapter] Scheduled sync error:", { error: err.message, stack: err.stack });
    }
    return false;
  },
};
