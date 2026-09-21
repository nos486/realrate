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
      badge: badge || null,
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

/**
 * Resolve the display name for an asset.
 * Pipeline (ordered):
 *   1️⃣ rawItem?.name (if non-ID-like and meaningful)
 *   2️⃣ canonical registry (gold, coin, forex, crypto, silver)
 *   3️⃣ knownItems (catalog specific, e.g. charisma_plans__gold -> 'طرح طلا')
 *   4️⃣ bourse prefix (`bourse_` -> symbol, with fund/stock distinction or source badge)
 *   5️⃣ fallback to clean ID.
 *
 * @param {string} assetId – e.g. "charisma_plans__gold", "gold_18k", "bourse_fa"
 * @param {object|null} rawItem – optional raw data returned from adapter/holding
 * @returns {string} display name (Persian if available)
 */
export function resolveAssetDisplayName(assetId, rawItem = null) {
  if (!assetId && !rawItem) return "";

  const effectiveId = String(assetId || rawItem?.assetId || rawItem?.id || "").trim();
  const cleanId = effectiveId.replace(/^src_def_/, "").replace(/^derived_/, "").trim();

  // 1️⃣ raw name (if meaningful and not merely an ID string)
  if (rawItem) {
    const isMofid =
      rawItem.sourceId === "src_def_emofid" ||
      rawItem.sourceId === "emofid_funds" ||
      rawItem.sourceId === "emofid" ||
      rawItem.priceType === "emofid_funds" ||
      rawItem.priceType === "emofid" ||
      String(rawItem.sourceName || "").includes("مفید") ||
      cleanId.startsWith("emofid__") ||
      cleanId.startsWith("emofid_");

    const preferred = (isMofid && rawItem.n)
      ? rawItem.n
      : (rawItem.n || rawItem.name || rawItem.assetName || rawItem.title || "");

    const rawName = String(preferred).trim();
    if (rawName) {
      const isIdLike =
        rawName === effectiveId ||
        rawName === cleanId ||
        rawName.startsWith("src_def_") ||
        rawName.startsWith("derived_") ||
        rawName.includes("__") ||
        (/^[a-z0-9_]+$/i.test(rawName) && !rawName.includes(" "));

      if (!isIdLike) {
        return rawName;
      }
    }
  }

  // 2️⃣ canonical (gold, coin, silver, forex, crypto)
  const canonical = getCanonicalAssetSpec(cleanId);
  if (canonical?.name) {
    return canonical.name;
  }

  // 3️⃣ catalog knownItems
  const catalogItem = findCatalogItem(cleanId);
  if (catalogItem?.name) {
    return catalogItem.name;
  }

  // 4️⃣ bourse handling (id starts with "bourse_")
  if (cleanId.startsWith("bourse_")) {
    const sym = cleanId.replace(/^bourse_/, "");
    // Check if rawItem specifies a meaningful name
    if (rawItem) {
      const isMofid =
        rawItem.sourceId === "src_def_emofid" ||
        rawItem.sourceId === "emofid_funds" ||
        String(rawItem.sourceName || "").includes("مفید");

      const preferred = (isMofid && rawItem.n) ? rawItem.n : (rawItem.n || rawItem.name || rawItem.assetName || "");
      const n = String(preferred).trim();
      if (n && n !== cleanId && n !== effectiveId && !n.startsWith("bourse_")) {
        return n;
      }
    }
    const src = getSourceConfig(sym);
    if (src?.badge) return `${src.badge} ${sym}`;
    if (src?.isFund || rawItem?.isFund || rawItem?.assetType === "bourse_fund" || rawItem?.category === "bourse_fund") {
      return `صندوق ${sym}`;
    }
    return `سهام ${sym}`;
  }

  // 5️⃣ source config (source ID or priceType, active or inactive)
  const srcCfg = getSourceConfig(cleanId) || getSourceConfig(effectiveId);
  if (srcCfg?.name) {
    return srcCfg.name;
  }

  // 6️⃣ fallback
  return cleanId || effectiveId;
}

/**
 * Resolve unit for an asset (same pipeline as name, but uses `unit` field).
 *
 * @param {string} assetId
 * @param {object|null} rawItem
 * @param {string} [fallbackUnit="واحد"]
 * @returns {string}
 */
export function resolveAssetUnit(assetId, rawItem = null, fallbackUnit = "واحد") {
  const effectiveId = String(assetId || rawItem?.assetId || rawItem?.id || "").trim();
  const cleanId = effectiveId.replace(/^src_def_/, "").replace(/^derived_/, "").trim();

  // 1️⃣ raw unit
  if (rawItem?.unit && typeof rawItem.unit === "string" && rawItem.unit.trim()) {
    return rawItem.unit.trim();
  }

  // 2️⃣ source unit (declared on source in sources.config.js)
  const src = getSourceConfig(cleanId);
  if (src?.unit) {
    return src.unit;
  }

  // 3️⃣ catalog knownItems
  const catalogItem = findCatalogItem(cleanId);
  if (catalogItem?.unit) {
    return catalogItem.unit;
  }

  // 4️⃣ canonical asset spec
  const canonical = getCanonicalAssetSpec(cleanId);
  if (canonical?.unit) {
    return canonical.unit;
  }

  // 5️⃣ bourse prefix
  if (cleanId.startsWith("bourse_")) {
    const sym = cleanId.replace(/^bourse_/, "");
    const symSrc = getSourceConfig(sym);
    if (symSrc?.unit) return symSrc.unit;
    if (symSrc?.isFund || rawItem?.isFund) return "واحد";
    return "برگ سهم";
  }

  // 6️⃣ fallback to generic unit
  return fallbackUnit || "واحد";
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
 * Reads directly from source config, canonical specs, or categories.config.js.
 * Zero hardcoded if/else rules.
 *
 * @param {string|object} assetOrItem
 * @param {string|null} [fallbackType=null]
 * @returns {string} category key
 */
export function resolveCategory(assetOrItem, fallbackType = null) {
  if (!assetOrItem) return fallbackType || "custom";

  const assetId = typeof assetOrItem === "string"
    ? assetOrItem
    : String(assetOrItem.assetId || assetOrItem.id || assetOrItem.priceType || "");

  const cleanId = assetId.replace(/^src_def_/, "").replace(/^derived_/, "").trim().toLowerCase();
  const assetType = typeof assetOrItem === "object"
    ? String(assetOrItem.assetType || assetOrItem.category || "").trim().toLowerCase()
    : "";

  // 1. Source definition (declared directly in sources.config.js)
  const src = getSourceConfig(cleanId) || (assetType ? getSourceConfig(assetType) : null);
  if (src?.category) return src.category;
  if (src?.isFund) return "bourse_fund";

  // 2. Catalog item declaration (e.g. knownItems in source)
  const catalogItem = findCatalogItem(cleanId);
  if (catalogItem?.category) return catalogItem.category;

  // 3. Canonical standard assets (gold, coin, silver, forex, crypto specs)
  const canonical = getCanonicalAssetSpec(cleanId);
  if (canonical?.category) return canonical.category;

  // 4. Bourse prefix handling
  if (cleanId.startsWith("bourse_")) {
    const sym = cleanId.replace(/^bourse_/, "");
    const symSrc = getSourceConfig(sym);
    return symSrc?.isFund ? "bourse_fund" : "bourse";
  }

  // 5. Raw item declared category
  if (typeof assetOrItem === "object") {
    if (assetOrItem.category && CATEGORY_MAP[assetOrItem.category]) return assetOrItem.category;
    if (assetType && CATEGORY_MAP[assetType]) return assetType;
    if (assetOrItem.isFund) return "bourse_fund";
  }

  // 6. Explicit valid fallback
  if (fallbackType && CATEGORY_MAP[fallbackType]) {
    return fallbackType;
  }

  return "custom";
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
