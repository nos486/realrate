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
import {
  resolveAssetDisplayName,
  resolveAssetUnit,
  resolveCategory,
} from '../../../utils/sourceRegistry.js';

export {
  resolveHoldingUnitRealPrice,
  normalizePersianText,
  resolveAssetDisplayName,
  resolveAssetUnit,
  resolveCategory,
};

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

  const resolvedCategory = resolveCategory(h);
  const displayName = resolveAssetDisplayName(assetId, h);
  const resolvedUnit = resolveAssetUnit(assetId, h, unit);
  const isFund = resolvedCategory === 'bourse_fund' || Boolean(h.isFund);

  let finalAssetId = cleanId || assetId;
  if (resolvedCategory === 'custom' && !finalAssetId.startsWith('custom_')) {
    finalAssetId = finalAssetId === 'custom' ? `custom_${Date.now()}` : finalAssetId;
  }

  return {
    ...h,
    assetId: finalAssetId,
    assetName: displayName || (resolvedCategory === 'custom' ? 'دارایی شخصی' : finalAssetId),
    assetType: resolvedCategory,
    category: resolvedCategory,
    unit: resolvedUnit,
    isFund,
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
  const isMofid =
    item.sourceId === 'src_def_emofid' ||
    item.sourceId === 'emofid_funds' ||
    String(item.sourceName || '').includes('مفید');

  if (isMofid && item.n) {
    return item.n;
  }

  const assetId = item.assetId || (typeof item === 'string' ? item : null);
  if (!assetId) {
    const raw = item.n || item.assetName || item.name || '';
    return raw.replace(/\s*\([^)]*\)/g, '').trim() || raw || 'دارایی';
  }
  return resolveAssetDisplayName(assetId, item) || 'دارایی';
}
