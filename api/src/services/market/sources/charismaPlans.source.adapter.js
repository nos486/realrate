/**
 * charismaPlans.source.adapter.js — Adapter for Charisma Investment Plans API
 * Connects to https://webapi.charisma.ir/api/Plan/plans to fetch, parse, and cumulatively
 * merge rates and details for all Charisma investment plans (طلا، نقره، مس، استاکس، ملک، درآمد ثابت، مگاسود).
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

export const CHARISMA_PLANS_API_URL = "https://webapi.charisma.ir/api/Plan/plans";
export const CHARISMA_PLAN_PAGE_BASE = "https://charisma.ir/plans/";

let inMemoryCharismaPlansList = null;

/**
 * Standard Persian title mapping for Charisma plan symbols
 */
export const KNOWN_CHARISMA_PLAN_SYMBOLS = {
  gold: "طرح طلا",
  silver: "طرح نقره",
  copper: "طرح مس",
  "stocks-index": "طرح استاکس",
  "real-estate": "طرح ملک",
  "fixed-income": "طرح درآمد ثابت",
  "fixedincome-mega-sood": "طرح مگاسود",
};

/**
 * Merges raw Charisma plan records with an existing plans list:
 * - Filters out the non-investable 'main' overview landing page.
 * - Extracts live price (calculatorInformation.lastPrice) in Rials (IRR) and Tomans (Rials / 10).
 * - 100% preservation of missing plans (plans not in latest API response retain last valid price & timestamp).
 * - Never overwrites an existing price with zero, null, or undefined.
 *
 * @param {Array} existingList - Existing plan objects
 * @param {Array} rawApiArray - Raw plan objects from Charisma API
 * @param {string} [nowIso] - Current ISO timestamp
 * @param {object} [sourceConfig] - Source configuration
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
  const defaultSourceName = sourceConfig?.name || charismaPlansSourceAdapter?.name || "طرح‌های سرمایه‌گذاری کاریزما (Charisma Plans)";
  const defaultSourceId = sourceConfig?.id || charismaPlansSourceAdapter?.id || "src_def_charisma_plans";
  const plansMap = new Map();

  // 1. Initialize map with existing plans
  if (Array.isArray(existingList)) {
    for (const item of existingList) {
      if (!item) continue;
      const key = String(item.symbol || item.s || item.code || item.id || "").trim();
      if (!key || key.toLowerCase() === "main") continue;

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
        n: item.name || item.n || item.title || key,
        name: item.name || item.n || item.title || key,
        faSymbol: item.faSymbol || "",
        p: toman,
        price: toman,
        priceToman: toman,
        priceRial: rial,
        pl: rial,
        unit: "IRR",
        isPlan: true,
        isFund: false,
        category: "طرح سرمایه‌گذاری",
        type: "طرح",
        manager: "کاریزما (Charisma)",
        sourceName: item.sourceName || defaultSourceName,
        sourceId: item.sourceId || defaultSourceId,
        order: Number(item.order) || 0,
        changePercent: Number(item.changePercent ?? item.cp ?? 0),
        planData: item.planData || null,
        updatedAt: item.updatedAt || nowIso,
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

      const enSym = item.generalInformation?.enSymbol || item.enSymbol || item.id;
      const symbol = String(enSym || "").trim();
      // Exclude main landing overview
      if (!symbol || symbol.toLowerCase() === "main") continue;

      seenKeysInApi.add(symbol);

      const name = String(
        item.generalInformation?.title || item.title || KNOWN_CHARISMA_PLAN_SYMBOLS[symbol] || symbol
      ).trim();
      const faSymbol = String(item.generalInformation?.faSymbol || item.faSymbol || "").trim();

      // Extract price from calculatorInformation.lastPrice or direct price properties
      let rawPrice = 0;
      if (item.calculatorInformation?.lastPrice !== undefined && item.calculatorInformation?.lastPrice !== null) {
        rawPrice = Number(item.calculatorInformation.lastPrice);
      } else if (item.priceRial !== undefined && item.priceRial !== null) {
        rawPrice = Number(item.priceRial);
      } else if (item.price !== undefined && item.price !== null) {
        rawPrice = Number(item.price);
      }

      const changePercent = Number(item.calculatorInformation?.last24HChange ?? item.changePercent ?? 0);
      const updateDateTime = item.calculatorInformation?.lastUpdateDateTime || nowIso;

      const existing = plansMap.get(symbol);

      const planData = {
        calculatorTitle: item.calculatorInformation?.title || existing?.planData?.calculatorTitle || null,
        investmentUri: item.calculatorInformation?.investmentUri || existing?.planData?.investmentUri || null,
        installmentInvestmentUri: item.calculatorInformation?.installmentInvestmentUri || existing?.planData?.installmentInvestmentUri || null,
        imageUri: item.generalInformation?.imageUri || existing?.planData?.imageUri || null,
        description: item.generalInformation?.description || item.generalInformation?.desktopDescription || existing?.planData?.description || null,
      };

      if (rawPrice > 0) {
        const rawPriceRial = Math.round(rawPrice);
        const priceToman = Math.round(rawPriceRial / 10);
        const priceChanged = existing ? existing.priceRial !== rawPriceRial : true;

        plansMap.set(symbol, {
          s: symbol,
          symbol,
          n: name || existing?.n || symbol,
          name: name || existing?.name || symbol,
          faSymbol: faSymbol || existing?.faSymbol || "",
          p: priceToman,
          price: priceToman,
          priceToman,
          priceRial: rawPriceRial,
          pl: rawPriceRial,
          unit: "IRR",
          isPlan: true,
          isFund: false,
          category: "طرح سرمایه‌گذاری",
          type: "طرح",
          manager: "کاریزما (Charisma)",
          sourceName: existing?.sourceName || defaultSourceName,
          sourceId: existing?.sourceId || defaultSourceId,
          order: Number(item.order ?? existing?.order ?? 0),
          changePercent,
          planData,
          updatedAt: existing && !priceChanged ? existing.updatedAt : updateDateTime,
        });

        if (existing) {
          if (priceChanged) updatedCount++;
        } else {
          addedCount++;
        }
      } else if (existing) {
        // Retain previous valid price if API price is 0 or unavailable
        if (name && name !== existing.name) {
          existing.name = name;
          existing.n = name;
        }
        if (faSymbol && faSymbol !== existing.faSymbol) {
          existing.faSymbol = faSymbol;
        }
        existing.planData = planData;
      } else {
        // New plan with 0 price (e.g. fixed-income with annual rate)
        plansMap.set(symbol, {
          s: symbol,
          symbol,
          n: name || symbol,
          name: name || symbol,
          faSymbol: faSymbol || "",
          p: 0,
          price: 0,
          priceToman: 0,
          priceRial: 0,
          pl: 0,
          unit: "IRR",
          isPlan: true,
          isFund: false,
          category: "طرح سرمایه‌گذاری",
          type: "طرح",
          manager: "کاریزما (Charisma)",
          sourceName: defaultSourceName,
          sourceId: defaultSourceId,
          order: Number(item.order || 0),
          changePercent,
          planData,
          updatedAt: updateDateTime,
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
  mergedList.sort((a, b) => (a.order || 99) - (b.order || 99));

  return {
    mergedList,
    stats: {
      totalPlans: mergedList.length,
      updatedCount,
      addedCount,
      retainedCount,
      apiPlansCount: seenKeysInApi.size,
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
    if (sType === "charisma_plans" || sType === "charisma_plan") return true;

    const pType = String(sourceConfig.priceType || sourceConfig.price_type || "").toLowerCase().trim();
    if (pType === "charisma_plans" || pType === "charisma_plan") return true;

    const endpoint = String(sourceConfig.endpoint || sourceConfig.apiUrl || "").toLowerCase();
    return endpoint.includes("charisma.ir") && endpoint.includes("plan");
  },

  async fetchRaw(sourceConfig = {}, env = null) {
    const targetUrl = sourceConfig.endpoint || sourceConfig.apiUrl || CHARISMA_PLANS_API_URL;

    // 1. Fetch plans catalog from webapi.charisma.ir
    const res = await fetch(targetUrl, {
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json, text/plain, */*",
      },
    });

    if (!res.ok) {
      throw new Error(`خطای وب‌سرویس طرح‌های کاریزما (کد ${res.status}: ${res.statusText})`);
    }

    const rawPlans = await res.json();
    const plansArray = Array.isArray(rawPlans)
      ? rawPlans
      : Array.isArray(rawPlans?.data)
      ? rawPlans.data
      : Array.isArray(rawPlans?.plans)
      ? rawPlans.plans
      : [];

    // Filter out non-investable main landing
    const investablePlans = plansArray.filter(
      (p) => p && (p.generalInformation?.enSymbol || p.enSymbol) !== "main"
    );

    // 2. Parallel fetch real-time prices from individual plan pages if lastPrice is 0
    await Promise.allSettled(
      investablePlans.map(async (plan) => {
        const enSymbol = plan.generalInformation?.enSymbol || plan.enSymbol;
        if (!enSymbol) return;

        // If price is already present and > 0, skip scraping
        if (Number(plan.calculatorInformation?.lastPrice) > 0) return;

        try {
          const pageRes = await fetch(`${CHARISMA_PLAN_PAGE_BASE}${enSymbol}`, {
            signal: AbortSignal.timeout(5000),
            headers: {
              "User-Agent": USER_AGENT,
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
          });

          if (pageRes.ok) {
            const html = await pageRes.text();
            const match = html.match(/<script id=\"__NEXT_DATA__\" type=\"application\/json\">([\s\S]*?)<\/script>/);
            if (match && match[1]) {
              const nextData = JSON.parse(match[1]);
              const solData = nextData.props?.pageProps?.solutionData;
              if (solData?.calculatorInformation) {
                plan.calculatorInformation = {
                  ...plan.calculatorInformation,
                  ...solData.calculatorInformation,
                };
              }
            }
          }
        } catch (err) {
          logger.warn(`[CharismaPlansAdapter] Could not enrich live price for ${enSymbol}:`, {
            error: err.message,
          });
        }
      })
    );

    return investablePlans;
  },

  async parse(rawPayload, sourceConfig = {}, env = null) {
    const rawArray = Array.isArray(rawPayload)
      ? rawPayload
      : rawPayload?.data || rawPayload?.plans || rawPayload?.items || [];

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
        }).catch(() => {});
      } catch (err) {
        logger.warn("Error caching charisma plans in KV:", { error: err.message });
      }
    }

    logger.info(
      `[CharismaPlansAdapter] Processed ${stats.totalPlans} plans. Added: ${stats.addedCount}, Updated: ${stats.updatedCount}, Retained: ${stats.retainedCount}`
    );

    return {
      price: mergedList.length,
      priceType: "charisma_plans",
      datetime: nowIso,
      label: sourceConfig?.name || "طرح‌های سرمایه‌گذاری کاریزما (Charisma Plans)",
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
        const cached = await this.getPlans(env);
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
      } catch {}
      return { success: false, error: e.message || "خطا در تست وب‌سرویس طرح‌های کاریزما" };
    }
  },

  async getPlans(env = null) {
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
    return await this.getPlans(env);
  },

  async handleScheduledSync(env, sourceConfig = null) {
    if (!env) return false;

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
          return false;
        }
      }

      logger.info("[CharismaPlansAdapter] Starting scheduled Charisma plans sync...");

      const raw = await this.fetchRaw({}, env);
      await this.parse(raw, { id: "src_def_charisma_plans", name: sourceConfig?.name || this.name }, env);
      const expirationTtl = Math.max(86400, intervalSec * 3);
      await setCharismaPlansLastSync(env, now, expirationTtl);

      logger.info("[CharismaPlansAdapter] Scheduled Charisma plans sync completed successfully.");
      return true;
    } catch (err) {
      logger.error("[CharismaPlansAdapter] Scheduled sync failed:", { error: err.message, stack: err.stack });
      return false;
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
