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
  getCanonicalAssetSpec,
  getCanonicalAssetName,
  resolveItemCategory,
  PORTFOLIO_CATEGORIES,
  resolveHoldingUnitRealPrice,
  resolveCurrencyToTomanRate,
  normalizePersianText,
  resolveAssetDisplayName,
  resolveAssetDisplayWithSource,
  resolveAssetUnit,
  FOREX_DICT,
} from '../../../utils/financialSpecs.js';
import { getCategoryIconName, getItemBrand } from '../../../config/displayEngine.js';

export {
  resolveHoldingUnitRealPrice,
  resolveCurrencyToTomanRate,
  normalizePersianText,
  resolveAssetDisplayName,
  resolveAssetDisplayWithSource,
  resolveAssetUnit,
  getItemBrand,
  FOREX_DICT,
};

/**
 * Compute a holding's unrealized profit/loss expressed in its own foreign purchase
 * currency, alongside the primary Toman figures — for holdings paid in USD/EUR/etc.
 * Cost basis is what was actually paid (nativeBuyPrice); current value translates
 * today's already-computed Toman value back via the live FX rate, so the Toman total
 * stays exactly as before and this is purely an additional, consistent view.
 *
 * @param {object} item - a holding with .currency, .nativeBuyPrice, .amount, .itemRealVal
 * @param {object} [priceMap={}]
 * @param {number} [usdToman=0]
 * @returns {null|{currency, symbol, nativeCost, nativeCurrentValue, nativePnl, nativePnlPct}}
 */
export function computeNativeCurrencyPnl(item, priceMap = {}, usdToman = 0) {
  if (!item || !item.currency || item.currency === 'IRT') return null;
  const nativeBuyPrice = Number(item.nativeBuyPrice) || 0;
  const amount = Number(item.amount) || 0;
  if (nativeBuyPrice <= 0 || amount <= 0) return null;

  const fxRate = resolveCurrencyToTomanRate(item.currency, priceMap, usdToman);
  if (fxRate <= 0) return null;

  const nativeCost = amount * nativeBuyPrice;
  const nativeCurrentValue = Number(item.itemRealVal || 0) / fxRate;
  const nativePnl = nativeCurrentValue - nativeCost;
  const nativePnlPct = nativeCost > 0 ? (nativePnl / nativeCost) * 100 : null;

  return {
    currency: item.currency,
    symbol: FOREX_DICT[item.currency]?.symbol || item.currency,
    nativeCost,
    nativeCurrentValue,
    nativePnl,
    nativePnlPct,
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

  const cleanId = assetId.replace(/^src_def_/, '').replace(/^derived_/, '');

  // Live itemMap lookup — if a catalog entry exists, we enrich the raw holding
  // with its real name and sourceId so display engine resolves brand correctly.
  const liveItem = itemMap
    ? (itemMap[assetId] || itemMap[cleanId] || itemMap[assetId?.toLowerCase()] || null)
    : null;

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
  // Live itemMap lookup: if live catalog data is available use it for name resolution
  const cleanId = String(assetId).replace(/^src_def_/, '').replace(/^derived_/, '');
  const liveItem = itemMap
    ? (itemMap[assetId] || itemMap[cleanId] || itemMap[assetId?.toLowerCase()] || null)
    : null;
  const rawForDisplay = liveItem
    ? { ...item, name: liveItem.name, sourceId: liveItem.sourceId || liveItem.source, category: liveItem.category }
    : item;
  return resolveAssetDisplayName(assetId, rawForDisplay) || 'دارایی';
}
