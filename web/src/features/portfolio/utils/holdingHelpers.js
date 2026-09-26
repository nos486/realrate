import React from 'react';
import {
  Award,
  Coins,
  Disc,
  Banknote,
  Zap,
  TrendingUp,
  Layers,
  Sparkles,
  Wallet,
} from 'lucide-react';
import {
  resolveItemCategory,
  PORTFOLIO_CATEGORIES,
  resolveHoldingUnitRealPrice,
  normalizePersianText,
  resolveAssetDisplayName,
  resolveAssetDisplayWithSource,
  resolveAssetUnit,
} from '../../../utils/financialSpecs.js';
import { getCategoryIconName, getItemBrand, getItemCategory } from '../../../config/displayEngine.js';
import { toPriceId, isCustomAssetId } from '../../../utils/priceIds.js';
import { assetOf, priceOf } from '../../market/priceBookAssets.js';

export {
  resolveHoldingUnitRealPrice,
  normalizePersianText,
  resolveAssetDisplayName,
  resolveAssetDisplayWithSource,
  resolveAssetUnit,
  getItemBrand,
};

/**
 * Resolve a UniversalAssetSearch onSelect() result down to a plain, storable
 * {id, name, unit, category} — the same resolution TransactionForm/AddHoldingForm's own
 * handleAssetSelect uses for the PRIMARY asset, reused here for picking a REFERENCE asset
 * (whatever was paid/swapped to acquire the primary one). Returns null for a personal
 * "custom" asset, which has no live price and so cannot serve as a priceable reference.
 *
 * @param {object} asset - result from UniversalAssetSearch's onSelect
 * @returns {null|{id: string, name: string, unit: string, category: string}}
 */
export function resolveSelectedAsset(asset) {
  if (!asset) return null;
  const rawItem = asset.raw || asset;
  const category = asset.category || getItemCategory(rawItem);
  if (category === 'custom' || isCustomAssetId(asset.id)) return null;
  // Picked assets come from the price book: their id is the one to store
  const id = toPriceId(asset.id || rawItem.id);
  return { id, name: asset.name || resolveAssetDisplayName(id, rawItem), unit: asset.unit || resolveAssetUnit(id, rawItem), category };
}

/**
 * Resolve the current Toman price of ONE unit of any asset — the same lookup the whole
 * app already uses (pricing.priceMap / itemMap from the price book, the single
 * pricing engine), never a separate computation of our own. For gold/coin/silver
 * specifically this deliberately prefers intrinsicPrice (pure world-spot-based value)
 * over the domestic market price, since a swap's reference value should track the
 * world benchmark, not local bazaar premium/discount noise.
 *
 * @param {string} assetId
 * @param {object} [priceMap={}]
 * @param {object} [itemMap={}]
 * @returns {number}
 */
export function resolveReferencePriceToman(assetId, priceMap = {}, itemMap = {}) {
  if (!assetId) return 0;
  const item = assetOf(itemMap, assetId);
  if (['gold', 'coin', 'silver'].includes(item?.category) && Number(item?.intrinsicPrice) > 0) {
    return Math.round(Number(item.intrinsicPrice));
  }
  return Math.round(priceOf(priceMap, assetId));
}

/**
 * Compute a holding's unrealized profit/loss relative to its REFERENCE asset — whatever
 * it was actually paid for / swapped with (a currency, gold, a bourse stock, ...) instead
 * of a plain Toman amount. Answers "was this trade worth it, compared to simply having
 * kept the reference asset": referenceCurrentValue is what referenceQuantity of the
 * reference asset would be worth TODAY (at its live/world price), so the comparison
 * accounts for the reference asset's own price movement too, not just this holding's.
 * The primary Toman P&L (cost basis fixed at trade time) is untouched by this — purely
 * an additional, consistent view built from the one shared pricing engine's output.
 *
 * @param {object} item - a holding with .referenceAssetId, .referenceQuantity, .itemRealVal
 * @param {object} [priceMap={}]
 * @param {object} [itemMap={}]
 * @returns {null|{referenceAssetId, referenceAssetName, unit, referenceQuantity, referenceCurrentValue, referencePnl, referencePnlPct}}
 */
export function computeReferenceAssetPnl(item, priceMap = {}, itemMap = {}) {
  if (!item || !item.referenceAssetId) return null;
  const referenceQuantity = Number(item.referenceQuantity) || 0;
  if (referenceQuantity <= 0) return null;

  const currentRefPrice = resolveReferencePriceToman(item.referenceAssetId, priceMap, itemMap);
  if (currentRefPrice <= 0) return null;

  const refItem = assetOf(itemMap, item.referenceAssetId);

  const referenceCurrentValue = referenceQuantity * currentRefPrice;
  const referencePnl = Number(item.itemRealVal || 0) - referenceCurrentValue;
  const referencePnlPct = referenceCurrentValue > 0 ? (referencePnl / referenceCurrentValue) * 100 : null;

  return {
    referenceAssetId: item.referenceAssetId,
    referenceAssetName: refItem?.name || resolveAssetDisplayName(item.referenceAssetId) || item.referenceAssetId,
    unit: refItem?.unit || resolveAssetUnit(item.referenceAssetId) || 'واحد',
    referenceQuantity,
    referenceCurrentValue,
    referencePnl,
    referencePnlPct,
  };
}

export const CATEGORY_DEFINITIONS = PORTFOLIO_CATEGORIES;

export function formatNum(num) {
  if (num === null || num === undefined || isNaN(num)) return '۰';
  return Math.round(num).toLocaleString('fa-IR');
}

export function parseInputNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  const pers = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  let s = String(val);
  for (let i = 0; i < 10; i++) {
    s = s.replace(new RegExp(pers[i], 'g'), i);
  }
  const clean = s.replace(/,/g, '').trim();
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}

export function normalizeHolding(h, itemMap = null) {
  if (!h) return h;
  let assetId = String(h.assetId || '').trim();
  let assetName = String(h.assetName || '').trim();
  let unit = String(h.unit || '').trim();
  const currentPrice = Number(
    h.currentPrice !== undefined && h.currentPrice !== null && h.currentPrice !== ''
      ? h.currentPrice
      : (h.customPrice !== undefined && h.customPrice !== null && h.customPrice !== ''
        ? h.customPrice
        : 0)
  );
  const customPrice = Number(
    h.customPrice !== undefined && h.customPrice !== null && h.customPrice !== ''
      ? h.customPrice
      : (h.currentPrice !== undefined && h.currentPrice !== null && h.currentPrice !== ''
        ? h.currentPrice
        : 0)
  );

  const cleanId = isCustomAssetId(assetId) ? assetId : toPriceId(assetId, itemMap);

  // The asset in the price book (old stored ids resolve too): its name and source win
  const liveItem = isCustomAssetId(assetId) ? null : assetOf(itemMap, assetId);
  if (liveItem) assetId = liveItem.id;

  // Allow live catalog data to override the pattern-based category detection.
  // This fixes legacy ids like "atieh" which resolve to "bourse" by pattern but
  // are actually "bourse_fund" according to the live catalog sourceConfig.
  const resolvedCategory = liveItem?.category || resolveItemCategory(h);
  const liveSourceId = liveItem?.sourceId || liveItem?.source || null;

  // 1. Bourse Stocks & Funds
  if (resolvedCategory === 'bourse' || resolvedCategory === 'bourse_fund') {
    const isFund = resolvedCategory === 'bourse_fund';
    // Build enriched raw item for displayEngine when live data is available
    const rawForDisplay = liveItem
      ? { ...h, name: liveItem.name, sourceId: liveSourceId, category: liveItem.category }
      : h;
    const displayName = resolveAssetDisplayName(assetId, rawForDisplay);
    if (!unit || unit === 'واحد' || unit === 'گرم' || unit === 'عدد' || unit === 'تومان') {
      unit = isFund ? 'واحد' : 'برگ سهام';
    }
    return {
      ...h,
      assetId,
      assetName: displayName,
      assetType: resolvedCategory,
      category: resolvedCategory,
      ...(liveSourceId ? { sourceId: liveSourceId } : {}),
      unit,
      isFund,
      currentPrice,
      customPrice,
    };
  }

  // 2. Custom personal asset
  if (resolvedCategory === 'custom') {
    return {
      ...h,
      assetId: assetId.startsWith('custom_') ? assetId : (cleanId === 'custom' ? `custom_${Date.now()}` : assetId),
      assetName: assetName && !assetName.includes('__') ? assetName : ('دارایی شخصی'),
      assetType: 'custom',
      category: 'custom',
      unit: unit || 'واحد',
      currentPrice,
      customPrice,
    };
  }

  // 3. Canonical standard assets (Gold, Coins, Silver, Forex, Crypto) + catalog items
  const rawForDisplay = liveItem
    ? { ...h, name: liveItem.name, sourceId: liveSourceId, category: liveItem.category }
    : h;
  const displayName = resolveAssetDisplayName(assetId, rawForDisplay);
  const resolvedUnit = resolveAssetUnit(assetId, rawForDisplay, unit || 'واحد');
  return {
    ...h,
    assetId: cleanId || assetId,
    assetName: displayName,
    assetType: resolvedCategory,
    category: resolvedCategory,
    ...(liveSourceId ? { sourceId: liveSourceId } : {}),
    unit: resolvedUnit,
    currentPrice,
    customPrice,
  };
}

const ICON_COMPONENT_MAP = {
  Award,
  Coins,
  Disc,
  Banknote,
  Zap,
  TrendingUp,
  Layers,
  Sparkles,
  Wallet,
};

export function CategoryIcon({ category, size = 18, className = '', style = {} }) {
  const iconName = getCategoryIconName(category);
  const IconComponent = ICON_COMPONENT_MAP[iconName] || Sparkles;
  return React.createElement(IconComponent, { size, className, style });
}

export function formatAssetName(item, itemMap = null) {
  if (!item) return '';
  const assetId = item.assetId || (typeof item === 'string' ? item : null);
  if (!assetId) {
    const raw = item.assetName || item.name || '';
    return raw.replace(/\s*\([^)]*\)/g, '').trim() || raw || 'دارایی';
  }
  // The asset in the price book (old stored ids resolve too) gives the name
  const liveItem = assetOf(itemMap, assetId);
  const rawForDisplay = liveItem
    ? { ...item, name: liveItem.name, sourceId: liveItem.sourceId || liveItem.source, category: liveItem.category }
    : item;
  return resolveAssetDisplayName(assetId, rawForDisplay) || 'دارایی';
}
