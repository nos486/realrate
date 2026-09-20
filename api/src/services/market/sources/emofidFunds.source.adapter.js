/**
 * emofidFunds.source.adapter.js — Adapter for Emofid Mutual Funds API
 * Connects to https://www.emofid.com/api/funds/ to fetch, parse, and cumulatively
 * merge issue prices (subscriptionNav) for all Emofid investment funds.
 */

import { USER_AGENT } from "./parsingUtils.js";
import { logger } from "../../../lib/logger.js";
import {
  getEmofidFundsCache,
  setEmofidFundsCache,
  getEmofidLastSync,
  setEmofidLastSync,
  setSourcePriceCache,
} from "../../../repositories/kvCache.repository.js";

export const EMOFID_API_URL = "https://www.emofid.com/api/funds/";

let inMemoryEmofidList = null;

/**
 * Merges raw Emofid API fund records with an existing funds list:
 * - 100% preservation of missing funds (funds not in the latest API response keep their last valid price & timestamp).
 * - Never overwrite an existing price with zero, null, or undefined.
 * - Extracts ONLY symbol, name, and issue price (subscriptionNav) — strictly ignores cancelNav, AUM, returns, etc.
 * - Stores prices in both Rials (IRR) and Tomans (Rials / 10).
 *
 * @param {Array} existingList - Existing fund objects
 * @param {Array} rawApiArray - Raw fund objects from Emofid API
 * @param {string} [nowIso] - Current ISO timestamp
 * @returns {{
 *   mergedList: Array,
 *   stats: {
 *     totalFunds: number,
 *     updatedCount: number,
 *     addedCount: number,
 *     retainedCount: number,
 *     apiFundsCount: number,
 *   }
 * }}
 */
export function mergeEmofidFunds(existingList = [], rawApiArray = [], nowIso = new Date().toISOString(), sourceConfig = null) {
  const defaultSourceName = sourceConfig?.name || emofidFundsSourceAdapter?.name || "صندوق‌های سرمایه‌گذاری کارگزاری مفید (Emofid)";
  const defaultSourceId = sourceConfig?.id || emofidFundsSourceAdapter?.id || "src_def_emofid";
  const fundsMap = new Map();

  // 1. Initialize map with existing funds
  if (Array.isArray(existingList)) {
    for (const item of existingList) {
      if (!item) continue;
      const key = String(item.symbol || item.s || item.code || item.id || '').trim();
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

      fundsMap.set(key, {
        s: key,
        symbol: key,
        n: item.name || item.n || item.title || key,
        name: item.name || item.n || item.title || key,
        p: toman,
        price: toman,
        priceToman: toman,
        priceRial: rial,
        pl: rial,
        unit: "IRR",
        isFund: true,
        category: "صندوق سرمایه‌گذاری",
        type: item.type || "صندوق",
        sourceName: item.sourceName || defaultSourceName,
        sourceId: item.sourceId || defaultSourceId,
        updatedAt: item.updatedAt || nowIso,
      });
    }
  }

  let updatedCount = 0;
  let addedCount = 0;
  const seenKeysInApi = new Set();

  // 2. Incremental upsert from rawApiArray (Extract ONLY symbol, name, subscriptionNav)
  if (Array.isArray(rawApiArray)) {
    for (const item of rawApiArray) {
      if (!item || typeof item !== "object") continue;

      const symbol = String(item.enTitle || item.key || item.code || item.id || '').trim();
      const name = String(item.fullTitle || item.title || item.name || symbol).trim();
      if (!symbol) continue;

      seenKeysInApi.add(symbol);

      // Extract issue price (subscriptionNav in Rials)
      const rawNav = item.subscriptionNav !== undefined && item.subscriptionNav !== null
        ? Number(String(item.subscriptionNav).replace(/,/g, '').trim())
        : 0;

      const existing = fundsMap.get(symbol);

      if (rawNav > 0) {
        const rawPriceRial = Math.round(rawNav);
        const priceToman = Math.round(rawPriceRial / 10);
        const priceChanged = existing ? (existing.priceRial !== rawPriceRial) : true;

        fundsMap.set(symbol, {
          s: symbol,
          symbol,
          n: name || existing?.n || symbol,
          name: name || existing?.name || symbol,
          p: priceToman,
          price: priceToman,
          priceToman,
          priceRial: rawPriceRial,
          pl: rawPriceRial,
          unit: "IRR",
          isFund: true,
          category: "صندوق سرمایه‌گذاری",
          type: item.type || existing?.type || "صندوق",
          sourceName: existing?.sourceName || defaultSourceName,
          sourceId: existing?.sourceId || defaultSourceId,
          updatedAt: (existing && !priceChanged) ? existing.updatedAt : nowIso,
        });

        if (existing) {
          if (priceChanged) updatedCount++;
        } else {
          addedCount++;
        }
      } else if (existing) {
        // Issue price in API is 0 or invalid -> RETAIN PREVIOUS VALID PRICE!
        if (name && name !== existing.name) {
          existing.name = name;
          existing.n = name;
        }
      }
    }
  }

  // Count retained funds that were not in the latest API response
  let retainedCount = 0;
  for (const sym of fundsMap.keys()) {
    if (!seenKeysInApi.has(sym)) {
      retainedCount++;
    }
  }

  const mergedList = Array.from(fundsMap.values());

  return {
    mergedList,
    stats: {
      totalFunds: mergedList.length,
      updatedCount,
      addedCount,
      retainedCount,
      apiFundsCount: seenKeysInApi.size,
    },
  };
}

/**
 * Emofid Investment Funds Source Adapter Implementation
 * @type {import("./ISourceAdapter.js").SourceAdapter}
 */
export const emofidFundsSourceAdapter = {
  id: "emofid_funds",
  name: "صندوق‌های سرمایه‌گذاری کارگزاری مفید (Emofid)",

  supports(sourceConfig = {}) {
    const sType = String(sourceConfig.sourceType || sourceConfig.source_type || "").toLowerCase().trim();
    if (sType === "emofid_funds") return true;

    const pType = String(sourceConfig.priceType || sourceConfig.price_type || "").toLowerCase().trim();
    if (pType === "emofid_funds" || pType === "emofid") return true;

    const endpoint = String(sourceConfig.endpoint || sourceConfig.apiUrl || "").toLowerCase();
    return endpoint.includes("emofid.com/api/funds");
  },

  async fetchRaw(sourceConfig = {}, env = null) {
    const targetUrl = sourceConfig.endpoint || sourceConfig.apiUrl || EMOFID_API_URL;

    const res = await fetch(targetUrl, {
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json, text/plain, */*",
      },
    });

    if (!res.ok) {
      throw new Error(`خطای دریافت اطلاعات صندوق‌های مفید از سرور (کد ${res.status})`);
    }

    return await res.json();
  },

  async parse(raw, sourceConfig = {}, env = null) {
    const rawData = typeof raw === "string" ? JSON.parse(raw) : raw;
    const rawArray = Array.isArray(rawData)
      ? rawData
      : (Array.isArray(rawData?.value)
        ? rawData.value
        : (Array.isArray(rawData?.data)
          ? rawData.data
          : (Array.isArray(rawData?.items) ? rawData.items : [])));

    if (!Array.isArray(rawArray) || rawArray.length === 0) {
      throw new Error("آرایه صندوق‌های سرمایه‌گذاری مفید در پاسخ وب‌سرویس یافت نشد.");
    }

    let previousList = inMemoryEmofidList || [];

    // Fallback 1: check sourceConfig lastMultiData
    if (previousList.length === 0 && sourceConfig.lastMultiData) {
      const lmd = typeof sourceConfig.lastMultiData === "string"
        ? JSON.parse(sourceConfig.lastMultiData)
        : sourceConfig.lastMultiData;
      if (Array.isArray(lmd?.items)) {
        previousList = lmd.items;
      } else if (Array.isArray(lmd?.compactList)) {
        previousList = lmd.compactList;
      }
    }

    // Fallback 2: check KV cache
    if (previousList.length === 0 && env) {
      try {
        const { cached, backup } = await getEmofidFundsCache(env);
        if (cached) {
          previousList = JSON.parse(cached);
        } else if (backup) {
          previousList = JSON.parse(backup);
        }
      } catch (e) {
        logger.warn("Error loading previous emofid funds for merge:", { error: e.message });
      }
    }

    const nowIso = new Date().toISOString();
    const { mergedList, stats } = mergeEmofidFunds(previousList, rawArray, nowIso, sourceConfig);

    inMemoryEmofidList = mergedList;

    const multiDataObj = {
      isCatalog: true,
      totalCount: mergedList.length,
      items: mergedList,
      compactList: mergedList,
      sampleItems: mergedList.slice(0, 50),
      datetime: nowIso,
    };

    if (env && mergedList.length > 0) {
      try {
        const compactJson = JSON.stringify(mergedList);
        await setEmofidFundsCache(env, compactJson, true);
        await setSourcePriceCache(env, sourceConfig?.id || "src_def_emofid", {
          price: mergedList.length,
          lastFetched: nowIso,
          priceType: "emofid_funds",
          name: sourceConfig?.name || "صندوق‌های سرمایه‌گذاری کارگزاری مفید (Emofid)",
          lastMultiData: multiDataObj,
        }).catch(() => {});
      } catch (err) {
        logger.warn("Error caching emofid funds in KV:", { error: err.message });
      }
    }

    logger.info(`[EmofidAdapter] Processed ${mergedList.length} funds. Added: ${stats.addedCount}, Updated: ${stats.updatedCount}, Retained: ${stats.retainedCount}`);

    return {
      price: mergedList.length,
      datetime: nowIso,
      label: sourceConfig?.name || "صندوق‌های سرمایه‌گذاری کارگزاری مفید (Emofid)",
      multiData: multiDataObj,
      compactList: mergedList,
      sampleItems: mergedList.slice(0, 50),
      multiOutput: mergedList,
      sourceId: sourceConfig?.id || "src_def_emofid",
    };
  },

  async test(sourceConfig = {}, env = null) {
    try {
      const raw = await this.fetchRaw(sourceConfig, env);
      const parsed = await this.parse(raw, sourceConfig, env);
      return {
        success: true,
        source_type: "api_url",
        price: parsed.price,
        multiData: parsed.multiData,
        sampleItems: parsed.compactList || parsed.sampleItems,
        compactList: parsed.compactList,
        datetime: parsed.datetime,
        label: parsed.label,
        message: `تعداد ${parsed.price} صندوق سرمایه‌گذاری مفید با موفقیت دریافت و پردازش شد.`,
      };
    } catch (e) {
      try {
        const cached = await this.getFunds(env);
        if (Array.isArray(cached) && cached.length > 0) {
          const multiDataObj = {
            isCatalog: true,
            totalCount: cached.length,
            items: cached,
            compactList: cached,
            sampleItems: cached.slice(0, 50),
            datetime: cached[0]?.updatedAt || new Date().toISOString(),
          };
          return {
            success: true,
            source_type: "api_url",
            price: cached.length,
            multiData: multiDataObj,
            sampleItems: cached.slice(0, 50),
            compactList: cached,
            datetime: cached[0]?.updatedAt || new Date().toISOString(),
            label: sourceConfig.name || "صندوق‌های سرمایه‌گذاری کارگزاری مفید (Emofid)",
            message: `تعداد ${cached.length} صندوق مفید از کش فعال سامانه بازخوانی شد.`,
          };
        }
      } catch {}
      return { success: false, error: e.message || "خطا در تست وب‌سرویس مفید" };
    }
  },

  /**
   * Helper to get funds list for search and lookup
   */
  async getFunds(env = null) {
    if (inMemoryEmofidList && inMemoryEmofidList.length > 0) {
      return inMemoryEmofidList;
    }
    if (env) {
      const { cached, backup } = await getEmofidFundsCache(env);
      if (cached) {
        try {
          inMemoryEmofidList = JSON.parse(cached);
          return inMemoryEmofidList;
        } catch {}
      }
      if (backup) {
        try {
          inMemoryEmofidList = JSON.parse(backup);
          return inMemoryEmofidList;
        } catch {}
      }
    }
    // If empty, trigger background sync without blocking the current read request
    if (env) {
      fetchAndStoreEmofidFunds(env).catch(() => {});
    }
    return inMemoryEmofidList || [];
  },

  async getItems(env = null) {
    return await this.getFunds(env);
  },

  /**
   * Periodic sync for Emofid funds governed by sources.config.js (fetchIntervalSec)
   */
  async handleScheduledSync(env, sourceConfig = null) {
    if (!env) return false;
    try {
      const lastSyncStr = await getEmofidLastSync(env);
      const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;
      const now = Date.now();

      const intervalSec = Number(sourceConfig?.fetchIntervalSec) > 0
        ? Number(sourceConfig.fetchIntervalSec)
        : 1800;
      const intervalMs = intervalSec * 1000;

      if (now - lastSync < intervalMs) {
        return false;
      }

      const raw = await this.fetchRaw({}, env);
      const parsed = await this.parse(raw, { id: "src_def_emofid", name: sourceConfig?.name || this.name }, env);
      if (parsed && parsed.price > 0) {
        const expirationTtl = Math.max(86400, intervalSec * 3);
        await setEmofidLastSync(env, now, expirationTtl);
        return true;
      }
    } catch (err) {
      logger.error("[EmofidAdapter] Scheduled sync error:", { error: err.message, stack: err.stack });
    }
    return false;
  },
};

/**
 * Direct helper to fetch, parse, and persist Emofid funds to memory and KV
 * @param {object} [env=null]
 * @returns {Promise<{ success: boolean, count?: number, funds: Array, error?: string }>}
 */
export async function fetchAndStoreEmofidFunds(env = null) {
  try {
    const raw = await emofidFundsSourceAdapter.fetchRaw({}, env);
    const parsed = await emofidFundsSourceAdapter.parse(
      raw,
      { id: "src_def_emofid", name: emofidFundsSourceAdapter.name },
      env
    );
    const list = parsed.multiData?.items || parsed.compactList || inMemoryEmofidList || [];
    return { success: true, count: list.length, funds: list };
  } catch (err) {
    logger.error("[EmofidAdapter] fetchAndStoreEmofidFunds error:", { error: err.message });
    return { success: false, error: err.message, funds: inMemoryEmofidList || [] };
  }
}

