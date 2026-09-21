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
    key: 'gold',
    name: 'طلا و آب‌شده',
    badge: 'طلا',
    iconName: 'Award',
    order: 1,
  },
  {
    key: 'coin',
    name: 'سکه‌های بهار آزادی',
    badge: 'سکه',
    iconName: 'Coins',
    order: 2,
  },
  {
    key: 'silver',
    name: 'نقره و مسکوکات',
    badge: 'نقره',
    iconName: 'Disc',
    order: 3,
  },
  {
    key: 'currency',
    name: 'ارزهای خارجی',
    badge: 'ارز',
    iconName: 'Banknote',
    order: 4,
  },
  {
    key: 'crypto',
    name: 'رمزارزها',
    badge: 'رمزارز',
    iconName: 'Zap',
    order: 5,
  },
  {
    key: 'bourse',
    name: 'بورس اوراق بهادار تهران (سهام)',
    badge: 'سهام بورس',
    iconName: 'TrendingUp',
    order: 6,
  },
  {
    key: 'bourse_fund',
    name: 'صندوق‌های سرمایه‌گذاری',
    badge: 'صندوق',
    iconName: 'Layers',
    order: 7,
  },
  {
    key: 'custom',
    name: 'دارایی‌های شخصی و سفارشی',
    badge: 'سفارشی',
    iconName: 'Sparkles',
    order: 8,
  },
];

export const CATEGORY_MAP = Object.fromEntries(
  CATEGORIES_CONFIG.map((c) => [c.key, c])
);

export function getCategoryConfig(key) {
  return CATEGORY_MAP[key] || null;
}
