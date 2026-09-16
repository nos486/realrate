/**
 * priceSourceConstants.js — Constants, Default Forms, and Helpers for Price Sources Management
 */

import { CANONICAL_ASSET_REGISTRY } from '../../../../utils/financialSpecs.js';

// Canonical price type info derived from domain specs
export const CANONICAL_PRICE_TYPE_INFO = {
  ...Object.fromEntries(
    Object.values(CANONICAL_ASSET_REGISTRY).map((spec) => [
      spec.id,
      {
        label: spec.name || spec.id,
        category: spec.category || 'single',
        unit: spec.unit || 'تومان',
        badgeColor:
          spec.category === 'gold'
            ? 'amber'
            : spec.category === 'coin'
            ? 'emerald'
            : spec.category === 'silver'
            ? 'slate'
            : spec.category === 'crypto'
            ? 'purple'
            : 'blue',
      },
    ])
  ),
  forex: { label: 'نرخ ارزهای جهانی (فارکس)', category: 'multi_output', unit: 'ارز', badgeColor: 'indigo' },
  bourse: { label: 'سهام بورس اوراق بهادار', category: 'multi_output', unit: 'نماد', badgeColor: 'sky' },
  bourse_fund: { label: 'صندوق‌های سرمایه‌گذاری بورس', category: 'multi_output', unit: 'صندوق', badgeColor: 'cyan' },
  fund_atieh: { label: 'صندوق آتیه مفید (NAV)', category: 'single', unit: 'تومان', badgeColor: 'cyan' },
  emofid_funds: { label: 'صندوق‌های سرمایه‌گذاری مفید', category: 'multi_output', unit: 'صندوق', badgeColor: 'cyan' },
  custom_feed: { label: 'فید چند خروجی / کاتالوگ سفارشی', category: 'multi_output', unit: 'آیتم', badgeColor: 'blue' },
};

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
  if (priceType === 'forex') {
    return `${Number(num).toLocaleString('fa-IR')} ارز`;
  }
  if (priceType === 'bourse_fund') {
    return `${Number(num).toLocaleString('fa-IR')} صندوق`;
  }
  if (priceType === 'bourse') {
    return `${Number(num).toLocaleString('fa-IR')} نماد`;
  }
  if (unit) {
    return `${Number(num).toLocaleString('fa-IR')} ${unit}`;
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

export function getPriceUnit(priceType) {
  const t = (priceType || '').toLowerCase();
  if (t.includes('ons')) return 'دلار';
  if (t === 'crypto') return 'تتر';
  if (t === 'bourse_fund') return 'صندوق';
  if (t === 'bourse') return 'نماد';
  if (t === 'forex') return 'ارز';
  return 'تومان';
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
