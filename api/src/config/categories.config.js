/**
 * categories.config.js — Single Source of Truth for Portfolio Asset Categories
 *
 * All categories in RealRate are defined declaratively here.
 * To add, remove, or modify a category, edit ONLY this file.
 * Categories define identity, presentation name, badge, icon, and sorting order.
 * Units belong to individual sources and assets, NOT categories.
 */

export const CATEGORIES_CONFIG = [
  {
    key: 'cash',
    name: 'وجه نقد و حساب بانکی',
    badge: 'نقد',
    iconName: 'Wallet',
    color: 'emerald',
    order: 0,
  },
  {
    key: 'gold',
    name: 'طلا',
    badge: 'طلا',
    iconName: 'Award',
    color: 'amber',
    order: 1,
  },
  {
    key: 'coin',
    name: 'سکه‌های بهار آزادی',
    badge: 'سکه',
    iconName: 'Coins',
    color: 'emerald',
    order: 2,
  },
  {
    key: 'silver',
    name: 'نقره و مسکوکات',
    badge: 'نقره',
    iconName: 'Disc',
    color: 'slate',
    order: 3,
  },
  {
    key: 'currency',
    name: 'ارزهای خارجی',
    badge: 'ارز',
    iconName: 'Banknote',
    color: 'indigo',
    order: 4,
  },
  {
    key: 'crypto',
    name: 'رمزارزها',
    badge: 'رمزارز',
    iconName: 'Zap',
    color: 'purple',
    order: 5,
  },
  {
    key: 'bourse',
    name: 'بورس اوراق بهادار تهران (سهام)',
    badge: 'سهام بورس',
    iconName: 'TrendingUp',
    color: 'sky',
    order: 6,
  },
  {
    key: 'bourse_fund',
    name: 'صندوق‌های سرمایه‌گذاری',
    badge: 'صندوق',
    iconName: 'Layers',
    color: 'cyan',
    order: 7,
  },
  {
    // World commodities priced in dollars (oil, platinum, palladium): the price book's `currency: "usd"`
    key: 'commodity',
    name: 'کالاهای جهانی',
    badge: 'کالا',
    iconName: 'Fuel',
    color: 'rose',
    order: 8,
  },
  {
    // Market indicators, not assets: a coin's bubble (its price above its gold's value). Shown on
    // cards and charts, never bought or held — `holdable: false` keeps them out of the portfolio
    key: 'bubble',
    name: 'حباب سکه و طلا',
    badge: 'حباب',
    iconName: 'Gauge',
    color: 'amber',
    order: 9,
    holdable: false,
  },
  {
    key: 'custom',
    name: 'دارایی‌های شخصی و سفارشی',
    badge: 'سفارشی',
    iconName: 'Sparkles',
    color: 'blue',
    order: 10,
  },
];

export const CATEGORY_MAP = Object.fromEntries(
  CATEGORIES_CONFIG.map((c) => [c.key, c])
);

/** Whether assets of a category can be held (bought, sold, priced in a portfolio); default yes */
export function isHoldableCategory(key) {
  return CATEGORY_MAP[key]?.holdable !== false;
}

export function getCategoryConfig(key) {
  return CATEGORY_MAP[key] || null;
}

export function getCategoryColor(key) {
  const category = getCategoryConfig(key);
  return category?.color || 'blue';
}

export function getCategoryIconName(key) {
  const category = getCategoryConfig(key);
  return category?.iconName || 'Sparkles';
}

