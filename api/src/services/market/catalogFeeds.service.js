/**
 * catalogFeeds.service.js — Generic Multi-Output Catalog Engine
 *
 * Single Source of Truth service for all catalog / multi-output feeds:
 * - Tehran Stock Exchange (Bourse / TSETMC)
 * - Charisma Investment Funds (صندوق‌های کاریزما)
 * - Emofid Investment Funds (صندوق‌های مفید)
 * - Future Fund/Catalog feeds (Agah, Kian, Lotus, etc.)
 *
 * Automatically discovers active catalog sources from sources.config.js (isCatalog: true),
 * fetches/merges them, normalizes search, and provides standardized items across RealRate.
 */

import { PRICE_SOURCES_CONFIG, getSourceDisplayName } from "../../config/sources.config.js";
import { getItemCategory, getItemUnit, getItemBadge } from "../../domain/displayEngine.js";
import { getAdapterForSource } from "./sources/index.js";
import { normalizePersian } from "./sources/parsingUtils.js";
import { DEFAULT_BOURSE_SEARCH_LIMIT } from "../../config/constants.js";
import { logger } from "../../lib/logger.js";
import { syncAllSources } from "./sourceSync.service.js";

/**
 * Returns all configured catalog sources from PRICE_SOURCES_CONFIG
 * @param {boolean} [activeOnly=true]
 * @returns {Array<object>}
 */
export function getAllCatalogSources(activeOnly = true) {
  return PRICE_SOURCES_CONFIG.filter((s) => {
    if (!s || !s.isCatalog) return false;
    if (activeOnly && (s.isActive === false || s.is_active === false)) return false;
    return true;
  });
}

/**
 * Normalizes a raw item from any catalog source into a standardized asset object
 * @param {object} item - Raw item from source
 * @param {object} sourceConfig - Configuration of the originating source
 * @returns {object} Standardized catalog item
 */
export function standardizeCatalogItem(item, sourceConfig = {}) {
  if (!item || typeof item !== "object") return null;

  const symbol = String(item.id || item.symbol || item.s || item.code || "").trim();
  const name = String(item.name || item.n || item.title || symbol).trim();
  if (!symbol && !name) return null;

  let priceToman = 0;
  if (item.price !== undefined && Number(item.price) > 0) {
    priceToman = Math.round(Number(item.price));
  } else if (item.priceToman !== undefined && Number(item.priceToman) > 0) {
    priceToman = Math.round(Number(item.priceToman));
  } else if (item.p !== undefined && Number(item.p) > 0) {
    priceToman = Math.round(Number(item.p));
  } else if (item.priceRial !== undefined && Number(item.priceRial) > 0) {
    priceToman = Math.round(Number(item.priceRial) / 10);
  } else if (item.pl !== undefined && Number(item.pl) > 0) {
    priceToman = Math.round(Number(item.pl) / 10);
  }

  const priceRial = (item.priceRial !== undefined && Number(item.priceRial) > 0)
    ? Math.round(Number(item.priceRial))
    : (priceToman * 10);

  const sourceId = sourceConfig.id || item.sourceId || "";
  const fullId = (sourceId && symbol.startsWith(`${sourceId}__`))
    ? symbol
    : (sourceId ? `${sourceId}__${symbol}` : symbol);

  const category = getItemCategory(item, sourceConfig);
  const badge = getItemBadge(item, sourceConfig);
  const unit = getItemUnit(item, sourceConfig);
  const isFund = Boolean(sourceConfig.isFund || category === "bourse_fund");
  const sourceName = getSourceDisplayName(sourceConfig) || sourceConfig.name || item.sourceName || "";

  return {
    id: fullId,
    symbol,
    name,
    category,
    badge,
    unit,
    price: priceToman,
    priceToman,
    priceRial,
    marketPrice: priceToman,
    isFund,
    sourceName,
    sourceId,
    changePercent: Number(item.changePercent ?? item.cp ?? item.plp ?? 0),
    updatedAt: item.updatedAt || null,
  };
}

/**
 * Fetches items for a specific catalog source
 * @param {object} env - Cloudflare Worker env
 * @param {object} sourceConfig - Source configuration object
 * @returns {Promise<Array<object>>}
 */
export async function getCatalogItemsBySource(env, sourceConfig) {
  if (!sourceConfig) return [];
  const adapter = getAdapterForSource(sourceConfig);
  if (!adapter) return [];

  let rawList = [];

  try {
    if (typeof adapter.getItems === "function") {
      rawList = await adapter.getItems(env);
    } else if (typeof adapter.getLatestFunds === "function") {
      rawList = await adapter.getLatestFunds(env);
    } else if (typeof adapter.getFunds === "function") {
      rawList = await adapter.getFunds(env);
    } else if (typeof adapter.getSymbols === "function") {
      rawList = await adapter.getSymbols(env);
    } else if (typeof adapter.fetchRaw === "function" && typeof adapter.parse === "function") {
      const raw = await adapter.fetchRaw(sourceConfig, env);
      const parsed = await adapter.parse(raw, sourceConfig, env);
      rawList = parsed.multiOutput || parsed.multiData?.items || parsed.compactList || [];
    }
  } catch (err) {
    logger.error(`[CatalogEngine] Failed to get items for ${sourceConfig.id}:`, { error: err.message });
    return [];
  }

  if (!Array.isArray(rawList)) return [];

  return rawList
    .map((item) => standardizeCatalogItem(item, sourceConfig))
    .filter(Boolean);
}

/**
 * Fetches all catalog items from all active catalog sources in parallel
 * @param {object} env - Cloudflare Worker env
 * @param {object} [options={}]
 * @param {string} [options.q=""] - Optional search query
 * @param {number} [options.limit] - Limit per source or total
 * @returns {Promise<{ allItems: Array, bourse: Array, funds: Array, bySource: object }>}
 */
export async function getAllCatalogItems(env, options = {}) {
  const sources = getAllCatalogSources(true);
  const q = String(options.q || "").trim().toLowerCase();
  const cleanQ = normalizePersian(q);

  // Parallel fetch from all active catalog sources
  const results = await Promise.all(
    sources.map(async (src) => {
      try {
        const items = await getCatalogItemsBySource(env, src);
        return { sourceId: src.id, items };
      } catch (err) {
        logger.error(`[CatalogEngine] Source ${src.id} error:`, { error: err.message });
        return { sourceId: src.id, items: [] };
      }
    })
  );

  const bySource = {};
  const funds = [];
  const bourse = [];
  const seenSymbols = new Set();
  const allItems = [];

  // Dedicated funds first to preserve dedicated managers (Charisma, Emofid)
  const fundResults = results.filter((r) => r.sourceId !== "src_def_bourse");
  const bourseResults = results.find((r) => r.sourceId === "src_def_bourse");

  for (const { sourceId, items } of fundResults) {
    bySource[sourceId] = items;
    for (const item of items) {
      const normSym = normalizePersian(item.symbol);
      if (normSym) seenSymbols.add(normSym);
      funds.push(item);
      allItems.push(item);
    }
  }

  // Then general Bourse items (avoiding duplicating fund items already precisely provided)
  if (bourseResults) {
    bySource[bourseResults.sourceId] = bourseResults.items;
    for (const item of bourseResults.items) {
      const normSym = normalizePersian(item.symbol);
      if (item.isFund && normSym && seenSymbols.has(normSym)) {
        continue;
      }
      if (normSym) seenSymbols.add(normSym);
      if (item.isFund) {
        funds.push(item);
      } else {
        bourse.push(item);
      }
      allItems.push(item);
    }
  }

  // Filter by query if provided
  const filterList = (list) => {
    if (!cleanQ) return list;
    return list.filter((it) => {
      const sNorm = normalizePersian(it.symbol);
      const nNorm = normalizePersian(it.name);
      return sNorm.includes(cleanQ) || nNorm.includes(cleanQ);
    });
  };

  const filteredBourse = filterList(bourse);
  const filteredFunds = filterList(funds);
  const filteredAll = filterList(allItems);

  return {
    allItems: options.limit ? filteredAll.slice(0, options.limit) : filteredAll,
    bourse: options.limit ? filteredBourse.slice(0, options.limit) : filteredBourse,
    funds: options.limit ? filteredFunds.slice(0, options.limit) : filteredFunds,
    bySource,
    counts: {
      total: allItems.length,
      bourse: bourse.length,
      funds: funds.length,
    },
  };
}

/**
 * Searches across catalog feeds with fuzzy ranking
 * @param {object} env - Cloudflare Worker env
 * @param {object} params
 * @param {string} [params.q=""] - Search query
 * @param {string} [params.sourceId] - Filter by specific source ID
 * @param {string} [params.category] - Filter by category ('bourse' | 'bourse_fund')
 * @param {number} [params.limit=DEFAULT_BOURSE_SEARCH_LIMIT] - Max items to return
 * @returns {Promise<Array<object>>}
 */
export async function searchCatalogItems(env, {
  q = "",
  sourceId = null,
  category = null,
  limit = DEFAULT_BOURSE_SEARCH_LIMIT,
} = {}) {
  const cleanQ = normalizePersian(q);
  let list = [];

  if (sourceId) {
    const srcConfig = PRICE_SOURCES_CONFIG.find((s) => s.id === sourceId);
    if (srcConfig) {
      list = await getCatalogItemsBySource(env, srcConfig);
    }
  } else {
    const data = await getAllCatalogItems(env);
    list = data.allItems;
  }

  if (category) {
    list = list.filter((it) => it.category === category || (category === "bourse_fund" && it.isFund));
  }

  if (!cleanQ) {
    return list.slice(0, limit);
  }

  const scored = [];
  for (const item of list) {
    const symNorm = normalizePersian(item.symbol);
    const nameNorm = normalizePersian(item.name);

    let score = 0;
    if (symNorm === cleanQ) score += 1000;
    else if (nameNorm === cleanQ) score += 800;
    else if (symNorm.startsWith(cleanQ)) score += 500;
    else if (nameNorm.startsWith(cleanQ)) score += 400;
    else if (symNorm.includes(cleanQ)) score += 200;
    else if (nameNorm.includes(cleanQ)) score += 150;

    if (score > 0) {
      scored.push({ item, score });
    }
  }

  scored.sort((a, b) => b.score - a.score || (b.item.priceToman || 0) - (a.item.priceToman || 0));

  return scored.slice(0, limit).map((s) => s.item);
}

/**
 * Looks up details for a single asset symbol across catalog feeds
 * @param {object} env - Cloudflare Worker env
 * @param {string} symbol - Ticker symbol
 * @param {string} [sourceId=null] - Optional specific source ID
 * @returns {Promise<object|null>}
 */
export async function getCatalogItemDetail(env, symbol, sourceId = null) {
  if (!symbol) return null;
  const cleanSym = normalizePersian(symbol);

  const items = await searchCatalogItems(env, { q: symbol, sourceId, limit: 10 });
  const exact = items.find((it) => normalizePersian(it.symbol) === cleanSym);
  return exact || null;
}

/**
 * Triggers a sync for a specific catalog source
 * @param {object} env - Cloudflare Worker env
 * @param {string} sourceId - Source ID
 * @returns {Promise<{ success: boolean, count?: number, error?: string }>}
 */
export async function syncCatalogSource(env, sourceId) {
  const sourceConfig = PRICE_SOURCES_CONFIG.find((s) => s.id === sourceId);
  if (!sourceConfig) {
    return { success: false, error: `Catalog source ${sourceId} not found` };
  }

  const adapter = getAdapterForSource(sourceConfig);
  if (!adapter) {
    return { success: false, error: `No adapter found for ${sourceId}` };
  }

  try {
    const raw = await adapter.fetchRaw(sourceConfig, env);
    const parsed = await adapter.parse(raw, sourceConfig, env);
    const count = parsed.multiOutput?.length || parsed.multiData?.items?.length || parsed.price || 0;
    return { success: true, count, sourceId };
  } catch (err) {
    logger.error(`[CatalogEngine] Sync error for ${sourceId}:`, { error: err.message });
    return { success: false, error: err.message, sourceId };
  }
}

/**
 * Scheduled sync for all active catalog sources
 * @param {object} env - Cloudflare Worker env
 * @returns {Promise<Array<{ sourceId: string, status: string, value: any, error: string|null }>>}
 */
export async function syncAllCatalogSources(env) {
  const sources = getAllCatalogSources(true);
  logger.info(`[CatalogEngine] Starting sync for ${sources.length} catalog feeds...`);
  const sourceIds = sources.map(s => s.id);

  const syncRes = await syncAllSources(env, { forceAll: true, sourceIds });
  return (syncRes?.results || []).map(r => ({
    sourceId: r.sourceId,
    status: r.success ? "fulfilled" : "rejected",
    value: r.success ? { success: true, count: r.itemsCount } : null,
    error: r.error || null,
  }));
}
