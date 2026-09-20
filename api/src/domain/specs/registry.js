/**
 * registry.js — Master Canonical Asset Registry & Metadata Resolution Helpers
 */

import { GOLD_SPECS } from './gold.spec.js';
import { COIN_SPECS } from './coin.spec.js';
import { SILVER_SPECS } from './silver.spec.js';
import { FOREX_SPECS } from './forex.spec.js';
import { CRYPTO_SPECS } from './crypto.spec.js';

// ── Master Canonical Asset Registry ──────────────────────────────────────────
export const CANONICAL_ASSET_REGISTRY = {};

// Register Gold
Object.values(GOLD_SPECS).forEach(item => {
  CANONICAL_ASSET_REGISTRY[item.id] = item;
  CANONICAL_ASSET_REGISTRY[item.id.toLowerCase()] = item;
});

// Register Coins
Object.values(COIN_SPECS).forEach(item => {
  CANONICAL_ASSET_REGISTRY[item.id] = item;
  CANONICAL_ASSET_REGISTRY[item.id.toLowerCase()] = item;
});

// Register Silver
Object.values(SILVER_SPECS).forEach(item => {
  CANONICAL_ASSET_REGISTRY[item.id] = item;
  CANONICAL_ASSET_REGISTRY[item.id.toLowerCase()] = item;
});

// Register Forex
FOREX_SPECS.forEach(item => {
  const spec = {
    id: item.code,
    code: item.code,
    name: item.name,
    flag: item.flag,
    symbol: item.symbol,
    unit: item.unit || 'تومان',
    category: item.category || 'currency',
    badge: item.badge || 'ارز',
    defaultCross: item.defaultCross,
    aliases: item.aliases || [],
  };
  CANONICAL_ASSET_REGISTRY[item.code] = spec;
  CANONICAL_ASSET_REGISTRY[item.code.toLowerCase()] = spec;
});

// Register Crypto
Object.values(CRYPTO_SPECS).forEach(item => {
  CANONICAL_ASSET_REGISTRY[item.id] = item;
  CANONICAL_ASSET_REGISTRY[item.id.toLowerCase()] = item;
});

// Standard Aliases for historical / alternate identifiers
const ALIAS_MAP = {
  // Gold Aliases
  gold_melted: 'melted_gold',
  gold_ounce: 'ons_gold',
  xau: 'ons_gold',
  XAU: 'ons_gold',
  // Coin Aliases
  full_new: 'full_coin',
  half: 'half_coin',
  quarter: 'quarter_coin',
  bank_gram: 'gerami_coin',
  gram: 'gerami_coin',
  // Silver Aliases
  silver_ounce: 'ons_silver',
  silver_999: 'silver_gram',
  xag: 'ons_silver',
  XAG: 'ons_silver',
  // Currency / Forex Aliases
  usd: 'USD',
  usd_toman: 'USD',
};

for (const [alias, canonicalId] of Object.entries(ALIAS_MAP)) {
  const target = CANONICAL_ASSET_REGISTRY[canonicalId];
  if (target) {
    CANONICAL_ASSET_REGISTRY[alias] = target;
    CANONICAL_ASSET_REGISTRY[alias.toLowerCase()] = target;
  }
}

// Dynamically register all aliases and codes declared in asset specs
Object.values(CANONICAL_ASSET_REGISTRY).forEach((item) => {
  if (!item || typeof item !== "object") return;
  if (!item.id && item.code) {
    item.id = item.code;
  }
  if (item.code) {
    if (!CANONICAL_ASSET_REGISTRY[item.code]) CANONICAL_ASSET_REGISTRY[item.code] = item;
    if (!CANONICAL_ASSET_REGISTRY[item.code.toLowerCase()]) CANONICAL_ASSET_REGISTRY[item.code.toLowerCase()] = item;
  }
  if (item.aliases && Array.isArray(item.aliases)) {
    item.aliases.forEach((alias) => {
      if (!alias) return;
      const strAlias = String(alias);
      if (!CANONICAL_ASSET_REGISTRY[strAlias]) CANONICAL_ASSET_REGISTRY[strAlias] = item;
      if (!CANONICAL_ASSET_REGISTRY[strAlias.toLowerCase()]) CANONICAL_ASSET_REGISTRY[strAlias.toLowerCase()] = item;
    });
  }
});

// ── Canonical Name & Metadata Resolution Helpers ─────────────────────────────

/**
 * Retrieve the full canonical asset specification object
 * @param {string} assetId
 * @returns {object|null}
 */
export function getCanonicalAssetSpec(assetId) {
  if (!assetId) return null;
  const clean = String(assetId).replace(/^src_def_/, '').replace(/^derived_/, '').trim();
  return (
    CANONICAL_ASSET_REGISTRY[clean] ||
    CANONICAL_ASSET_REGISTRY[clean.toLowerCase()] ||
    CANONICAL_ASSET_REGISTRY[clean.toUpperCase()] ||
    null
  );
}

/**
 * Retrieve the canonical Persian display name of an asset by ID
 * @param {string} assetId
 * @param {string} fallbackName
 * @returns {string}
 */
export function getCanonicalAssetName(assetId, fallbackName = '') {
  const spec = getCanonicalAssetSpec(assetId);
  if (spec && spec.name) return spec.name;
  return fallbackName || assetId || '';
}

/**
 * Retrieve the canonical unit of an asset by ID
 * @param {string} assetId
 * @param {string} fallbackUnit
 * @returns {string}
 */
export function getCanonicalAssetUnit(assetId, fallbackUnit = 'واحد') {
  const spec = getCanonicalAssetSpec(assetId);
  if (spec && spec.unit) return spec.unit;
  return fallbackUnit;
}

/**
 * Retrieve the canonical category of an asset by ID
 * @param {string} assetId
 * @param {string} fallbackCategory
 * @returns {string}
 */
export function getCanonicalAssetCategory(assetId, fallbackCategory = 'custom') {
  const spec = getCanonicalAssetSpec(assetId);
  if (spec && spec.category) return spec.category;
  return fallbackCategory;
}

/**
 * Retrieve the canonical badge text of an asset by ID
 * @param {string} assetId
 * @param {string} fallbackBadge
 * @returns {string}
 */
export function getCanonicalAssetBadge(assetId, fallbackBadge = '') {
  const spec = getCanonicalAssetSpec(assetId);
  if (spec && spec.badge) return spec.badge;
  return fallbackBadge;
}

/**
 * Resolve the standard category key for any holding/asset
 * @param {object|string} item - holding object or assetId
 * @returns {string} - 'gold' | 'coin' | 'silver' | 'currency' | 'crypto' | 'bourse' | 'bourse_fund' | 'custom'
 */
export function resolveItemCategory(item) {
  if (!item) return 'custom';
  if (typeof item === 'string') {
    const clean = item.replace(/^src_def_/, '').replace(/^derived_/, '').trim();
    const spec = getCanonicalAssetSpec(clean);
    if (spec && spec.category) return spec.category;
    if (clean.startsWith('bourse_')) return 'bourse';
    if (clean.startsWith('custom_') || clean === 'custom') return 'custom';
    return 'custom';
  }

  const assetId = String(item.assetId || item.id || '').trim();
  const cleanId = assetId.replace(/^src_def_/, '').replace(/^derived_/, '').trim();
  const assetType = String(item.assetType || item.category || '').trim().toLowerCase();
  const assetName = String(item.assetName || item.name || '').trim();

  // 1. Canonical standard assets (Gold, Coins, Silver, Forex, Crypto) - Always check first!
  const spec = getCanonicalAssetSpec(cleanId);
  if (spec && spec.category) return spec.category;

  // 2. Custom personal asset
  if (assetType === 'custom' || cleanId.startsWith('custom_') || cleanId === 'custom') {
    return 'custom';
  }

  // 2.5 Charisma Investment Plans
  if (assetType === 'charisma_plans' || item.category === 'charisma_plans' || cleanId.startsWith('charisma_plans')) {
    return 'charisma_plans';
  }

  // 3. Explicit Bourse Stocks & Investment Funds (including Emofid & Charisma)
  const isFund = Boolean(
    item.isFund ||
    item.raw?.isFund ||
    assetType === 'bourse_fund' ||
    assetType === 'emofid_fund' ||
    assetType === 'emofid_funds' ||
    assetType === 'charisma_fund' ||
    assetType === 'charisma_funds' ||
    assetType === 'fund' ||
    cleanId.startsWith('fund_') ||
    cleanId.startsWith('emofid_') ||
    cleanId.startsWith('charisma_') ||
    (assetName.includes('صندوق') && !cleanId.startsWith('custom_'))
  );
  const isBourse = (
    cleanId.startsWith('bourse_') ||
    cleanId.startsWith('fund_') ||
    cleanId.startsWith('emofid_') ||
    cleanId.startsWith('charisma_') ||
    assetType === 'bourse' ||
    assetType === 'bourse_fund' ||
    assetType === 'emofid_fund' ||
    assetType === 'emofid_funds' ||
    assetType === 'charisma_fund' ||
    assetType === 'charisma_funds' ||
    assetType === 'fund' ||
    Boolean(item.isFund) ||
    Boolean(item.raw?.isFund) ||
    (assetName.includes('صندوق') && !cleanId.startsWith('custom_'))
  );
  if (isBourse) {
    return isFund ? 'bourse_fund' : 'bourse';
  }

  if (['gold', 'coin', 'silver', 'currency', 'crypto', 'bourse', 'bourse_fund'].includes(assetType)) {
    return assetType;
  }

  return 'custom';
}

// ── Master Portfolio Category Definitions ───────────────────────────────────
export const PORTFOLIO_CATEGORIES = [
  {
    key: 'gold',
    name: 'طلا و آب‌شده',
    badge: 'طلا',
    iconName: 'Award',
    order: 1,
    match: (item) => resolveItemCategory(item) === 'gold',
  },
  {
    key: 'coin',
    name: 'سکه‌های بهار آزادی',
    badge: 'سکه',
    iconName: 'Coins',
    order: 2,
    match: (item) => resolveItemCategory(item) === 'coin',
  },
  {
    key: 'silver',
    name: 'نقره و مسکوکات',
    badge: 'نقره',
    iconName: 'Disc',
    order: 3,
    match: (item) => resolveItemCategory(item) === 'silver',
  },
  {
    key: 'currency',
    name: 'ارزهای خارجی',
    badge: 'ارز',
    iconName: 'Banknote',
    order: 4,
    match: (item) => resolveItemCategory(item) === 'currency',
  },
  {
    key: 'crypto',
    name: 'رمزارزها',
    badge: 'رمزارز',
    iconName: 'Zap',
    order: 5,
    match: (item) => resolveItemCategory(item) === 'crypto',
  },
  {
    key: 'bourse',
    name: 'بورس اوراق بهادار تهران (سهام)',
    badge: 'سهام بورس',
    iconName: 'TrendingUp',
    order: 6,
    match: (item) => resolveItemCategory(item) === 'bourse',
  },
  {
    key: 'bourse_fund',
    name: 'صندوق‌های سرمایه‌گذاری',
    badge: 'صندوق',
    iconName: 'Layers',
    order: 7,
    match: (item) => resolveItemCategory(item) === 'bourse_fund',
  },
  {
    key: 'custom',
    name: 'دارایی‌های شخصی و سفارشی',
    badge: 'سفارشی',
    iconName: 'Sparkles',
    order: 8,
    match: (item) => resolveItemCategory(item) === 'custom',
  },
];

export const CATEGORY_DEFINITIONS = PORTFOLIO_CATEGORIES;

export const PORTFOLIO_CATEGORY_DICT = Object.fromEntries(
  PORTFOLIO_CATEGORIES.map((c) => [c.key, c])
);

export function getCategoryLabel(categoryKey, fallback = '') {
  return PORTFOLIO_CATEGORY_DICT[categoryKey]?.name || fallback || categoryKey || '';
}

export function getCategoryBadge(categoryKey, fallback = '') {
  return PORTFOLIO_CATEGORY_DICT[categoryKey]?.badge || fallback || categoryKey || '';
}

// ── Dynamic Proxies for Single Source of Truth Forex & Currency Metadata ────

/**
 * Dynamic Proxy providing localized Persian names for world forex currencies
 * eliminating hardcoded dictionaries anywhere in the app.
 */
export const WORLD_FOREX_NAMES = new Proxy({}, {
  get(target, prop) {
    if (typeof prop !== 'string') return target[prop];
    return getCanonicalAssetName(prop, prop);
  },
  has(target, prop) {
    if (typeof prop !== 'string') return false;
    return Boolean(getCanonicalAssetSpec(prop));
  },
});

/**
 * Dynamic Proxy providing complete currency metadata (name, flag, symbol)
 * for all world currencies directly resolved from canonical specifications.
 */
export const CURRENCY_METADATA_MAP = new Proxy({}, {
  get(target, prop) {
    if (typeof prop !== 'string') return target[prop];
    const spec = getCanonicalAssetSpec(prop);
    if (spec) {
      return {
        name: spec.name,
        flag: spec.flag || '🌐',
        symbol: spec.symbol || prop,
      };
    }
    return { name: prop, flag: '🌐', symbol: prop };
  },
  has(target, prop) {
    if (typeof prop !== 'string') return false;
    return Boolean(getCanonicalAssetSpec(prop));
  },
});
