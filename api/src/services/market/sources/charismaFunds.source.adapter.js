/**
 * charismaFunds.source.adapter.js — Adapter for Charisma Investment Funds API
 * Connects to https://charisma.ir/funds to fetch, parse, and cumulatively
 * merge closing prices (قیمت پایانی) for all Charisma investment funds.
 */

import { USER_AGENT } from "./parsingUtils.js";
import { logger } from "../../../lib/logger.js";
import {
  CHARISMA_SYNC_INTERVAL_MS,
  CHARISMA_SYNC_EXPIRATION_TTL,
} from "../../../config/constants.js";
import {
  getCharismaFundsCache,
  setCharismaFundsCache,
  getCharismaLastSync,
  setCharismaLastSync,
} from "../../../repositories/kvCache.repository.js";

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
export function mergeCharismaFunds(existingList = [], rawApiArray = [], nowIso = new Date().toISOString()) {
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
        unit: "IRR",
        isFund: true,
        category: "صندوق سرمایه‌گذاری",
        type: item.type || "صندوق",
        manager: "کاریزما (Charisma)",
        updatedAt: item.updatedAt || nowIso,
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

      const rawSymbol = item.shortSymbol || item.symbol || KNOWN_CHARISMA_SYMBOLS[item.englishTitle] || KNOWN_CHARISMA_SYMBOLS[item.enSymbol] || item.englishTitle || item.title || item.id;
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
      }

      const existing = fundsMap.get(symbol);

      if (rawClosingPrice > 0) {
        const rawPriceRial = Math.round(rawClosingPrice);
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
          unit: "IRR",
          isFund: true,
          category: "صندوق سرمایه‌گذاری",
          type: "صندوق",
          manager: "کاریزما (Charisma)",
          updatedAt: (existing && !priceChanged) ? existing.updatedAt : nowIso,
        });

        if (existing) {
          if (priceChanged) updatedCount++;
        } else {
          addedCount++;
        }
      } else if (existing) {
        // Price in API is 0 or missing -> RETAIN PREVIOUS VALID PRICE!
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
        const { cached, backup } = await getCharismaFundsCache(env);
        const dataStr = cached || backup;
        if (dataStr) {
          existingList = JSON.parse(dataStr);
          inMemoryCharismaList = existingList;
        }
      } catch (e) {
        logger.warn("Error loading previous charisma funds for merge:", { error: e.message });
      }
    }

    const { mergedList, stats } = mergeCharismaFunds(existingList || [], rawArray, nowIso);

    // Cache updated list in memory
    inMemoryCharismaList = mergedList;

    // Cache updated list in KV
    if (env && mergedList.length > 0) {
      try {
        const compactJson = JSON.stringify(mergedList);
        await setCharismaFundsCache(env, compactJson);
      } catch (err) {
        logger.warn("Error caching charisma funds in KV:", { error: err.message });
      }
    }

    logger.info(`[CharismaAdapter] Processed ${stats.totalFunds} funds. Added: ${stats.addedCount}, Updated: ${stats.updatedCount}, Retained: ${stats.retainedCount}`);

    return {
      price: 0,
      priceType: "charisma_funds",
      datetime: nowIso,
      multiOutput: mergedList,
      sourceId: sourceConfig?.id || "src_def_charisma",
    };
  },

  async getLatestFunds(env = null) {
    if (inMemoryCharismaList && inMemoryCharismaList.length > 0) {
      return inMemoryCharismaList;
    }
    if (env) {
      try {
        const { cached, backup } = await getCharismaFundsCache(env);
        const dataStr = cached || backup;
        if (dataStr) {
          const list = JSON.parse(dataStr);
          inMemoryCharismaList = list;
          return list;
        }
      } catch (e) {
        logger.error("Error retrieving charisma funds from KV:", { error: e.message });
      }
    }
    return [];
  },

  async handleScheduledSync(env) {
    if (!env) return;

    try {
      const lastSync = await getCharismaLastSync(env);
      const now = Date.now();

      if (lastSync) {
        const elapsed = now - Number(lastSync);
        if (elapsed < CHARISMA_SYNC_INTERVAL_MS) {
          return;
        }
      }

      logger.info("[CharismaAdapter] Starting scheduled Charisma funds sync...");

      const raw = await this.fetchRaw({}, env);
      await this.parse(raw, { id: "src_def_charisma" }, env);
      await setCharismaLastSync(env, now, CHARISMA_SYNC_EXPIRATION_TTL);

      logger.info("[CharismaAdapter] Scheduled Charisma funds sync completed successfully.");
    } catch (err) {
      logger.error("[CharismaAdapter] Scheduled sync failed:", { error: err.message, stack: err.stack });
    }
  },
};
