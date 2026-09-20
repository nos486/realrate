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
} from '../../../utils/financialSpecs.js';

export { resolveHoldingUnitRealPrice, normalizePersianText };

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
  const cleanName = assetName.replace(/^src_def_/, '').replace(/^derived_/, '').trim();

  const resolvedCategory = resolveItemCategory(h);

  // 1. Bourse Stocks & Funds Checks
  if (resolvedCategory === 'bourse' || resolvedCategory === 'bourse_fund') {
    const isFund = resolvedCategory === 'bourse_fund';
    if (!unit || unit === 'واحد' || unit === 'گرم' || unit === 'عدد' || unit === 'تومان') {
      unit = isFund ? 'واحد' : 'برگ سهم';
    }
    return {
      ...h,
      assetId,
      assetName,
      assetType: resolvedCategory,
      category: resolvedCategory,
      unit,
      isFund,
      currentPrice,
      customPrice,
    };
  }

  // 2. Custom personal asset checks
  if (resolvedCategory === 'custom') {
    return {
      ...h,
      assetId: assetId.startsWith('custom_') ? assetId : (cleanId === 'custom' ? `custom_${Date.now()}` : assetId),
      assetName: cleanName || 'دارایی شخصی',
      assetType: 'custom',
      category: 'custom',
      unit: unit || 'واحد',
      currentPrice,
      customPrice,
    };
  }

  // 3. Canonical standard assets (Gold, Coins, Silver, Forex, Crypto)
  const canonicalSpec = getCanonicalAssetSpec(cleanId || assetId);
  return {
    ...h,
    assetId: canonicalSpec?.id || cleanId || assetId,
    assetName: canonicalSpec?.name || cleanName,
    assetType: resolvedCategory,
    category: resolvedCategory,
    unit: canonicalSpec?.unit || unit || 'واحد',
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
  const raw = typeof item === 'string' ? item : (item.assetName || item.name || '');

  const cleanId = assetId ? assetId.replace(/^src_def_/, '').replace(/^derived_/, '') : null;
  const isTechnicalId = !raw ||
    raw === assetId ||
    raw === cleanId ||
    raw.startsWith('src_def_') ||
    raw.startsWith('derived_') ||
    raw.includes('__');

  if (assetId?.startsWith('bourse_')) {
    if (!isTechnicalId && !raw.startsWith('bourse_')) return raw;
    const isFund = item.isFund || item.assetType === 'bourse_fund' || item.assetName?.includes('صندوق');
    return isFund ? `صندوق ${assetId.replace('bourse_', '')}` : `سهام ${assetId.replace('bourse_', '')}`;
  }

  const canonicalName = getCanonicalAssetName(cleanId || assetId);

  // If user provided a genuine custom name that is not a technical ID and not identical to cleanId, respect it!
  if (!isTechnicalId && raw && raw !== cleanId && raw !== assetId) {
    return raw.replace(/\s*\([^)]*\)/g, '').trim() || raw;
  }

  if (canonicalName && canonicalName !== cleanId && canonicalName !== assetId) {
    return canonicalName;
  }

  if (raw && !raw.startsWith('src_def_') && !raw.includes('__')) {
    return raw.replace(/\s*\([^)]*\)/g, '').trim() || raw;
  }
  return canonicalName || raw || 'دارایی';
}

