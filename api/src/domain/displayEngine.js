/**
 * displayEngine.js — Master Display & Metadata Engine for RealRate
 *
 * Universal Contracts:
 * 1. ID Contract: Always ${sourceId}__${itemKey} (with backward-compatible parsing for legacy bourse_ and flat IDs)
 * 2. Metadata Contract: Units, categories, and badges are ONLY defined at source/category level
 * 3. Display Contract: Item display name is strictly generated as "{item.name} ({sourceName})"
 *
 * Single Source of Truth for RealRate presentation logic.
 */

import { PRICE_SOURCES_CONFIG } from "../config/sources.config.js";
import { CATEGORIES_CONFIG, CATEGORY_MAP } from "../config/categories.config.js";
import { getCanonicalAssetSpec, getCanonicalAssetName } from "./specs/registry.js";

/**
 * Parses any item identifier into its sourceId and itemKey components.
 * Contract: ${sourceId}__${itemKey}
 * Backward compatibility: handles legacy "bourse_XYZ", "src_def_XYZ", and plain symbols/keys.
 *
 * @param {string} id - Identifier to parse
 * @returns {{ sourceId: string, itemKey: string }}
 */
export function parseItemId(id) {
  if (!id || typeof id !== "string") {
    return { sourceId: "", itemKey: "" };
  }

  const clean = id.trim();

  // 1. Universal format: ${sourceId}__${itemKey}
  if (clean.includes("__")) {
    const idx = clean.indexOf("__");
    return {
      sourceId: clean.slice(0, idx),
      itemKey: clean.slice(idx + 2),
    };
  }

  // 2. Backward compatibility for legacy bourse_ prefix
  if (clean.startsWith("bourse_")) {
    return {
      sourceId: "src_def_bourse",
      itemKey: clean.slice(7),
    };
  }

  // 3. Single-rate / flat identifiers (e.g. src_def_usd, usd, gold_18k)
  const matchedSource = getSourceConfig(clean);
  if (matchedSource) {
    return {
      sourceId: matchedSource.id,
      itemKey: matchedSource.priceType || matchedSource.id,
    };
  }

  return {
    sourceId: clean,
    itemKey: clean,
  };
}

/**
 * Retrieves configuration for a source by ID, priceType, or alias.
 * Data-driven lookup against PRICE_SOURCES_CONFIG.
 *
 * @param {string} key
 * @returns {object|null}
 */
export function getSourceConfig(key) {
  if (!key || typeof key !== "string") return null;
  const clean = key.replace(/^src_def_/, "").replace(/^derived_/, "").toLowerCase().trim();
  const rawClean = key.toLowerCase().trim();

  return PRICE_SOURCES_CONFIG.find((s) => {
    if (!s) return false;
    const sCleanId = String(s.id || "").replace(/^src_def_/, "").toLowerCase().trim();
    const sRawId = String(s.id || "").toLowerCase().trim();
    const sPType = String(s.priceType || "").toLowerCase().trim();

    return sRawId === rawClean || sCleanId === clean || sPType === clean || sPType === rawClean;
  }) || null;
}

/**
 * Returns the short brand or presentation label of a source (e.g. "بورس", "مفید", "کاریزما", "زرما", "سبزه میدان").
 * Purely data-driven from sourceConfig.brand or sourceConfig.name. Zero hardcoded string checks.
 *
 * @param {string|object} sourceOrKey
 * @returns {string}
 */
export function getSourceBrand(sourceOrKey) {
  if (!sourceOrKey) return "";

  if (typeof sourceOrKey === "object") {
    if (sourceOrKey.brand) return sourceOrKey.brand;
    const cfg = getSourceConfig(sourceOrKey.sourceId || sourceOrKey.source || sourceOrKey.priceType || sourceOrKey.id);
    if (cfg?.brand) return cfg.brand;
    if (cfg?.name) return cfg.name;
    return sourceOrKey.sourceName || sourceOrKey.name || "";
  }

  const cfg = getSourceConfig(sourceOrKey);
  if (cfg?.brand) return cfg.brand;
  if (cfg?.name) return cfg.name;
  return String(sourceOrKey).trim();
}

/**
 * Resolves the base item name (without source name attached).
 *
 * @param {object|string} item
 * @returns {string}
 */
export function getItemBaseName(item) {
  if (!item) return "";
  const isString = typeof item === "string";
  const rawItem = isString ? { id: item } : item;
  const rawId = String(rawItem.id || rawItem.assetId || rawItem.symbol || rawItem.s || "").trim();
  const { sourceId, itemKey } = parseItemId(rawId);

  // 1. Raw name if provided and not ID-like
  if (rawItem.name && typeof rawItem.name === "string" && rawItem.name.trim()) {
    const rawName = rawItem.name.trim();
    const isIdLike =
      rawName === rawId ||
      rawName.startsWith("src_def_") ||
      rawName.startsWith("derived_") ||
      rawName.includes("__") ||
      (/^[a-z0-9_]+$/i.test(rawName) && !rawName.includes(" "));
    if (!isIdLike) {
      return rawName;
    }
  }

  // 2. Canonical spec name (gold_18k, full_coin, etc.)
  const canonical = getCanonicalAssetSpec(itemKey || rawId);
  if (canonical?.name) {
    return canonical.name;
  }

  // 3. Source knownItems (e.g. gold -> 'طرح طلا')
  const cfg = getSourceConfig(sourceId) || getSourceCategoryConfig(rawId);
  if (cfg?.knownItems?.[itemKey]?.name) {
    return cfg.knownItems[itemKey].name;
  }
  if (cfg?.knownItems?.[itemKey.toLowerCase()]?.name) {
    return cfg.knownItems[itemKey.toLowerCase()].name;
  }

  // 4. Bourse fallback
  if (rawId.startsWith("bourse_") || (cfg?.id === "src_def_bourse" && itemKey)) {
    return `سهام ${itemKey}`;
  }

  // 5. Source name if single-rate
  if (cfg?.name && (sourceId === itemKey || rawId === sourceId)) {
    return cfg.name;
  }

  return rawItem.title || itemKey || rawId;
}

/**
 * Resolves the display name of an item combined with its source name:
 * "{item.name} ({sourceConfig.name})" or "{item.name} ({sourceConfig.brand})".
 *
 * Avoids duplicate brand tokens if item name already includes the source brand/name.
 *
 * @param {object|string} item - Raw item object or item ID string
 * @param {object|null} [sourceConfig=null] - Optional pre-resolved source config
 * @returns {string}
 */
export function getItemDisplayName(item, sourceConfig = null) {
  if (!item) return "";

  const isString = typeof item === "string";
  const rawItem = isString ? { id: item } : item;
  const rawId = String(rawItem.id || rawItem.assetId || rawItem.symbol || rawItem.s || "").trim();
  const { sourceId } = parseItemId(rawId);

  const masterCfg = getSourceConfig(sourceConfig?.id || sourceConfig?.priceType) ||
    (rawItem.sourceId ? getSourceConfig(rawItem.sourceId) : null) ||
    getSourceConfig(sourceId) ||
    getSourceCategoryConfig(rawId);

  const cfg = masterCfg ? { ...masterCfg, ...(sourceConfig || {}) } : (sourceConfig || {});

  const baseName = getItemBaseName(rawItem);
  const brand = cfg?.brand || (cfg ? getSourceBrand(cfg) : getSourceBrand(sourceId));
  if (!brand) return baseName;

  // Avoid duplicate brand tokens if baseName already includes brand or equals source name
  if (baseName.includes(brand) || (cfg?.name && baseName === cfg.name)) {
    return baseName;
  }

  return `${baseName} (${brand})`;
}

/**
 * Resolves the unit of an item.
 * Contract: Defined ONLY at the source level (sourceConfig.unit).
 *
 * @param {object|string} item
 * @param {object|null} [sourceConfig=null]
 * @param {string} [fallbackUnit="واحد"]
 * @returns {string}
 */
export function getItemUnit(item, sourceConfig = null, fallbackUnit = "واحد") {
  const isString = typeof item === "string";
  const rawItem = isString ? { id: item } : item;

  // 1. Raw item unit if explicitly provided on custom holding
  if (rawItem?.unit && typeof rawItem.unit === "string" && rawItem.unit.trim()) {
    return rawItem.unit.trim();
  }

  const rawId = String(rawItem?.id || rawItem?.assetId || rawItem?.symbol || "").trim();
  const { sourceId, itemKey } = parseItemId(rawId);

  const masterCfg = getSourceConfig(sourceConfig?.id || sourceConfig?.priceType) ||
    (rawItem?.sourceId ? getSourceConfig(rawItem.sourceId) : null) ||
    getSourceConfig(sourceId) ||
    getSourceCategoryConfig(rawId);

  const cfg = masterCfg ? { ...masterCfg, ...(sourceConfig || {}) } : (sourceConfig || {});

  // 2. Source unit from sources.config.js
  if (cfg?.unit) return cfg.unit;

  // 3. Known item unit
  if (cfg?.knownItems?.[itemKey]?.unit) return cfg.knownItems[itemKey].unit;

  // 4. Canonical spec unit (gold, coin, silver, etc.)
  const spec = getCanonicalAssetSpec(itemKey || rawId);
  if (spec?.unit) return spec.unit;

  // 5. Bourse legacy fallback
  if (rawId.startsWith("bourse_")) {
    return "برگ سهم";
  }

  return fallbackUnit;
}

/**
 * Resolves the category of an item.
 * Contract: Defined ONLY at the source level (sourceConfig.category).
 *
 * @param {object|string} item
 * @param {object|null} [sourceConfig=null]
 * @param {string|null} [fallbackType=null]
 * @returns {string} - 'gold' | 'coin' | 'silver' | 'currency' | 'crypto' | 'bourse' | 'bourse_fund' | 'custom'
 */
export function getItemCategory(item, sourceConfig = null, fallbackType = null) {
  const isString = typeof item === "string";
  const rawItem = isString ? { id: item } : item;
  const rawId = String(rawItem?.id || rawItem?.assetId || rawItem?.symbol || rawItem?.priceType || "").trim();
  const { sourceId, itemKey } = parseItemId(rawId);

  const masterCfg = getSourceConfig(sourceConfig?.id || sourceConfig?.priceType) ||
    (rawItem?.sourceId ? getSourceConfig(rawItem.sourceId) : null) ||
    getSourceConfig(sourceId) ||
    getSourceCategoryConfig(rawId);

  const cfg = masterCfg ? { ...masterCfg, ...(sourceConfig || {}) } : (sourceConfig || {});

  // 1. Source category from sources.config.js
  if (cfg?.category) return cfg.category;
  if (cfg?.isFund || rawItem?.isFund) return "bourse_fund";

  // 2. Canonical spec category
  const spec = getCanonicalAssetSpec(itemKey || rawId);
  if (spec?.category) return spec.category;

  // 3. Bourse legacy fallback
  if (rawId.startsWith("bourse_")) {
    return "bourse";
  }

  // 4. Raw item category if valid
  if (rawItem?.category && CATEGORY_MAP[rawItem.category]) return rawItem.category;
  if (rawItem?.assetType && CATEGORY_MAP[rawItem.assetType]) return rawItem.assetType;

  if (fallbackType && CATEGORY_MAP[fallbackType]) return fallbackType;

  return "custom";
}

/**
 * Resolves Lucide icon name for any category.
 * Contract: Defined ONLY in categories.config.js.
 *
 * @param {string} categoryKey
 * @returns {string}
 */
export function getCategoryIconName(categoryKey) {
  return CATEGORY_MAP[categoryKey]?.iconName || "Sparkles";
}

/**
 * Resolves color code/name for any category.
 * Contract: Defined ONLY in categories.config.js.
 *
 * @param {string} categoryKey
 * @returns {string}
 */
export function getCategoryColor(categoryKey) {
  return CATEGORY_MAP[categoryKey]?.color || "blue";
}

/**
 * Resolves category badge text.
 * Contract: Defined ONLY in categories.config.js.
 *
 * @param {object|string} item
 * @param {object|null} [sourceConfig=null]
 * @returns {string}
 */
export function getItemBadge(item, sourceConfig = null) {
  const category = getItemCategory(item, sourceConfig);
  return CATEGORY_MAP[category]?.badge || "دارایی";
}

/**
 * Resolves the brand/source label of an item (e.g. "مفید", "کاریزما", "بورس", "زرما").
 * Contract: Defined ONLY at the source level (sourceConfig.brand/name via getSourceBrand).
 * Falls back to the category badge when no source can be resolved (e.g. custom holdings).
 *
 * @param {object|string} item
 * @param {object|null} [sourceConfig=null]
 * @returns {string}
 */
export function getItemBrand(item, sourceConfig = null) {
  const isString = typeof item === "string";
  const rawItem = isString ? { id: item } : item;
  const rawId = String(rawItem?.id || rawItem?.assetId || rawItem?.symbol || "").trim();
  const { sourceId } = parseItemId(rawId);

  const masterCfg = getSourceConfig(sourceConfig?.id || sourceConfig?.priceType) ||
    (rawItem?.sourceId ? getSourceConfig(rawItem.sourceId) : null) ||
    getSourceConfig(sourceId) ||
    getSourceCategoryConfig(rawId);

  const cfg = masterCfg ? { ...masterCfg, ...(sourceConfig || {}) } : sourceConfig;

  if (cfg && (cfg.id || cfg.brand || cfg.name)) {
    return getSourceBrand(cfg);
  }

  return getItemBadge(item, sourceConfig);
}

/**
 * Dynamic resolution of source configuration for items or keys.
 *
 * @param {string} sourceIdOrAssetId
 * @returns {object|null}
 */
export function getSourceCategoryConfig(sourceIdOrAssetId) {
  if (!sourceIdOrAssetId || typeof sourceIdOrAssetId !== "string") return null;
  const clean = sourceIdOrAssetId.replace(/^src_def_/, "").replace(/^derived_/, "").toLowerCase().trim();

  // 1. Direct match by source ID or priceType
  const direct = getSourceConfig(clean);
  if (direct) return direct;

  // 2. Prefixed match (e.g. "charisma_plans__gold" or "src_def_bourse__فولاد")
  for (const s of PRICE_SOURCES_CONFIG) {
    if (!s) continue;
    const sCleanId = String(s.id || "").replace(/^src_def_/, "").toLowerCase().trim();
    const sPType = String(s.priceType || "").toLowerCase().trim();

    if (clean.startsWith(`${sCleanId}__`) || clean.startsWith(`${sCleanId}_`)) {
      return s;
    }
    if (sPType && (clean.startsWith(`${sPType}__`) || clean.startsWith(`${sPType}_`))) {
      return s;
    }
  }

  return null;
}

/**
 * Dynamic source display name resolver (used by UI catalog cards and feeds).
 * Purely data-driven from PRICE_SOURCES_CONFIG.
 *
 * @param {string|object} sourceOrItem
 * @param {Array<object>} [customSources=[]]
 * @returns {string}
 */
export function getSourceDisplayName(sourceOrItem, customSources = []) {
  if (!sourceOrItem) return "";

  const allSources = Array.isArray(customSources) && customSources.length > 0
    ? [...customSources, ...PRICE_SOURCES_CONFIG]
    : PRICE_SOURCES_CONFIG;

  if (typeof sourceOrItem === "object") {
    // Check knownSymbols on sources (e.g. fund matching)
    const sym = String(sourceOrItem.symbol || sourceOrItem.s || "").trim();
    if (sym) {
      const match = allSources.find((s) => Array.isArray(s.knownSymbols) && s.knownSymbols.includes(sym));
      if (match?.name) return match.name;
    }

    // Check brand in item name
    const itemName = String(sourceOrItem.name || sourceOrItem.n || sourceOrItem.title || "").trim();
    if (itemName) {
      const match = allSources.find((s) => s.brand && itemName.includes(s.brand));
      if (match?.name) return match.name;
    }

    // Direct match by sourceId or priceType
    const key = String(sourceOrItem.sourceId || sourceOrItem.source || sourceOrItem.priceType || sourceOrItem.id || "").trim();
    if (key) {
      const direct = allSources.find((s) => s.id === key || s.priceType === key || s.id?.toLowerCase() === key.toLowerCase());
      if (direct?.name) return direct.name;
    }

    if (sourceOrItem.priceType === "bourse" || sourceOrItem.type === "bourse") {
      const bourse = allSources.find((s) => s.id === "src_def_bourse");
      if (bourse?.name) return bourse.name;
    }

    if (sourceOrItem.sourceName) return sourceOrItem.sourceName;
    if (sourceOrItem.name && sourceOrItem.endpoint) return sourceOrItem.name;
  }

  const key = String(sourceOrItem).trim();
  const direct = allSources.find((s) => s.id === key || s.priceType === key || s.id?.toLowerCase() === key.toLowerCase() || s.priceType?.toLowerCase() === key.toLowerCase());
  if (direct?.name) return direct.name;

  return "";
}

/**
 * Resolves display metadata for a catalog item using source's knownItems.
 *
 * @param {string} assetId
 * @returns {{ name: string, unit: string }|null}
 */
export function getSourceItemDisplayName(assetId) {
  if (!assetId || typeof assetId !== "string") return null;
  const { sourceId, itemKey } = parseItemId(assetId);
  const cfg = getSourceConfig(sourceId) || getSourceCategoryConfig(assetId);
  if (cfg?.knownItems?.[itemKey]) {
    return cfg.knownItems[itemKey];
  }
  if (cfg?.knownItems?.[itemKey.toLowerCase()]) {
    return cfg.knownItems[itemKey.toLowerCase()];
  }
  return null;
}
