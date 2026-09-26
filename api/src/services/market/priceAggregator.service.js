/**
 * priceAggregator.service.js — Reading the price book, and admin tools for price sources
 *
 * Every price is in the price book (KV "prices", domain/priceBook.js), written by the sync
 * (sourceSync.service.js). Nothing here keeps another copy of a price.
 */

import { dbGetPriceSources } from "../../repositories/priceSource.repository.js";
import { getPriceBookCache, setPriceBookCache } from "../../repositories/kvCache.repository.js";
import { buildPriceBook } from "../../domain/priceBook.js";
import { legacyPricesOf } from "../../domain/priceBookViews.js";
import { getAdapterForSource } from "./sources/index.js";
import { resolveApiUrl } from "./sources/apiUrl.source.adapter.js";
import { logger } from "../../lib/logger.js";
import { getMasterPriceSourceById } from "../../config/sources.config.js";
import { WORLD_FOREX_NAMES } from "../../domain/specs/index.js";

/**
 * Rebuild the price book from what every source last gave (no fetching), keeping each source's
 * sync state. Called after an admin changes a source.
 * @param {object} env
 * @returns {Promise<object|null>} the book
 */
export async function refreshPriceBook(env) {
  if (!env) return null;
  try {
    const previous = await getPriceBookCache(env);
    const sources = await dbGetPriceSources(env, { book: previous });
    const book = buildPriceBook(sources.filter((s) => s.isActive !== false).map((s) => ({
      ...s,
      lastFetched: s.lastFetched || null,
    })), { sourceStates: previous?.sources || {} });
    await setPriceBookCache(env, book);
    return book;
  } catch (e) {
    logger.warn("refreshPriceBook error:", { error: e.message });
    return null;
  }
}

/**
 * The price book: every price in the standard shape (see domain/priceBook.js), from KV "prices".
 * Built from the sources' stored items when KV has none yet.
 * @param {object} env
 * @returns {Promise<{ updatedAt: string, items: Record<string, object>, sources?: object }>}
 */
export async function getPriceBook(env) {
  const cached = await getPriceBookCache(env);
  if (cached?.items && Object.keys(cached.items).length > 0) return cached;
  const sources = await dbGetPriceSources(env, { book: cached }).catch(() => []);
  const book = buildPriceBook((sources || []).filter((s) => s.isActive !== false), {
    sourceStates: cached?.sources || {},
  });
  // Only a book with source prices is worth keeping (the next sync rewrites it anyway)
  if (Object.values(book.items).some((item) => item.sourceId)) await setPriceBookCache(env, book);
  return book;
}

/**
 * Every price, in the older /api/prices shape (see priceBookViews.legacyPricesOf)
 * @param {object} env
 * @param {boolean} [forceRefresh=false] - fetch every source first
 * @returns {Promise<object>}
 */
export async function fetchAllPrices(env, forceRefresh = false) {
  if (forceRefresh) {
    const { syncAllSources } = await import("./sourceSync.service.js");
    const { book } = await syncAllSources(env, { forceAll: true });
    if (book) return legacyPricesOf(book);
  }
  return legacyPricesOf(await getPriceBook(env));
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

