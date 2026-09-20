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
} from 'lucide-react';
import {
  getCanonicalAssetSpec,
  getCanonicalAssetName,
  resolveItemCategory,
  PORTFOLIO_CATEGORIES,
  resolveHoldingUnitRealPrice,
  normalizePersianText,
  resolveAssetDisplayName,
  resolveAssetUnit,
} from '../../../utils/financialSpecs.js';

export { resolveHoldingUnitRealPrice, normalizePersianText, resolveAssetDisplayName, resolveAssetUnit };

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

export function normalizeHolding(h) {
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

  const resolvedCategory = resolveItemCategory(h);

  // 1. Bourse Stocks & Funds
  if (resolvedCategory === 'bourse' || resolvedCategory === 'bourse_fund') {
    const isFund = resolvedCategory === 'bourse_fund';
    const displayName = resolveAssetDisplayName(assetId, h);
    if (!unit || unit === 'واحد' || unit === 'گرم' || unit === 'عدد' || unit === 'تومان') {
      unit = isFund ? 'واحد' : 'برگ سهام';
    }
    return {
      ...h,
      assetId,
      assetName: displayName,
      assetType: resolvedCategory,
      category: resolvedCategory,
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
  const displayName = resolveAssetDisplayName(assetId, h);
  const resolvedUnit = resolveAssetUnit(assetId, h, unit || 'واحد');
  return {
    ...h,
    assetId: cleanId || assetId,
    assetName: displayName,
    assetType: resolvedCategory,
    category: resolvedCategory,
    unit: resolvedUnit,
    currentPrice,
    customPrice,
  };
}

export function CategoryIcon({ category, size = 18, className = '', style = {} }) {
  const iconProps = { size, className, style };
  switch (category) {
    case 'gold':
      return React.createElement(Award, iconProps);
    case 'coin':
      return React.createElement(Coins, iconProps);
    case 'silver':
      return React.createElement(Disc, iconProps);
    case 'currency':
      return React.createElement(Banknote, iconProps);
    case 'crypto':
      return React.createElement(Zap, iconProps);
    case 'bourse':
      return React.createElement(TrendingUp, iconProps);
    case 'bourse_fund':
    case 'charisma_plans':
      return React.createElement(Layers, iconProps);
    case 'custom':
    default:
      return React.createElement(Sparkles, iconProps);
  }
}

export function formatAssetName(item) {
  if (!item) return '';
  const assetId = item.assetId || (typeof item === 'string' ? item : null);
  if (!assetId) {
    const raw = item.assetName || item.name || '';
    return raw.replace(/\s*\([^)]*\)/g, '').trim() || raw || 'دارایی';
  }
  return resolveAssetDisplayName(assetId, item) || 'دارایی';
}
