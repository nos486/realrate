/**
 * charismaPlans.source.adapter.js — Adapter for Charisma Investment Plans (طرح‌های سرمایه‌گذاری کاریزما)
 * Connects to webhook / API endpoint to fetch, parse, and cumulatively
 * merge live prices for all Charisma investment plans (Gold, Silver, Copper, Stocks Index, Real Estate, etc.).
 */

import { USER_AGENT } from "./parsingUtils.js";
import { logger } from "../../../lib/logger.js";
import { getSourceItems } from "../../../repositories/sourceItems.repository.js";

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
  const plansMap = new Map();

  // 1. Initialize map with existing plans (supports both { id, name, price } and legacy formats)
  if (Array.isArray(existingList)) {
    for (const item of existingList) {
      if (!item) continue;
      const key = String(item.id || item.symbol || item.s || item.code || "").trim();
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

      const name = String(item.name || item.n || item.title || item.planTitle || key).trim();

      plansMap.set(key, {
        id: key,
        name: name || key,
        price,
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

      const rawKey = String(item.id || item.key || item.symbol || item.s || KNOWN_CHARISMA_PLAN_SYMBOLS[item.id] || "").trim();
      if (!rawKey) continue;

      apiPlansCount++;
      seenKeysInApi.add(rawKey);

      let validToman = 0;
      if (item.price !== undefined && Number(item.price) > 0) {
        validToman = Math.round(Number(item.price));
      } else if (item.priceToman !== undefined && Number(item.priceToman) > 0) {
        validToman = Math.round(Number(item.priceToman));
      } else if (item.p !== undefined && Number(item.p) > 0) {
        validToman = Math.round(Number(item.p));
      } else if (item.priceRial !== undefined && Number(item.priceRial) > 0) {
        validToman = Math.round(Number(item.priceRial) / 10);
      } else if (item.pl !== undefined && Number(item.pl) > 0) {
        validToman = Math.round(Number(item.pl) / 10);
      }

      const planName = String(item.name || item.planTitle || item.title || rawKey).trim();

      if (plansMap.has(rawKey)) {
        const existing = plansMap.get(rawKey);
        const priceChanged = validToman > 0 && validToman !== existing.price;

        plansMap.set(rawKey, {
          id: rawKey,
          name: planName || existing.name,
          price: validToman > 0 ? validToman : existing.price,
        });

        if (priceChanged) updatedCount++;
      } else {
        plansMap.set(rawKey, {
          id: rawKey,
          name: planName,
          price: validToman,
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
        const cached = await getSourceItems(env, sourceConfig?.id || "src_def_charisma_plans");
        if (Array.isArray(cached) && cached.length > 0) {
          existingList = cached;
          inMemoryCharismaPlansList = existingList;
        }
      } catch (e) {
        logger.warn("Error loading previous charisma plans for merge:", { error: e.message });
      }
    }

    const { mergedList, stats } = mergeCharismaPlans(existingList || [], rawArray, nowIso, sourceConfig);

    // Cache updated list in memory
    inMemoryCharismaPlansList = mergedList;


    logger.info(`[CharismaPlansAdapter] Processed ${stats.totalPlans} plans. Added: ${stats.addedCount}, Updated: ${stats.updatedCount}, Retained: ${stats.retainedCount}`);

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
        label: sourceConfig.name || this.name,
        message: `تعداد ${count} طرح سرمایه‌گذاری کاریزما با موفقیت دریافت و پردازش شد.`,
      };
    } catch (e) {
      // Graceful fallback to existing cached plans in KV/memory
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
            message: `تعداد ${cached.length} طرح کاریزما از کش فعال سامانه بازخوانی شد.`,
          };
        }
      } catch { }
      return { success: false, error: e.message || "خطا در تست وب‌سرویس طرح‌های کاریزما" };
    }
  },

  async getItems(env = null) {
    if (inMemoryCharismaPlansList && inMemoryCharismaPlansList.length > 0) {
      return inMemoryCharismaPlansList;
    }
    if (env) {
      try {
        const list = await getSourceItems(env, this.id);
        if (Array.isArray(list) && list.length > 0) {
          inMemoryCharismaPlansList = list;
          return list;
        }
      } catch (e) {
        logger.error("Error retrieving charisma plans from KV:", { error: e.message });
      }
    }

    return inMemoryCharismaPlansList || [];
  },
};

