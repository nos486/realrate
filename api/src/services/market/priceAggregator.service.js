/**
 * priceAggregator.service.js — Central Price Aggregator and Polling Coordinator
 * Coordinates polling, network deduplication, adapter delegation, and cache updating.
 */

import {
  dbGetPriceSources,
  dbUpdateSourceLastPrice,
} from "../../repositories/priceSource.repository.js";
import {
  getLatestRatesCache,
  setLatestRatesCache,
  getPriceBookCache,
  setPriceBookCache,
} from "../../repositories/kvCache.repository.js";
import { buildPriceBook } from "../../domain/priceBook.js";
import { saveSourceItems } from "../../repositories/sourceItems.repository.js";
import { getAdapterForSource } from "./sources/index.js";
import { resolveApiUrl } from "./sources/apiUrl.source.adapter.js";
import { logger } from "../../lib/logger.js";
import { SETTINGS_MEMORY_CACHE_TTL_MS } from "../../config/constants.js";
import { getReferenceRatesSpecs, getMasterPriceSourceById } from "../../config/sources.config.js";

// In-memory price cache for sub-millisecond lookups
let memoryPricesCache = {};
let lastFetchTime = 0;

/**
 * Generic helper to check if a specific key from a multi-value source should be shown on the home page.
 * Supports:
 * - displayConfig.showOnHomePage: boolean (true/false) OR array of strings (e.g. ['EUR', 'AED', 'TRY'])
 * - displayConfig.homePageOutputs: array of strings (e.g. ['EUR', 'AED', 'TRY'])
 * - displayConfig.excludedHomePageOutputs: array of strings to hide from home page
 *
 * @param {string} outputKey - The item key (e.g. "EUR", "AED", "BTC")
 * @param {object|string|null} displayConfig - Source displayConfig
 * @returns {boolean}
 */
export function isMultiOutputOnHomePage(outputKey, displayConfig) {
  if (!outputKey) return false;
  if (!displayConfig) return true;

  let dc = displayConfig;
  if (typeof dc === 'string') {
    try {
      dc = JSON.parse(dc);
    } catch {
      return true;
    }
  }
  if (!dc || typeof dc !== 'object') return true;

  const keyUpper = String(outputKey).trim().toUpperCase();

  // 1. If overall showOnHomePage is explicitly false, hide all
  if (dc.showOnHomePage === false) {
    return false;
  }

  // 2. If homePageOutputs (or homeOutputs / displayOutputs or showOnHomePage as array) is specified:
  const allowedOutputs = Array.isArray(dc.homePageOutputs)
    ? dc.homePageOutputs
    : (Array.isArray(dc.homeOutputs)
      ? dc.homeOutputs
      : (Array.isArray(dc.displayOutputs)
        ? dc.displayOutputs
        : (Array.isArray(dc.showOnHomePage) ? dc.showOnHomePage : null)));

  if (allowedOutputs && Array.isArray(allowedOutputs)) {
    const allowedSet = new Set(allowedOutputs.map((x) => String(x).trim().toUpperCase()));
    return allowedSet.has(keyUpper);
  }

  // 3. If excludedHomePageOutputs is specified:
  if (Array.isArray(dc.excludedHomePageOutputs)) {
    const excludedSet = new Set(dc.excludedHomePageOutputs.map((x) => String(x).trim().toUpperCase()));
    if (excludedSet.has(keyUpper)) return false;
  }

  return dc.showOnHomePage !== false;
}

/**
 * Compile unified market rates dictionary from active sources
 * @param {Array<object>} sources
 * @returns {object}
 */
export function compileLatestMarketRates(sources) {
  const supportedTypes = [
    "usd",
    "gold_18k",
    "full_coin",
    "half_coin",
    "quarter_coin",
    "mesghal",
    "ons_gold",
    "ons_silver",
    "eur",
    "try",
    "aed",
    "gbp",
    "chf",
    "cad",
    "aud",
    "cny",
  ];

  const result = {
    last_updated: new Date().toISOString(),
  };

  if (!Array.isArray(sources)) return result;

  // 1. Process all multi-output sources with lastMultiData (Forex, Crypto, Commodities, etc.)
  const multiSources = sources.filter((s) => s.isActive && s.lastMultiData);
  for (const mSrc of multiSources) {
    try {
      // Generic check: Catalog sources (isCatalog: true) represent full asset catalogs, not individual currency rates
      if (mSrc.isCatalog || (mSrc.lastMultiData && typeof mSrc.lastMultiData === 'object' && mSrc.lastMultiData.isCatalog)) {
        continue;
      }

      let excluded = [];
      if (mSrc.excludedOutputs) {
        try {
          excluded = Array.isArray(mSrc.excludedOutputs)
            ? mSrc.excludedOutputs
            : JSON.parse(mSrc.excludedOutputs);
        } catch { }
      }
      const excludedSet = new Set(excluded.map((x) => String(x).toUpperCase()));

      const multi = typeof mSrc.lastMultiData === 'string'
        ? JSON.parse(mSrc.lastMultiData)
        : mSrc.lastMultiData;

      const METADATA_KEYS = new Set(['updatedat', 'totalsymbols', 'totalcount', 'totalfunds', 'stats', 'datetime', 'error', 'status', 'iscatalog', 'labels', 'result', 'message']);

      // Unified items traversal: multi.items is an array of { id, name, price }
      const itemsList = Array.isArray(multi?.items)
        ? multi.items
        : (multi && typeof multi === 'object'
          ? Object.entries(multi)
              .filter(([k]) => !METADATA_KEYS.has(k.toLowerCase()))
              .map(([k, val]) => ({
                id: k,
                name: k,
                price: typeof val === 'object' && val !== null ? val.price : val,
              }))
          : []);

      for (const item of itemsList) {
        if (!item || !item.id) continue;
        const code = String(item.id).toUpperCase();
        if (excludedSet.has(code)) continue;
        const numPrice = Number(item.price);
        if (numPrice > 0) {
          const isHome = isMultiOutputOnHomePage(item.id, mSrc.displayConfig);
          const lowerK = String(item.id).toLowerCase();
          // Single primary sources take precedence over multi-sources unless multi-source is primary
          if (!result[lowerK] || mSrc.isPrimary) {
            result[lowerK] = {
              price: numPrice,
              datetime: mSrc.lastFetched || multi?.datetime || new Date().toISOString(),
              label: `${mSrc.name} (${code})`,
              sourceId: mSrc.id,
              isPrimary: !!mSrc.isPrimary,
              showOnHomePage: isHome,
            };
          }
        }
      }
    } catch (e) {
      logger.warn(`Error parsing multi-data for ${mSrc.name} in compileLatestMarketRates:`, { error: e.message });
    }
  }

  // Multi-item Catalog Sources Metadata (e.g. Stock Exchange, Car catalogs, Products)
  const catalogSources = sources.filter(s => s.isActive && (
    s.isCatalog ||
    s.category === 'catalog' ||
    (s.lastMultiData && typeof s.lastMultiData === 'object' && (s.lastMultiData.isCatalog || s.lastMultiData.totalSymbols || s.lastMultiData.totalCount || Array.isArray(s.lastMultiData.compactList)))
  ));
  for (const catSrc of catalogSources) {
    const key = String(catSrc.priceType || catSrc.id || '').toLowerCase();
    result[key] = {
      totalCount: Number(catSrc.lastPrice) || 0,
      totalSymbols: Number(catSrc.lastPrice) || 0,
      datetime: catSrc.lastFetched || new Date().toISOString(),
      label: catSrc.name,
      sourceId: catSrc.id,
      isPrimary: !!catSrc.isPrimary,
      isCatalog: true,
      showOnHomePage: false,
    };
  }

  // 2. Process single output price sources
  for (const pType of supportedTypes) {
    const candidates = sources.filter(s => s.priceType === pType && s.isActive);
    const chosen = candidates.find(s => s.isPrimary) || candidates[0];

    if (chosen) {
      const itemKey = pType === "usd" ? "usd_toman" : pType;
      let showOnHome = true;
      if (pType === "usd") {
        showOnHome = true;
      } else if (chosen.displayConfig) {
        try {
          const dc = typeof chosen.displayConfig === 'string' ? JSON.parse(chosen.displayConfig) : chosen.displayConfig;
          if (dc && dc.showOnHomePage !== undefined) {
            showOnHome = Boolean(dc.showOnHomePage);
          }
        } catch { }
      }

      result[itemKey] = {
        price: chosen.lastPrice,
        datetime: chosen.lastFetched || new Date().toISOString(),
        label: chosen.name,
        sourceId: chosen.id,
        isPrimary: !!chosen.isPrimary,
        showOnHomePage: showOnHome,
      };

      if (pType === "usd") {
        result.usd = result.usd_toman;
      }
    }
  }

  // Also include any other active custom single sources that aren't in supportedTypes
  for (const src of sources) {
    if (!src.isActive || Number(src.lastPrice) <= 0 || !src.priceType) continue;
    const isMultiOrCatalog = Boolean(
      src.isMultiOutput ||
      src.isCatalog ||
      src.category === 'multi_output' ||
      src.category === 'catalog' ||
      (src.lastMultiData && typeof src.lastMultiData === 'object' && (src.lastMultiData.isCatalog || Object.keys(src.lastMultiData).length > 2))
    );
    if (isMultiOrCatalog) continue;
    const lowerType = src.priceType.toLowerCase();
    if (result[src.priceType] || result[lowerType]) continue;
    let showOnHome = true;
    if (src.displayConfig) {
      try {
        const dc = typeof src.displayConfig === 'string' ? JSON.parse(src.displayConfig) : src.displayConfig;
        if (dc && dc.showOnHomePage !== undefined) {
          showOnHome = Boolean(dc.showOnHomePage);
        }
      } catch { }
    }
    result[lowerType] = {
      price: src.lastPrice,
      datetime: src.lastFetched || new Date().toISOString(),
      label: src.name,
      sourceId: src.id,
      isPrimary: !!src.isPrimary,
      showOnHomePage: showOnHome,
    };
  }

  // 4. Compile dynamic reference rate options (for base currency rotation: USD, USDT, etc.)
  const refSources = sources.filter((s) => s.isActive && (s.isReferenceRate || s.priceType === 'usd' || String(s.priceType).toLowerCase() === 'usdt'));
  const seenRefKeys = new Set();
  const refRates = [];

  // Sort by referenceOrder if present
  refSources.sort((a, b) => (Number(a.referenceOrder) || 99) - (Number(b.referenceOrder) || 99));

  for (const s of refSources) {
    const rawKey = String(s.priceType || '').toLowerCase();
    const key = rawKey === 'usd_toman' ? 'usd' : rawKey;
    if (seenRefKeys.has(key)) continue;

    const priceEntry = result[key] || result[rawKey] || (key === 'usd' ? result.usd_toman : null);
    const priceVal = priceEntry?.price || s.lastPrice;
    const defaultSpec = getReferenceRatesSpecs().find((r) => r.key === key);
    if (Number(priceVal) > 0) {
      seenRefKeys.add(key);
      refRates.push({
        key,
        priceType: s.priceType,
        sourceId: s.id,
        label: s.referenceLabel || defaultSpec?.label || s.name,
        shortLabel: s.referenceShortLabel || defaultSpec?.shortLabel || s.name,
        symbol: s.referenceSymbol || defaultSpec?.symbol || '$',
        pulseColor: s.referencePulseColor || defaultSpec?.pulseColor || 'green',
        price: Number(priceVal),
        datetime: priceEntry?.datetime || s.lastFetched || new Date().toISOString(),
      });
    }
  }

  // Ensure default USD is present if not already added
  if (!seenRefKeys.has('usd') && Number(result.usd_toman?.price || result.usd?.price) > 0) {
    const defaultUsdSpec = getReferenceRatesSpecs().find((r) => r.key === 'usd');
    refRates.unshift({
      key: 'usd',
      priceType: 'usd',
      sourceId: result.usd_toman?.sourceId || 'default_usd',
      label: defaultUsdSpec?.label || result.usd_toman?.label || 'USD',
      shortLabel: defaultUsdSpec?.shortLabel || 'USD',
      symbol: defaultUsdSpec?.symbol || '$',
      pulseColor: defaultUsdSpec?.pulseColor || 'green',
      price: Number(result.usd_toman?.price || result.usd?.price),
      datetime: result.usd_toman?.datetime || new Date().toISOString(),
    });
  }

  result.reference_rates = refRates;

  return result;
}

/**
 * Handle scheduled automatic price extraction runner:
 * Checks each active source against its configured interval (fetch_interval_sec).
 * If (now - lastFetched) >= interval (or forceAll is true), fetches and extracts price.
 * Updates D1 last_price and saves latest prices into KV.
 *
 * @param {object} env
 * @param {boolean} [forceAll=false]
 * @returns {Promise<{ extractedCount: number, rates: object }>}
 */
export async function handleScheduledPriceExtraction(env, forceAll = false) {
  if (!env) return { extractedCount: 0, rates: {} };
  const { syncAllSources } = await import("./sourceSync.service.js");
  const result = await syncAllSources(env, { forceAll });
  if (result.rates && Object.keys(result.rates).length > 0) {
    memoryPricesCache = { ...result.rates };
    lastFetchTime = Date.now();
  }
  return { extractedCount: result.syncedCount, rates: result.rates || {} };
}

/**
 * Instantly recompile latest rates from DB active sources and update KV + memory cache.
 * Called immediately after any price source is created, updated, or deleted.
 * @param {object} env
 * @returns {Promise<object|null>}
 */
export async function refreshMarketRatesCache(env) {
  if (!env) return null;
  try {
    const sources = await dbGetPriceSources(env);
    if (Array.isArray(sources)) {
      const activeSources = sources.filter(s => s.isActive);
      const latestRates = compileLatestMarketRates(activeSources);
      await setLatestRatesCache(env, latestRates);
      await setPriceBookCache(env, buildPriceBook(activeSources));
      memoryPricesCache = { ...latestRates };
      lastFetchTime = Date.now();
      return latestRates;
    }
  } catch (e) {
    logger.warn("refreshMarketRatesCache error:", { error: e.message });
  }
  return null;
}

/**
 * Get latest market rates instantly from KV (with fallback to scheduled extraction if empty)
 * @param {object} env
 * @returns {Promise<object>}
 */
export async function getLatestMarketRates(env) {
  // 1. In-memory cache
  if (
    memoryPricesCache &&
    Object.keys(memoryPricesCache).length > 2 &&
    Date.now() - lastFetchTime < SETTINGS_MEMORY_CACHE_TTL_MS
  ) {
    return memoryPricesCache;
  }

  // 2. Read directly from KV (fastest access, sub-5ms)
  const kvVal = await getLatestRatesCache(env);
  if (kvVal && Object.keys(kvVal).length > 2) {
    memoryPricesCache = kvVal;
    lastFetchTime = Date.now();
    return kvVal;
  }

  // 3. Fallback: If KV is cold/empty, trigger extraction immediately
  const { rates } = await handleScheduledPriceExtraction(env, true);
  return rates;
}

/**
 * The price book: every price in the standard shape (see domain/priceBook.js), from KV "prices".
 * Built from the sources when KV has none yet.
 * @param {object} env
 * @returns {Promise<{ updatedAt: string, items: Record<string, object> }>}
 */
export async function getPriceBook(env) {
  const cached = await getPriceBookCache(env);
  if (cached?.items && Object.keys(cached.items).length > 0) return cached;
  const sources = await dbGetPriceSources(env).catch(() => []);
  const book = buildPriceBook((sources || []).filter((s) => s.isActive));
  // Only a book with source prices is worth keeping (the next sync rewrites it anyway)
  if (Object.values(book.items).some((item) => item.sourceId)) await setPriceBookCache(env, book);
  return book;
}

/**
 * Fetch all prices (compatible wrapper)
 * @param {object} env
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<object>}
 */
export async function fetchAllPrices(env, forceRefresh = false) {
  if (forceRefresh) {
    const { rates } = await handleScheduledPriceExtraction(env, true);
    return rates;
  }
  return await getLatestMarketRates(env);
}

/**
 * Test a price source configuration without saving
 * @param {object} config - { sourceType, priceType, endpoint, regex, jsonPath, name }
 * @returns {Promise<object>}
 */
export async function testPriceSourceConfig(config = {}, env = null) {
  let effectiveConfig = { ...config };
  if (config.id) {
    const master = getMasterPriceSourceById(config.id);
    if (master) {
      effectiveConfig = {
        ...master,
        ...config,
        customParser: config.customParser || master.customParser,
      };
    }
  }

  const adapter = getAdapterForSource(effectiveConfig);
  if (typeof adapter.test === "function") {
    return await adapter.test(effectiveConfig, env);
  }

  try {
    const raw = await adapter.fetchRaw(effectiveConfig, env);
    const parsed = await adapter.parse(raw, effectiveConfig, env);
    const rawSnippet = typeof raw === "string" && raw.length > 2500 ? raw.slice(0, 2500) + "\n... (ادامه متن کوتاه شد)" : (typeof raw === "object" ? JSON.stringify(raw, null, 2).slice(0, 2500) : String(raw || ""));
    const firstItem = parsed?.items?.[0];
    const price = parsed?.price !== undefined ? parsed.price : (firstItem?.price || 0);
    const items = parsed?.items || parsed?.compactList || [];
    const count = items.length;

    return {
      success: true,
      source_type: config.sourceType || "api_url",
      price,
      items,
      sampleItems: items.slice(0, 50),
      datetime: parsed.datetime,
      label: firstItem?.name || parsed.label || config.name || "سورس قیمت",
      rawSnippet,
      message: count > 1
        ? `تعداد ${count} آیتم با موفقیت پردازش شد.`
        : `قیمت با موفقیت دریافت شد: ${price.toLocaleString("fa-IR")}`,
    };
  } catch (e) {
    return { success: false, error: e.message || "خطا در تست سورس قیمت" };
  }
}

/**
 * Fetch raw endpoint content using appropriate adapter
 */
export async function fetchRawEndpointContent(sourceType, endpoint, env = null) {
  const adapter = getAdapterForSource({ sourceType, endpoint });
  return await adapter.fetchRaw({ sourceType, endpoint }, env);
}

/**
 * Parse raw content using appropriate adapter
 */
export async function parseSourceContent(sourceConfig, rawContent, env = null) {
  const adapter = getAdapterForSource(sourceConfig);
  return await adapter.parse(rawContent, sourceConfig, env);
}

/**
 * Inspect an API endpoint structure to discover candidate arrays and JSON keys
 * @param {string} endpointUrl
 * @param {object} [customHeaders]
 * @param {object} [env]
 * @returns {Promise<object>}
 */
export async function inspectApiEndpointStructure(endpointUrl, customHeaders = {}, env = null) {
  const resolvedUrl = resolveApiUrl(endpointUrl, env);
  if (!resolvedUrl || !resolvedUrl.startsWith("http")) {
    throw new Error("آدرس وب‌سرویس معتبر نیست. لطفاً یک URL کامل با http یا https وارد کنید.");
  }

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) RealRateWorker/1.0",
    "Accept": "application/json, text/plain, */*",
    ...customHeaders,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  let res;
  try {
    res = await fetch(resolvedUrl, { headers, signal: controller.signal });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error("مهلت زمان اتصال به وب‌سرویس به پایان رسید (Timeout 12s).");
    }
    throw new Error(`خطا در اتصال به وب‌سرویس: ${err.message}`);
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    throw new Error(`پاسخ وب‌سرویس با خطا مواجه شد (کد وضعیت HTTP: ${res.status})`);
  }

  const rawText = await res.text();
  let json;
  try {
    json = JSON.parse(rawText);
  } catch (e) {
    throw new Error("پاسخ وب‌سرویس در قالب معتبر JSON نیست.");
  }

  // Recursive search for candidate arrays
  const candidateArrays = [];

  function traverse(node, currentPath, depth) {
    if (depth > 4) return;
    if (Array.isArray(node)) {
      if (node.length > 0) {
        const keysSet = new Set();
        const sampleItems = node.slice(0, 5);
        for (const item of sampleItems) {
          if (item && typeof item === "object") {
            for (const k of Object.keys(item)) {
              keysSet.add(k);
            }
          }
        }
        candidateArrays.push({
          path: currentPath,
          length: node.length,
          sampleItem: node[0] && typeof node[0] === 'object' ? node[0] : null,
          sampleItems: sampleItems.filter(x => x && typeof x === 'object'),
          keys: Array.from(keysSet),
        });
      }
      return;
    }

    if (node && typeof node === "object") {
      const entries = Object.entries(node);
      const isRateDict = entries.length >= 3 && entries.every(([k, v]) => typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(v))));
      if (isRateDict) {
        const allItems = entries.slice(0, 500).map(([k, v]) => {
          const sym = k.toUpperCase();
          return {
            key: k,
            code: sym,
            name: WORLD_FOREX_NAMES[sym] || sym,
            rate: Number(v),
            price: Number(v),
          };
        });
        candidateArrays.push({
          path: currentPath,
          length: entries.length,
          sampleItem: allItems[0] || null,
          sampleItems: allItems.slice(0, 20),
          allItems,
          keys: ['symbol', 'code', 'name', 'rate', 'price'],
          isKeyValDictionary: true,
        });
      }

      for (const [key, val] of Object.entries(node)) {
        const nextPath = currentPath ? `${currentPath}.${key}` : key;
        traverse(val, nextPath, depth + 1);
      }
    }
  }

  traverse(json, "", 0);

  candidateArrays.sort((a, b) => {
    const aPriority = a.path === 'data' || a.path === '' || a.path === 'items' || a.path === 'result' ? 10 : 0;
    const bPriority = b.path === 'data' || b.path === '' || b.path === 'items' || b.path === 'result' ? 10 : 0;
    if (aPriority !== bPriority) return bPriority - aPriority;
    return b.length - a.length;
  });

  return {
    success: true,
    totalArraysFound: candidateArrays.length,
    candidateArrays,
    rawPreview: rawText.substring(0, 500),
  };
}

