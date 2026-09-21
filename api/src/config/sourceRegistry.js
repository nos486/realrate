/**
 * sourceRegistry.js — Central Unified Price Source Registry & Asset Metadata Resolver
 *
 * Single Source of Truth: All dynamic metadata and resolution logic derive from
 * PRICE_SOURCES_CONFIG in sources.config.js and canonical specs in registry.js.
 */

import { PRICE_SOURCES_CONFIG } from "./sources.config.js";
import { getCanonicalAssetSpec } from "../domain/specs/registry.js";
import {
  CATEGORIES_CONFIG,
  CATEGORY_MAP,
  getCategoryConfig,
} from "./categories.config.js";

export { CATEGORIES_CONFIG, CATEGORY_MAP, getCategoryConfig };

/**
 * Internal map: priceType (or id) -> source config (normalized)
 */
const _registry = new Map();

/**
 * Normalization – runs once on first import
 */
function _init() {
  if (!Array.isArray(PRICE_SOURCES_CONFIG)) return;

  for (const src of PRICE_SOURCES_CONFIG) {
    if (!src) continue;
    const {
      id,
      priceType,
      name,
      sourceType,
      endpoint,
      category,
      badge,
      unit,
      isFund,
      isCatalog,
      knownSymbols = [],
      knownItems = {},
      customParser,
      isActive = true,
      isPrimary = false,
      ...rest
    } = src;

    // Build reverse maps for fast item lookup
    const symbolToItem = {};
    if (knownItems && typeof knownItems === "object") {
      for (const [sym, data] of Object.entries(knownItems)) {
        if (!sym || !data) continue;
        symbolToItem[sym] = data;
        symbolToItem[sym.toLowerCase()] = data;
      }
    }

    const normalizedConfig = {
      id,
      priceType,
      name,
      sourceType,
      endpoint,
      category: category || null,
      badge: (category && CATEGORY_MAP[category]?.badge) || badge || null,
      unit: unit || null,
      isFund: Boolean(isFund),
      isCatalog: Boolean(isCatalog),
      knownSymbols: Array.isArray(knownSymbols) ? knownSymbols : [],
      knownItems: knownItems || {},
      symbolToItem,
      customParser: typeof customParser === "function" ? customParser : null,
      isActive: Boolean(isActive),
      isPrimary: Boolean(isPrimary),
      ...rest,
    };

    // Index by id and priceType (and lowercase variants)
    if (id) {
      _registry.set(id, normalizedConfig);
      _registry.set(id.toLowerCase(), normalizedConfig);
      const cleanId = id.replace(/^src_def_/, "").toLowerCase();
      _registry.set(cleanId, normalizedConfig);
    }
    if (priceType) {
      _registry.set(priceType, normalizedConfig);
      _registry.set(priceType.toLowerCase(), normalizedConfig);
    }
  }
}

/* Initialize lazily */
if (_registry.size === 0) {
  _init();
}

/**
 * Re-initialize registry (useful if configuration is dynamically reloaded)
 */
export function reloadSourceRegistry() {
  _registry.clear();
  _init();
}

/* ---------- Public API ---------- */

/**
 * Get the full normalized config for a source.
 * @param {string} key – priceType, id, or assetId prefix
 * @returns {object|undefined}
 */
export function getSourceConfig(key) {
  if (!key || typeof key !== "string") return undefined;
  if (_registry.size === 0) _init();
  const clean = key.trim().toLowerCase();
  const direct = _registry.get(clean) || _registry.get(key.trim());
  if (direct) return direct;

  const withoutPrefix = clean.replace(/^src_def_/, "").replace(/^derived_/, "");
  const directNoPrefix = _registry.get(withoutPrefix);
  if (directNoPrefix) return directNoPrefix;

  // Prefix match for catalog items (e.g. charisma_plans__gold -> charisma_plans)
  if (clean.includes("__")) {
    const [prefix] = clean.split("__");
    const found = getSourceConfig(prefix);
    if (found) return found;
  }

  // Fallback: search values in case of partial match
  return Array.from(_registry.values()).find(
    (s) => s.id?.toLowerCase() === clean || s.priceType?.toLowerCase() === clean
  );
}

/**
 * Helper to resolve catalog item info from knownItems in sources
 * @param {string} assetId
 * @returns {{ name?: string, unit?: string, badge?: string } | null}
 */
function findCatalogItem(assetId) {
  if (!assetId || typeof assetId !== "string") return null;
  const cleanFull = assetId.replace(/^src_def_/, "").replace(/^derived_/, "").trim();
  const cleanLower = cleanFull.toLowerCase();

  // 1. Check double underscore notation: prefix__suffix (e.g. charisma_plans__gold)
  if (cleanLower.includes("__")) {
    const [prefix, suffix] = cleanFull.split("__");
    const src = getSourceConfig(prefix);
    if (src?.symbolToItem) {
      const match = src.symbolToItem[suffix] || src.symbolToItem[suffix.toLowerCase()];
      if (match) return match;
    }
  }

  // 2. Search all catalog sources with knownItems
  for (const src of _registry.values()) {
    if (!src.knownItems) continue;
    if (src.symbolToItem && (src.symbolToItem[cleanFull] || src.symbolToItem[cleanLower])) {
      return src.symbolToItem[cleanFull] || src.symbolToItem[cleanLower];
    }
  }

  return null;
}
import {
  parseItemId,
  getItemBaseName,
  getItemDisplayName,
  getItemUnit,
  getItemCategory,
  getItemBadge,
  getCategoryIconName,
  getSourceBrand,
} from "../domain/displayEngine.js";

export {
  parseItemId,
  getItemDisplayName,
  getItemUnit,
  getItemCategory,
  getItemBadge,
  getCategoryIconName,
  getSourceBrand,
};

/**
 * Resolve the display name for an asset. Delegated to displayEngine.
 *
 * @param {string} assetId – e.g. "charisma_plans__gold", "gold_18k", "bourse_fa"
 * @param {object|null} rawItem – optional raw data returned from adapter/holding
 * @returns {string} display name (Persian if available)
 */
export function resolveAssetDisplayName(assetId, rawItem = null) {
  if (!assetId && !rawItem) return "";
  const item = rawItem ? { ...rawItem, id: assetId || rawItem.id } : assetId;
  return getItemBaseName(item);
}

/**
 * Extracts a clean, concise source brand/label for display (e.g. "کاریزما", "مفید", "بورس", "زرما", "سبزه میدان").
 * Purely data-driven via displayEngine.
 *
 * @param {string|object} sourceOrKey
 * @returns {string}
 */
export function getSourceShortBrand(sourceOrKey) {
  return getSourceBrand(sourceOrKey);
}

/**
 * Resolves full asset display name combined with source name, e.g. "فولاد مبارکه (بورس)", "اهرم (کاریزما)"
 * Avoids duplicate brand tokens if item name already includes the source name.
 *
 * @param {string} assetId
 * @param {object|null} rawItem
 * @returns {string}
 */
export function resolveAssetDisplayWithSource(assetId, rawItem = null) {
  const item = rawItem ? { ...rawItem, id: assetId || rawItem.id } : assetId;
  return getItemDisplayName(item);
}

/**
 * Resolve unit for an asset. Delegated to displayEngine.
 *
 * @param {string} assetId
 * @param {object|null} rawItem
 * @param {string} [fallbackUnit="واحد"]
 * @returns {string}
 */
export function resolveAssetUnit(assetId, rawItem = null, fallbackUnit = "واحد") {
  const item = rawItem ? { ...rawItem, id: assetId || rawItem.id } : assetId;
  return getItemUnit(item, null, fallbackUnit);
}

/**
 * Return parser function for a source (if any).
 * @param {string} key – priceType or id
 * @returns {Function|null}
 */
export function getSourceParser(key) {
  const cfg = getSourceConfig(key);
  return cfg?.customParser || null;
}

/**
 * Resolve category (gold, coin, silver, currency, crypto, bourse, bourse_fund, custom)
 * Delegated to displayEngine.
 *
 * @param {string|object} assetOrItem
 * @param {string|null} [fallbackType=null]
 * @returns {string} category key
 */
export function resolveCategory(assetOrItem, fallbackType = null) {
  return getItemCategory(assetOrItem, null, fallbackType);
}

/**
 * Alias for resolveCategory matching previous domain/specs/registry signature
 */
export const resolveItemCategory = resolveCategory;

/**
 * Exports internal registry keys for debugging and introspection
 */
export function getAllRegisteredSourceKeys() {
  return Array.from(_registry.keys());
}

