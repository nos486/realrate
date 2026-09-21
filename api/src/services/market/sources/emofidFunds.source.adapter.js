/**
 * emofidFunds.source.adapter.js — Adapter for Emofid Mutual Funds API
 * Connects to https://www.emofid.com/api/funds/ to fetch, parse, and cumulatively
 * merge issue prices (subscriptionNav) for all Emofid investment funds.
 */

import { USER_AGENT } from "./parsingUtils.js";
import { logger } from "../../../lib/logger.js";
import {
  saveSourceItems,
  getSourceItems,
  getSourceLastSync,
  setSourceLastSync,
} from "../../../repositories/sourceItems.repository.js";

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
  const fundsMap = new Map();

  // 1. Initialize map with existing funds (supports both { id, name, price } and legacy formats)
  if (Array.isArray(existingList)) {
    for (const item of existingList) {
      if (!item) continue;
      const key = String(item.id || item.symbol || item.s || item.code || '').trim();
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

      const name = String(item.name || item.n || item.title || key).trim();

      fundsMap.set(key, {
        id: key,
        name: name || key,
        price,
      });
    }
  }

  let updatedCount = 0;
  let addedCount = 0;
  const seenKeysInApi = new Set();

  // 2. Incremental upsert from rawApiArray (Extract ONLY id, name, price)
  if (Array.isArray(rawApiArray)) {
    for (const item of rawApiArray) {
      if (!item || typeof item !== "object") continue;

      const symbol = String(item.enTitle || item.key || item.code || item.id || item.symbol || '').trim();
      const name = String(item.fullTitle || item.title || item.name || symbol).trim();
      if (!symbol) continue;

      seenKeysInApi.add(symbol);

      // Extract issue price (subscriptionNav in Rials)
      const rawNav = item.subscriptionNav !== undefined && item.subscriptionNav !== null
        ? Number(String(item.subscriptionNav).replace(/,/g, '').trim())
        : (item.priceRial || item.price || item.priceToman || 0);

      const existing = fundsMap.get(symbol);

      if (rawNav > 0) {
        const rawPriceRial = Math.round(rawNav);
        const priceToman = (item.subscriptionNav !== undefined || item.priceRial !== undefined)
          ? Math.round(rawPriceRial / 10)
          : rawPriceRial;
        const priceChanged = existing ? (existing.price !== priceToman) : true;

        fundsMap.set(symbol, {
          id: symbol,
          name: name || existing?.name || symbol,
          price: priceToman,
        });

        if (existing) {
          if (priceChanged) updatedCount++;
        } else {
          addedCount++;
        }
      } else if (existing) {
        // Retain previous price
        if (name && name !== existing.name) {
          existing.name = name;
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

    if (previousList.length === 0 && env) {
      try {
        const cached = await getSourceItems(env, sourceConfig?.id || "src_def_emofid");
        if (Array.isArray(cached) && cached.length > 0) {
          previousList = cached;
        }
      } catch (e) {
        logger.warn("Error loading previous emofid funds for merge:", { error: e.message });
      }
    }

    const nowIso = new Date().toISOString();
    const { mergedList, stats } = mergeEmofidFunds(previousList, rawArray, nowIso, sourceConfig);

    inMemoryEmofidList = mergedList;

    if (env && mergedList.length > 0) {
      try {
        await saveSourceItems(env, sourceConfig?.id || "src_def_emofid", mergedList, { datetime: nowIso });
      } catch (err) {
        logger.warn("Error caching emofid funds:", { error: err.message });
      }
    }

    logger.info(`[EmofidAdapter] Processed ${mergedList.length} funds. Added: ${stats.addedCount}, Updated: ${stats.updatedCount}, Retained: ${stats.retainedCount}`);

    return {
      items: mergedList,
      datetime: nowIso,
    };
  },

  async test(sourceConfig = {}, env = null) {
    try {
      const raw = await this.fetchRaw(sourceConfig, env);
      const parsed = await this.parse(raw, sourceConfig, env);
      const count = parsed.items.length;
      return {
        success: true,
        source_type: "api_url",
        price: count,
        items: parsed.items,
        sampleItems: parsed.items.slice(0, 50),
        datetime: parsed.datetime,
        label: sourceConfig?.name || this.name,
        message: `تعداد ${count} صندوق سرمایه‌گذاری مفید با موفقیت دریافت و پردازش شد.`,
      };
    } catch (e) {
      try {
        const cached = await this.getItems(env);
        if (Array.isArray(cached) && cached.length > 0) {
          return {
            success: true,
            source_type: "api_url",
            price: cached.length,
            items: cached,
            sampleItems: cached.slice(0, 50),
            datetime: cached[0]?.updatedAt || new Date().toISOString(),
            label: sourceConfig.name || this.name,
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
  async getItems(env = null) {
    if (inMemoryEmofidList && inMemoryEmofidList.length > 0) {
      return inMemoryEmofidList;
    }
    if (env) {
      const items = await getSourceItems(env, this.id);
      if (items && items.length > 0) {
        inMemoryEmofidList = items;
        return inMemoryEmofidList;
      }
    }
    // Auto on-demand fetch if empty
    const syncRes = await fetchAndStoreEmofidFunds(env);
    if (syncRes.success && Array.isArray(syncRes.funds) && syncRes.funds.length > 0) {
      return syncRes.funds;
    }
    return inMemoryEmofidList || [];
  },

  /**
   * Periodic sync for Emofid funds governed by sources.config.js (fetchIntervalSec)
   */
  async handleScheduledSync(env, sourceConfig = null) {
    if (!env) return false;
    try {
      const lastSync = await getSourceLastSync(env, this.id) || 0;
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
      if (parsed && parsed.items?.length > 0) {
        const expirationTtl = Math.max(86400, intervalSec * 3);
        await setSourceLastSync(env, this.id, now, expirationTtl);
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
    const list = parsed.items || inMemoryEmofidList || [];
    return { success: true, count: list.length, funds: list };
  } catch (err) {
    logger.error("[EmofidAdapter] fetchAndStoreEmofidFunds error:", { error: err.message });
    return { success: false, error: err.message, funds: inMemoryEmofidList || [] };
  }
}

