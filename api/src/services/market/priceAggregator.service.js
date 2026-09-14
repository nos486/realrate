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
  setSourcePriceCache,
} from "../../repositories/kvCache.repository.js";
import { getAdapterForSource } from "./sources/index.js";
import { resolveApiUrl } from "./sources/apiUrl.source.adapter.js";
import { logger } from "../../lib/logger.js";
import { SETTINGS_MEMORY_CACHE_TTL_MS } from "../../config/constants.js";
import { WORLD_FOREX_NAMES } from "../../domain/specs/index.js";
import { getReferenceRatesSpecs } from "../../config/sources.config.js";

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
      const sType = (mSrc.sourceType || '').toLowerCase();
      const pType = (mSrc.priceType || '').toLowerCase();
      // Bourse feeds are catalogs of 1,700+ symbols, not generic key-value currency prices
      if (sType === 'bourse_symbols' || pType === 'bourse' || pType === 'bourse_fund') {
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

      if (multi && typeof multi === 'object') {
        for (const [k, val] of Object.entries(multi)) {
          const numPrice = typeof val === 'object' && val !== null ? Number(val.price) : Number(val);
          if (numPrice > 0 && !excludedSet.has(k.toUpperCase())) {
            const isHome = isMultiOutputOnHomePage(k, mSrc.displayConfig);
            const lowerK = k.toLowerCase();
            // Single primary sources take precedence over multi-sources unless multi-source is primary
            if (!result[lowerK] || mSrc.isPrimary) {
              result[lowerK] = {
                price: numPrice,
                datetime: mSrc.lastFetched || new Date().toISOString(),
                label: `${mSrc.name} (${k.toUpperCase()})`,
                sourceId: mSrc.id,
                isPrimary: !!mSrc.isPrimary,
                showOnHomePage: isHome,
              };
            }
          }
        }
      }
    } catch (e) {
      logger.warn(`Error parsing multi-data for ${mSrc.name} in compileLatestMarketRates:`, { error: e.message });
    }
  }

  // Tehran Stock Exchange (Bourse Equities Catalog Metadata — not a single asset price)
  const bourseSource = sources.find(s => (s.priceType === "bourse" || s.sourceType === "bourse_symbols") && s.isActive);
  if (bourseSource) {
    result.bourse = {
      totalSymbols: Number(bourseSource.lastPrice) || 0,
      datetime: bourseSource.lastFetched || new Date().toISOString(),
      label: bourseSource.name,
      sourceId: bourseSource.id,
      isPrimary: true,
      isCatalog: true,
      showOnHomePage: false,
    };
  }

  // Tehran Stock Exchange (Bourse Investment Funds Catalog Metadata)
  const bourseFundSource = sources.find(s => s.priceType === "bourse_fund" && s.isActive);
  if (bourseFundSource) {
    result.bourse_fund = {
      totalFunds: Number(bourseFundSource.lastPrice) || 0,
      datetime: bourseFundSource.lastFetched || new Date().toISOString(),
      label: bourseFundSource.name,
      sourceId: bourseFundSource.id,
      isPrimary: true,
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
  const multiOutputTypes = new Set(['forex', 'bourse', 'bourse_fund', 'custom_feed', 'multi_output']);
  for (const src of sources) {
    if (!src.isActive || Number(src.lastPrice) <= 0 || !src.priceType) continue;
    const lowerType = src.priceType.toLowerCase();
    if (multiOutputTypes.has(lowerType) || src.category === 'multi_output') continue;
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

  let sources = [];
  try {
    sources = await dbGetPriceSources(env);
  } catch (e) {
    logger.error("Error fetching price sources for scheduled extraction:", { error: e.message, stack: e.stack });
    return { extractedCount: 0, rates: {} };
  }

  if (!Array.isArray(sources) || sources.length === 0) {
    return { extractedCount: 0, rates: {} };
  }

  const activeSources = sources.filter(s => s.isActive);
  if (activeSources.length === 0) {
    return { extractedCount: 0, rates: {} };
  }

  const nowMs = Date.now();
  const dueSources = forceAll
    ? activeSources
    : activeSources.filter(s => {
      const intervalMs = Math.max(15, (s.fetchIntervalSec || 60)) * 1000;
      const lastFetchedMs = s.lastFetched ? new Date(s.lastFetched).getTime() : 0;
      return (nowMs - lastFetchedMs) >= intervalMs;
    });

  let extractedCount = 0;

  if (dueSources.length > 0) {
    // 1. Deduplicate network requests by (sourceType + "::" + endpoint)
    const endpointRequests = new Map();
    for (const src of dueSources) {
      const key = `${src.sourceType}::${src.endpoint}`;
      if (!endpointRequests.has(key)) {
        const adapter = getAdapterForSource(src);
        endpointRequests.set(
          key,
          adapter.fetchRaw(src, env).catch(err => {
            logger.warn(`[PriceAggregator] Fetch failed for ${key}:`, { error: err.message });
            return null;
          })
        );
      }
    }

    const endpointKeys = Array.from(endpointRequests.keys());
    const rawResults = await Promise.all(endpointRequests.values());
    const endpointContentMap = new Map();
    for (let i = 0; i < endpointKeys.length; i++) {
      endpointContentMap.set(endpointKeys[i], rawResults[i]);
    }

    // 2. Parse and record each due source using its adapter
    const updates = [];
    for (const src of dueSources) {
      const key = `${src.sourceType}::${src.endpoint}`;
      const raw = endpointContentMap.get(key);
      if (!raw) continue;

      const adapter = getAdapterForSource(src);
      try {
        const parsed = await adapter.parse(raw, src, env);
        if (parsed && (parsed.price > 0 || (parsed.multiData && Object.keys(parsed.multiData).length > 0))) {
          extractedCount++;
          src.lastPrice = parsed.price;
          src.lastFetched = parsed.datetime;
          if (parsed.multiData) {
            src.lastMultiData = parsed.multiData;
          }

          // Update D1 last price and last_multi_data
          updates.push(
            dbUpdateSourceLastPrice(env, src.id, parsed.price, parsed.datetime, parsed.multiData || null)
          );

          // Save individual source price into KV for instant single-source lookups
          updates.push(
            setSourcePriceCache(env, src.id, {
              price: parsed.price,
              lastFetched: parsed.datetime,
              priceType: src.priceType,
              name: src.name,
              lastMultiData: parsed.multiData || undefined,
            }).catch(() => { })
          );
        }
      } catch (parseErr) {
        logger.warn(`[PriceAggregator] Parse failed for ${src.name} (${src.id}):`, { error: parseErr.message });
      }
    }

    if (updates.length > 0) {
      await Promise.allSettled(updates);
    }
  }

  // 3. Compile clean latest_rates for all active sources
  const latestRates = compileLatestMarketRates(activeSources);

  // 4. Save latest_rates to KV
  await setLatestRatesCache(env, latestRates);

  memoryPricesCache = { ...latestRates };
  lastFetchTime = Date.now();

  return { extractedCount, rates: latestRates };
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
 * Fetch all prices (compatible wrapper)
 * @param {object} env
 * @param {boolean} [forceRefresh=false]
 * @param {object} [settings=null]
 * @returns {Promise<object>}
 */
export async function fetchAllPrices(env, forceRefresh = false, settings = null) {
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
  const adapter = getAdapterForSource(config);
  if (typeof adapter.test === "function") {
    return await adapter.test(config, env);
  }

  try {
    const raw = await adapter.fetchRaw(config, env);
    const parsed = await adapter.parse(raw, config, env);
    const rawSnippet = typeof raw === "string" && raw.length > 2500 ? raw.slice(0, 2500) + "\n... (ادامه متن کوتاه شد)" : raw;

    return {
      success: true,
      source_type: config.sourceType || "api_url",
      price: parsed.price,
      multiData: parsed.multiData || undefined,
      compactList: parsed.compactList || undefined,
      sampleItems: parsed.sampleItems || undefined,
      datetime: parsed.datetime,
      label: parsed.label,
      rawSnippet,
      message: parsed.multiData
        ? `تعداد ${parsed.price} آیتم با موفقیت پردازش شد.`
        : `قیمت با موفقیت دریافت شد: ${parsed.price.toLocaleString("fa-IR")}`,
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

