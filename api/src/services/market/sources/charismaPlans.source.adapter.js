/**
 * charismaPlans.source.adapter.js — Adapter for Charisma Investment Plans (طرح‌های سرمایه‌گذاری کاریزما)
 * Connects to webhook / API endpoint to fetch, parse, and cumulatively
 * merge live prices for all Charisma investment plans (Gold, Silver, Copper, Stocks Index, Real Estate, etc.).
 */

import { USER_AGENT } from "./parsingUtils.js";
import { logger } from "../../../lib/logger.js";
import {
  getCharismaPlansCache,
  setCharismaPlansCache,
  getCharismaPlansLastSync,
  setCharismaPlansLastSync,
  setSourcePriceCache,
} from "../../../repositories/kvCache.repository.js";
import {
  getSourceConfig,
  getSourceParser,
  resolveAssetDisplayName,
  resolveAssetUnit,
} from "../../../config/sourceRegistry.js";

export const CHARISMA_PLANS_WEBHOOK_URL = "https://n8n.geekio.ir/webhook/38899601-0906-4aa4-aedb-8f7de5493894";

let inMemoryCharismaPlansList = null;

export const KNOWN_CHARISMA_PLAN_SYMBOLS = {
  gold: "gold",
  silver: "silver",
  copper: "copper",
  "stocks-index": "stocks-index",
  "real-estate": "real-estate",
};

/**
 * Merges raw Charisma plan records with an existing plans list:
 * - Extracts price in Tomans (priceToman) and Rials (priceRial).
 * - 100% preservation of missing plans (plans not in latest API response keep their last valid price & timestamp).
 * - Never overwrite an existing price with zero, null, or undefined.
 *
 * @param {Array} existingList - Existing plan objects
 * @param {Array} rawApiArray - Raw plan objects extracted from webhook / API
 * @param {string} [nowIso] - Current ISO timestamp
 * @param {object} [sourceConfig] - Optional source configuration
 * @returns {{
 *   mergedList: Array,
 *   stats: {
 *     totalPlans: number,
 *     updatedCount: number,
 *     addedCount: number,
 *     retainedCount: number,
 *     apiPlansCount: number,
 *   }
 * }}
 */
export function mergeCharismaPlans(existingList = [], rawApiArray = [], nowIso = new Date().toISOString(), sourceConfig = null) {
  const srcCfg = sourceConfig || getSourceConfig("charisma_plans");
  const defaultSourceName = srcCfg?.name || charismaPlansSourceAdapter?.name || "طرح‌های سرمایه‌گذاری کاریزما (Charisma Plans)";
  const defaultSourceId = srcCfg?.id || charismaPlansSourceAdapter?.id || "src_def_charisma_plans";
  const defaultUnit = srcCfg?.unit || "واحد";
  const defaultCategory = srcCfg?.category || "bourse_fund";
  const defaultBadge = srcCfg?.badge || "طرح";
  const defaultIsFund = Boolean(srcCfg?.isFund !== undefined ? srcCfg.isFund : true);
  const plansMap = new Map();

  // 1. Initialize map with existing plans
  if (Array.isArray(existingList)) {
    for (const item of existingList) {
      if (!item) continue;
      const key = String(item.symbol || item.s || item.code || item.id || "").trim();
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

      plansMap.set(key, {
        s: key,
        symbol: key,
        n: item.name || item.n || item.title || item.planTitle || key,
        name: item.name || item.n || item.title || item.planTitle || key,
        p: toman,
        price: toman,
        priceToman: toman,
        priceRial: rial,
        pl: rial,
        unit: item.unit || "واحد",
        isFund: true,
        category: "bourse_fund",
        badge: "طرح",
        planCategory: item.planCategory || item.category || "COMMODITY",
        type: item.type || "طرح سرمایه‌گذاری",
        manager: "کاریزما (Charisma)",
        sourceName: item.sourceName || defaultSourceName,
        sourceId: item.sourceId || defaultSourceId,
        updatedAt: item.updatedAt || nowIso,
      });
    }
  }

  let updatedCount = 0;
  let addedCount = 0;
  let apiPlansCount = 0;
  const seenKeysInApi = new Set();

  // 2. Process incoming raw items from webhook
  if (Array.isArray(rawApiArray)) {
    for (const item of rawApiArray) {
      if (!item || typeof item !== "object") continue;

      const rawKey = String(item.symbol || KNOWN_CHARISMA_PLAN_SYMBOLS[item.id] || item.id || "").trim();
      if (!rawKey) continue;

      apiPlansCount++;
      seenKeysInApi.add(rawKey);

      let validToman = 0;
      let validRial = 0;

      if (item.priceToman !== undefined && Number(item.priceToman) > 0) {
        validToman = Math.round(Number(item.priceToman));
      } else if (item.price !== undefined && Number(item.price) > 0) {
        validToman = Math.round(Number(item.price));
      } else if (item.p !== undefined && Number(item.p) > 0) {
        validToman = Math.round(Number(item.p));
      }

      if (item.priceRial !== undefined && Number(item.priceRial) > 0) {
        validRial = Math.round(Number(item.priceRial));
      } else if (item.pl !== undefined && Number(item.pl) > 0) {
        validRial = Math.round(Number(item.pl));
      }

      if (!validToman && validRial > 0) {
        validToman = Math.round(validRial / 10);
      }
      if (!validRial && validToman > 0) {
        validRial = validToman * 10;
      }

      const planName = String(item.planTitle || item.name || item.title || rawKey).trim();
      const planCategory = String(item.category || item.planCategory || "COMMODITY").trim();

      if (plansMap.has(rawKey)) {
        const existing = plansMap.get(rawKey);
        const priceChanged = validToman > 0 && validToman !== existing.priceToman;

        plansMap.set(rawKey, {
          ...existing,
          n: planName || existing.n,
          name: planName || existing.name,
          p: validToman > 0 ? validToman : existing.p,
          price: validToman > 0 ? validToman : existing.price,
          priceToman: validToman > 0 ? validToman : existing.priceToman,
          priceRial: validRial > 0 ? validRial : existing.priceRial,
          pl: validRial > 0 ? validRial : existing.pl,
          planCategory: planCategory || existing.planCategory,
          sourceName: defaultSourceName,
          sourceId: defaultSourceId,
          updatedAt: priceChanged ? nowIso : existing.updatedAt,
        });

        if (priceChanged) updatedCount++;
      } else {
        plansMap.set(rawKey, {
          s: rawKey,
          symbol: rawKey,
          n: planName,
          name: planName,
          p: validToman,
          price: validToman,
          priceToman: validToman,
          priceRial: validRial,
          pl: validRial,
          unit: defaultUnit,
          isFund: defaultIsFund,
          category: defaultCategory,
          badge: defaultBadge,
          planCategory,
          type: "طرح سرمایه‌گذاری",
          manager: "کاریزما (Charisma)",
          sourceName: defaultSourceName,
          sourceId: defaultSourceId,
          updatedAt: nowIso,
        });
        addedCount++;
      }
    }
  }

  // Count retained plans that were not in the latest API response
  let retainedCount = 0;
  for (const sym of plansMap.keys()) {
    if (!seenKeysInApi.has(sym)) {
      retainedCount++;
    }
  }

  const mergedList = Array.from(plansMap.values());

  return {
    mergedList,
    stats: {
      totalPlans: mergedList.length,
      updatedCount,
      addedCount,
      retainedCount,
      apiPlansCount,
    },
  };
}

/**
 * Charisma Investment Plans Source Adapter Implementation
 * @type {import("./ISourceAdapter.js").SourceAdapter}
 */
export const charismaPlansSourceAdapter = {
  id: "charisma_plans",
  name: "طرح‌های سرمایه‌گذاری کاریزما (Charisma Plans)",

  supports(sourceConfig = {}) {
    const sType = String(sourceConfig.sourceType || sourceConfig.source_type || "").toLowerCase().trim();
    if (sType === "charisma_plans") return true;

    const pType = String(sourceConfig.priceType || sourceConfig.price_type || "").toLowerCase().trim();
    if (pType === "charisma_plans") return true;

    const endpoint = String(sourceConfig.endpoint || sourceConfig.apiUrl || "").toLowerCase();
    return endpoint.includes("38899601-0906-4aa4-aedb-8f7de5493894") || (endpoint.includes("charisma") && endpoint.includes("plan"));
  },

  async fetchRaw(sourceConfig = {}, env = null) {
    const targetUrl = sourceConfig.endpoint || sourceConfig.apiUrl || CHARISMA_PLANS_WEBHOOK_URL;

    const res = await fetch(targetUrl, {
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json, text/plain, */*",
      },
    });

    if (!res.ok) {
      throw new Error(`Charisma Plans HTTP error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    return Array.isArray(data) ? data : (data?.data || data?.plans || data?.items || []);
  },

  async parse(rawPayload, sourceConfig = {}, env = null) {
    const rawArray = Array.isArray(rawPayload)
      ? rawPayload
      : (rawPayload?.data || rawPayload?.plans || rawPayload?.items || []);

    const nowIso = new Date().toISOString();

    // Load existing plans list from memory or KV
    let existingList = inMemoryCharismaPlansList;
    if (!existingList && env) {
      try {
        const { cached, backup } = await getCharismaPlansCache(env);
        const dataStr = cached || backup;
        if (dataStr) {
          existingList = JSON.parse(dataStr);
          inMemoryCharismaPlansList = existingList;
        }
      } catch (e) {
        logger.warn("Error loading previous charisma plans for merge:", { error: e.message });
      }
    }

    const { mergedList, stats } = mergeCharismaPlans(existingList || [], rawArray, nowIso, sourceConfig);

    // Cache updated list in memory
    inMemoryCharismaPlansList = mergedList;

    const multiDataObj = {
      isCatalog: true,
      totalCount: mergedList.length,
      items: mergedList,
      compactList: mergedList,
      sampleItems: mergedList.slice(0, 50),
      datetime: nowIso,
      stats,
    };

    // Cache updated list in KV
    if (env && mergedList.length > 0) {
      try {
        const compactJson = JSON.stringify(mergedList);
        await setCharismaPlansCache(env, compactJson);
        await setSourcePriceCache(env, sourceConfig?.id || "src_def_charisma_plans", {
          price: mergedList.length,
          lastFetched: nowIso,
          priceType: "charisma_plans",
          name: sourceConfig?.name || "طرح‌های سرمایه‌گذاری کاریزما (Charisma Plans)",
          lastMultiData: multiDataObj,
        }).catch(() => { });
      } catch (err) {
        logger.warn("Error caching charisma plans in KV:", { error: err.message });
      }
    }

    logger.info(`[CharismaPlansAdapter] Processed ${stats.totalPlans} plans. Added: ${stats.addedCount}, Updated: ${stats.updatedCount}, Retained: ${stats.retainedCount}`);

    return {
      price: mergedList.length,
      priceType: "charisma_plans",
      datetime: nowIso,
      label: sourceConfig.name || "طرح‌های سرمایه‌گذاری کاریزما (Charisma Plans)",
      multiData: multiDataObj,
      compactList: mergedList,
      sampleItems: mergedList.slice(0, 50),
      multiOutput: mergedList,
      sourceId: sourceConfig?.id || "src_def_charisma_plans",
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
        message: `تعداد ${parsed.price} طرح سرمایه‌گذاری کاریزما با موفقیت دریافت و پردازش شد.`,
      };
    } catch (e) {
      // Graceful fallback to existing cached plans in KV/memory
      try {
        const cached = await this.getLatestPlans(env);
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
            label: sourceConfig.name || "طرح‌های سرمایه‌گذاری کاریزما (Charisma Plans)",
            message: `تعداد ${cached.length} طرح کاریزما از کش فعال سامانه بازخوانی شد.`,
          };
        }
      } catch { }
      return { success: false, error: e.message || "خطا در تست وب‌سرویس طرح‌های کاریزما" };
    }
  },

  async getLatestPlans(env = null) {
    if (inMemoryCharismaPlansList && inMemoryCharismaPlansList.length > 0) {
      return inMemoryCharismaPlansList;
    }
    if (env) {
      try {
        const { cached, backup } = await getCharismaPlansCache(env);
        const dataStr = cached || backup;
        if (dataStr) {
          const list = JSON.parse(dataStr);
          if (Array.isArray(list) && list.length > 0) {
            inMemoryCharismaPlansList = list;
            return list;
          }
        }
      } catch (e) {
        logger.error("Error retrieving charisma plans from KV:", { error: e.message });
      }
    }

    // Auto on-demand fetch if empty
    const syncRes = await fetchAndStoreCharismaPlans(env);
    if (syncRes.success && Array.isArray(syncRes.plans) && syncRes.plans.length > 0) {
      return syncRes.plans;
    }
    return inMemoryCharismaPlansList || [];
  },

  async getItems(env = null) {
    return await this.getLatestPlans(env);
  },

  async handleScheduledSync(env, sourceConfig = null) {
    if (!env) return;

    try {
      const lastSync = await getCharismaPlansLastSync(env);
      const now = Date.now();

      const intervalSec = Number(sourceConfig?.fetchIntervalSec) > 0
        ? Number(sourceConfig.fetchIntervalSec)
        : 1800;
      const intervalMs = intervalSec * 1000;

      if (lastSync) {
        const elapsed = now - Number(lastSync);
        if (elapsed < intervalMs) {
          return;
        }
      }

      logger.info("[CharismaPlansAdapter] Starting scheduled Charisma plans sync...");

      const raw = await this.fetchRaw({}, env);
      await this.parse(raw, { id: "src_def_charisma_plans", name: sourceConfig?.name || this.name }, env);
      const expirationTtl = Math.max(86400, intervalSec * 3);
      await setCharismaPlansLastSync(env, now, expirationTtl);

      logger.info("[CharismaPlansAdapter] Scheduled Charisma plans sync completed successfully.");
    } catch (err) {
      logger.error("[CharismaPlansAdapter] Scheduled sync failed:", { error: err.message, stack: err.stack });
    }
  },
};

/**
 * Direct helper to fetch, parse, and persist Charisma plans to memory and KV
 * @param {object} [env=null]
 * @returns {Promise<{ success: boolean, count?: number, plans: Array, error?: string }>}
 */
export async function fetchAndStoreCharismaPlans(env = null) {
  try {
    const raw = await charismaPlansSourceAdapter.fetchRaw({}, env);
    const parsed = await charismaPlansSourceAdapter.parse(
      raw,
      { id: "src_def_charisma_plans", name: charismaPlansSourceAdapter.name },
      env
    );
    const list = parsed.multiOutput || inMemoryCharismaPlansList || [];
    return { success: true, count: list.length, plans: list };
  } catch (err) {
    logger.error("[CharismaPlansAdapter] fetchAndStoreCharismaPlans error:", { error: err.message });
    return { success: false, error: err.message, plans: inMemoryCharismaPlansList || [] };
  }
}
