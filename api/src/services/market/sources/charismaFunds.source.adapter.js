/**
 * charismaFunds.source.adapter.js — Adapter for Charisma Investment Funds API
 * Connects to https://charisma.ir/funds to fetch, parse, and cumulatively
 * merge closing prices (قیمت پایانی) for all Charisma investment funds.
 */

import { USER_AGENT } from "./parsingUtils.js";
import { logger } from "../../../lib/logger.js";
import {
  saveSourceItems,
  getSourceItems,
  getSourceLastSync,
  setSourceLastSync,
} from "../../../repositories/sourceItems.repository.js";

export const CHARISMA_PAGE_URL = "https://charisma.ir/funds";
export const CHARISMA_API_URL = "https://webapi.charisma.ir/api/fund";

let inMemoryCharismaList = null;

/**
 * Standard known mapping from Charisma enSymbol/englishTitle to official Bourse symbol
 */
export const KNOWN_CHARISMA_SYMBOLS = {
  'noghran': 'نقران',
  'kahroba': 'کهربا',
  'ahrom': 'اهرم',
  'kara': 'کارا',
  'metal': 'متال',
  'kamand': 'کمند',
  'kakh': 'کاخ',
  'karis': 'کاریس',
  'mazeh': 'مزه',
  'cimana': 'سیمانا',
  'zeman': 'ضمان',
  'sanam': 'صنم',
  'index': 'هم‌تراز',
  'roshan': 'روشن',
  'fixedmutual': 'ثابت',
  'tazmin': 'تضمین',
  'ahromi': 'اهرمی',
  'oragh-dolati': 'دولتی',
  'tehranfund': 'نیکوکاری',
  'pension-fund': 'کاریز',
  'kaman': 'کمان',
  'mokhtalet': 'مختلط',
};

/**
 * Merges raw Charisma fund records with an existing funds list:
 * - Extracts closing price (sellOrClosedPriceInfo) in Rials (IRR) and Tomans (Rials / 10).
 * - 100% preservation of missing funds (funds not in the latest API response keep their last valid price & timestamp).
 * - Never overwrite an existing price with zero, null, or undefined.
 *
 * @param {Array} existingList - Existing fund objects
 * @param {Array} rawApiArray - Raw fund objects extracted from Charisma pageProps
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
export function mergeCharismaFunds(existingList = [], rawApiArray = [], nowIso = new Date().toISOString(), sourceConfig = null) {
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

  // 2. Incremental upsert from rawApiArray (Extract closing price: sellOrClosedPriceInfo)
  if (Array.isArray(rawApiArray)) {
    for (const item of rawApiArray) {
      if (!item || typeof item !== "object") continue;

      const rawSymbol = item.shortSymbol || item.symbol || KNOWN_CHARISMA_SYMBOLS[item.englishTitle] || KNOWN_CHARISMA_SYMBOLS[item.enSymbol] || item.englishTitle || item.id || item.title;
      const symbol = String(rawSymbol).trim();
      const name = String(item.subtitle || item.title || item.name || symbol).trim();
      if (!symbol) continue;

      seenKeysInApi.add(symbol);

      // Extract closing price (sellOrClosedPriceInfo in Rials)
      let rawClosingPrice = 0;
      if (Array.isArray(item.fields)) {
        const closedField = item.fields.find(f => f.key === 'sellOrClosedPriceInfo');
        if (closedField && closedField.value !== undefined && closedField.value !== null) {
          rawClosingPrice = Number(closedField.value);
        }
        // Fallback to buyOrLastPriceInfo if closing price is 0
        if (!rawClosingPrice) {
          const lastField = item.fields.find(f => f.key === 'buyOrLastPriceInfo');
          if (lastField && lastField.value !== undefined && lastField.value !== null) {
            rawClosingPrice = Number(lastField.value);
          }
        }
      } else if (item.priceRial || item.closedPriceRials) {
        rawClosingPrice = Number(item.priceRial || item.closedPriceRials);
      } else if (item.price !== undefined || item.priceToman !== undefined || item.p !== undefined) {
        rawClosingPrice = Number(item.price || item.priceToman || item.p) * 10;
      }

      const existing = fundsMap.get(symbol);

      if (rawClosingPrice > 0) {
        const rawPriceRial = Math.round(rawClosingPrice);
        const priceToman = Math.round(rawPriceRial / 10);
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
        // Price in API is zero/invalid -> RETAIN PREVIOUS VALID PRICE!
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
 * Charisma Investment Funds Source Adapter Implementation
 * @type {import("./ISourceAdapter.js").SourceAdapter}
 */
export const charismaFundsSourceAdapter = {
  id: "charisma_funds",
  name: "صندوق‌های سرمایه‌گذاری کاریزما (Charisma)",

  supports(sourceConfig = {}) {
    const sType = String(sourceConfig.sourceType || sourceConfig.source_type || "").toLowerCase().trim();
    if (sType === "charisma_funds") return true;

    const pType = String(sourceConfig.priceType || sourceConfig.price_type || "").toLowerCase().trim();
    if (pType === "charisma_funds" || pType === "charisma") return true;

    const endpoint = String(sourceConfig.endpoint || sourceConfig.apiUrl || "").toLowerCase();
    return endpoint.includes("charisma.ir");
  },

  async fetchRaw(sourceConfig = {}, env = null) {
    const targetUrl = sourceConfig.endpoint || sourceConfig.apiUrl || CHARISMA_PAGE_URL;

    // 1. Fetch main funds page HTML (contains __NEXT_DATA__ with all tabs and price fields)
    const res = await fetch(targetUrl, {
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fa,en-US;q=0.9,en;q=0.8",
      },
    });

    if (!res.ok) {
      throw new Error(`Charisma Funds HTTP error: ${res.status} ${res.statusText}`);
    }

    const html = await res.text();
    const match = html.match(/<script id=\"__NEXT_DATA__\" type=\"application\/json\">([\s\S]*?)<\/script>/);

    if (!match || !match[1]) {
      throw new Error("Could not find __NEXT_DATA__ script in Charisma funds HTML");
    }

    const nextData = JSON.parse(match[1]);
    const tabs = nextData?.props?.pageProps?.funds || [];

    // Deduplicate funds across all tabs by id
    const fundsById = new Map();
    if (Array.isArray(tabs)) {
      for (const tab of tabs) {
        if (Array.isArray(tab.data)) {
          for (const item of tab.data) {
            if (item && item.id && !fundsById.has(item.id)) {
              fundsById.set(item.id, item);
            }
          }
        }
      }
    }

    // 2. Optionally fetch webapi.charisma.ir/api/fund for enhanced shortSymbol mapping
    try {
      const apiRes = await fetch(CHARISMA_API_URL, {
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": USER_AGENT },
      });
      if (apiRes.ok) {
        const apiFunds = await apiRes.json();
        if (Array.isArray(apiFunds)) {
          for (const apiItem of apiFunds) {
            if (apiItem && apiItem.id && fundsById.has(apiItem.id)) {
              const existing = fundsById.get(apiItem.id);
              if (apiItem.shortSymbol) existing.shortSymbol = apiItem.shortSymbol;
              if (apiItem.symbol && !existing.shortSymbol) existing.shortSymbol = apiItem.symbol;
              if (apiItem.enSymbol) existing.enSymbol = apiItem.enSymbol;
            }
          }
        }
      }
    } catch (e) {
      logger.warn("Could not fetch secondary Charisma API metadata (using fallback symbols):", { error: e.message });
    }

    return Array.from(fundsById.values());
  },

  async parse(rawPayload, sourceConfig = {}, env = null) {
    const rawArray = Array.isArray(rawPayload)
      ? rawPayload
      : (rawPayload?.data || rawPayload?.funds || []);

    const nowIso = new Date().toISOString();

    // Load existing funds list from memory or KV
    let existingList = inMemoryCharismaList;
    if (!existingList && env) {
      try {
        const cached = await getSourceItems(env, sourceConfig?.id || "src_def_charisma");
        if (Array.isArray(cached) && cached.length > 0) {
          existingList = cached;
          inMemoryCharismaList = existingList;
        }
      } catch (e) {
        logger.warn("Error loading previous charisma funds for merge:", { error: e.message });
      }
    }

    const { mergedList, stats } = mergeCharismaFunds(existingList || [], rawArray, nowIso, sourceConfig);

    // Cache updated list in memory
    inMemoryCharismaList = mergedList;

    // Cache updated list in KV
    if (env && mergedList.length > 0) {
      try {
        await saveSourceItems(env, sourceConfig?.id || "src_def_charisma", mergedList, { datetime: nowIso });
      } catch (err) {
        logger.warn("Error caching charisma funds:", { error: err.message });
      }
    }

    logger.info(`[CharismaAdapter] Processed ${stats.totalFunds} funds. Added: ${stats.addedCount}, Updated: ${stats.updatedCount}, Retained: ${stats.retainedCount}`);

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
        message: `تعداد ${count} صندوق سرمایه‌گذاری کاریزما با موفقیت دریافت و پردازش شد.`,
      };
    } catch (e) {
      // Graceful fallback to existing cached funds in KV/memory
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
            message: `تعداد ${cached.length} صندوق کاریزما از کش فعال سامانه بازخوانی شد.`,
          };
        }
      } catch {}
      return { success: false, error: e.message || "خطا در تست وب‌سرویس کاریزما" };
    }
  },

  async getItems(env = null) {
    if (inMemoryCharismaList && inMemoryCharismaList.length > 0) {
      return inMemoryCharismaList;
    }
    if (env) {
      try {
        const list = await getSourceItems(env, this.id);
        if (Array.isArray(list) && list.length > 0) {
          inMemoryCharismaList = list;
          return list;
        }
      } catch (e) {
        logger.error("Error retrieving charisma funds from KV:", { error: e.message });
      }
    }

    // Auto on-demand fetch if empty
    const syncRes = await fetchAndStoreCharismaFunds(env);
    if (syncRes.success && Array.isArray(syncRes.funds) && syncRes.funds.length > 0) {
      return syncRes.funds;
    }
    return inMemoryCharismaList || [];
  },

  async handleScheduledSync(env, sourceConfig = null) {
    if (!env) return;

    try {
      const lastSync = await getSourceLastSync(env, this.id);
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

      logger.info("[CharismaAdapter] Starting scheduled Charisma funds sync...");

      const raw = await this.fetchRaw({}, env);
      await this.parse(raw, { id: "src_def_charisma", name: sourceConfig?.name || this.name }, env);
      const expirationTtl = Math.max(86400, intervalSec * 3);
      await setSourceLastSync(env, this.id, now, expirationTtl);

      logger.info("[CharismaAdapter] Scheduled Charisma funds sync completed successfully.");
    } catch (err) {
      logger.error("[CharismaAdapter] Scheduled sync failed:", { error: err.message, stack: err.stack });
    }
  },
};

/**
 * Direct helper to fetch, parse, and persist Charisma funds to memory and KV
 * @param {object} [env=null]
 * @returns {Promise<{ success: boolean, count?: number, funds: Array, error?: string }>}
 */
export async function fetchAndStoreCharismaFunds(env = null) {
  try {
    const raw = await charismaFundsSourceAdapter.fetchRaw({}, env);
    const parsed = await charismaFundsSourceAdapter.parse(
      raw,
      { id: "src_def_charisma", name: charismaFundsSourceAdapter.name },
      env
    );
    const list = parsed.items || inMemoryCharismaList || [];
    return { success: true, count: list.length, funds: list };
  } catch (err) {
    logger.error("[CharismaAdapter] fetchAndStoreCharismaFunds error:", { error: err.message });
    return { success: false, error: err.message, funds: inMemoryCharismaList || [] };
  }
}

