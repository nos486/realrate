/**
 * priceSourceConstants.js — Constants, Default Forms, and Helpers for Price Sources Management
 */

import { CANONICAL_ASSET_REGISTRY } from '../../../../utils/financialSpecs.js';
import { PRICE_SOURCES_CONFIG } from '../../../../config/sources.config.js';
import { getCategoryColor } from '../../../../config/categories.config.js';

// Canonical price type info derived dynamically from domain specs and sources.config.js
export const CANONICAL_PRICE_TYPE_INFO = {
  ...Object.fromEntries(
    Object.values(CANONICAL_ASSET_REGISTRY).map((spec) => [
      spec.id,
      {
        label: spec.name || spec.id,
        category: spec.category || 'single',
        unit: spec.unit || 'تومان',
        badgeColor: getCategoryColor(spec.category) || 'blue',
      },
    ])
  ),
  forex: { label: 'نرخ ارزهای جهانی (فارکس)', category: 'multi_output', unit: 'ارز', badgeColor: getCategoryColor('currency') },
  bourse: { label: 'سهام بورس اوراق بهادار', category: 'multi_output', unit: 'نماد', badgeColor: getCategoryColor('bourse') },
  bourse_fund: { label: 'صندوق‌های سرمایه‌گذاری بورس', category: 'multi_output', unit: 'صندوق', badgeColor: getCategoryColor('bourse_fund') },
  custom_feed: { label: 'فید چند خروجی / کاتالوگ سفارشی', category: 'multi_output', unit: 'آیتم', badgeColor: getCategoryColor('custom') },
};

// Dynamically register all sources declared in PRICE_SOURCES_CONFIG (Single Source of Truth)
if (Array.isArray(PRICE_SOURCES_CONFIG)) {
  for (const src of PRICE_SOURCES_CONFIG) {
    if (src && src.priceType && !CANONICAL_PRICE_TYPE_INFO[src.priceType]) {
      CANONICAL_PRICE_TYPE_INFO[src.priceType] = {
        label: src.name || src.priceType,
        category: src.isCatalog ? 'multi_output' : (src.category || 'single'),
        unit: src.unit || (src.isFund ? 'صندوق' : (src.badge || 'واحد')),
        badgeColor: getCategoryColor(src.category) || 'blue',
      };
    }
  }
}

export const FOREX_PRESETS = [
  {
    id: 'iran_market',
    title: 'ارزهای پرکاربرد بازار ایران',
    icon: '⭐',
    keys: ['EUR', 'TRY', 'AED', 'GBP', 'CHF', 'CAD', 'AUD', 'CNY'],
  },
  {
    id: 'neighbors',
    title: 'ارزهای همسایه و منطقه',
    icon: '🌍',
    keys: ['TRY', 'AED', 'SAR', 'QAR', 'KWD', 'OMR', 'AFN', 'IQD', 'AZN', 'RUB', 'PKR'],
  },
  {
    id: 'g10',
    title: 'ارزهای بین‌المللی G10',
    icon: '🌐',
    keys: ['EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'USD'],
  },
  {
    id: 'brics',
    title: 'ارزهای آسیایی و بریکس',
    icon: '🌏',
    keys: ['CNY', 'INR', 'RUB', 'BRL', 'ZAR', 'AED', 'SAR'],
  },
];

export const DEFAULT_SOURCE_FORM = {
  id: null,
  name: '',
  priceType: 'usd',
  unit: 'تومان',
  sourceType: 'telegram',
  channelUsername: '',
  apiUrl: '',
  jsonPath: '',
  fieldMapping: null,
  excludedOutputs: [],
  displayConfig: null,
  showOnHomePage: true,
  regexPattern: '([\\d,]+)\\s*فروش',
  regexGroupIndex: 1,
  fetchIntervalMinutes: 5,
  isActive: true,
  isPrimary: false,
};

export const DEFAULT_MULTI_FEED_FORM = {
  id: null,
  name: '',
  priceType: 'custom_feed',
  apiUrl: '',
  fetchIntervalMinutes: 60,
  isActive: true,
  showOnHomePage: true,
  homePageOutputsText: '',
};

export function isSourceMultiOutput(s, priceTypeInfo = {}) {
  if (!s) return false;
  if (s.isCatalog || s.category === 'multi_output' || s.isMultiOutput) return true;
  const t = (s.priceType || '').toLowerCase();
  const info = priceTypeInfo[t];
  if (info?.category === 'multi_output') return true;
  if (s.fieldMapping && (s.fieldMapping.isMultiOutput || s.fieldMapping.idField || s.fieldMapping.symbolField || s.fieldMapping.arrayPath)) return true;
  return false;
}

export function formatNum(num, priceType = 'usd', unit = '') {
  if (num === null || num === undefined || isNaN(num)) return '-';
  if (unit) {
    return `${Number(num).toLocaleString('fa-IR')} ${unit}`;
  }
  const info = CANONICAL_PRICE_TYPE_INFO[priceType];
  if (info?.unit && info.unit !== 'تومان') {
    return `${Number(num).toLocaleString('fa-IR')} ${info.unit}`;
  }
  const isForex = ['eur', 'try', 'aed', 'gbp', 'chf', 'cad', 'aud', 'cny'].includes(priceType);
  if (isForex) {
    return Number(num).toLocaleString('fa-IR', { minimumFractionDigits: 4, maximumFractionDigits: 5 });
  }
  const isUsdAsset = priceType === 'ons_gold' || priceType === 'ons_silver';
  if (isUsdAsset) {
    return Number(num).toLocaleString('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return Math.round(num).toLocaleString('fa-IR');
}


export function formatPersianDate(isoStr) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    return new Intl.DateTimeFormat('fa-IR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return isoStr;
  }
}
