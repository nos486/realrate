/**
 * homeLayoutModel.js — Default home page, ready-made presets and pure edit operations
 *
 * A layout is `{ version, sections: [{ id, title, style, items: [assetId] }] }` (validated by
 * utils/homeLayout.js, shared with the API). Every operation returns a new layout.
 */

import { sanitizeHomeLayout, HOME_LAYOUT_VERSION, HOME_LAYOUT_LIMITS } from '../../utils/homeLayout.js';

/** Default order of currencies on the home page */
export const DEFAULT_PRIORITY_CURRENCIES = [
  'USD', 'USDT', 'XAU', 'EUR', 'AED', 'TRY', 'GBP', 'CHF', 'CAD', 'AUD', 'CNY', 'JPY',
];

export function newSectionId() {
  return `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const layoutOf = (sections) => sanitizeHomeLayout({ version: HOME_LAYOUT_VERSION, sections });

const byPriority = (a, b) => {
  const ia = DEFAULT_PRIORITY_CURRENCIES.indexOf(String(a.code || '').toUpperCase());
  const ib = DEFAULT_PRIORITY_CURRENCIES.indexOf(String(b.code || '').toUpperCase());
  return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || String(a.code || '').localeCompare(String(b.code || ''));
};

/**
 * @typedef {object} LayoutContext
 * @property {Array<object>} analysis   Gold & coin analysis rows (calcData.analysis)
 * @property {Array<object>} currencies Currency rows (calcData.currencies)
 * @property {Array<object>} assets     Every resolved market asset (PricingContext.resolvedAssets)
 */

function goldIds(ctx) {
  // Cards the admin hid from the home page stay hidden by default
  return (ctx.analysis || [])
    .filter((item) => item.id !== 'half_coin' && item.showOnHomePage !== false)
    .map((item) => item.id);
}

function currencyIds(ctx, limit = HOME_LAYOUT_LIMITS.itemsPerSection) {
  return (ctx.currencies || [])
    .filter((c) => c.code && c.showOnHomePage !== false)
    .sort(byPriority)
    .slice(0, limit)
    .map((c) => c.code);
}

function assetIdsOf(ctx, predicate, limit) {
  return (ctx.assets || []).filter(predicate).slice(0, limit).map((a) => a.id);
}

/** The home page a user sees until they customize it — same content as before customization */
export function buildDefaultLayout(ctx) {
  return layoutOf([
    { id: 's_gold', title: 'طلا و سکه', style: 'detailed', items: goldIds(ctx) },
    { id: 's_fx', title: 'ارزها و دارایی‌ها', style: 'compact', items: currencyIds(ctx) },
  ]);
}

/** Ready-made starting points; each is built from the live catalog when applied */
export const HOME_PRESETS = [
  {
    key: 'default',
    label: 'پیش‌فرض',
    description: 'طلا و سکه با جزئیات حباب، و ارزهای اصلی',
    build: buildDefaultLayout,
  },
  {
    key: 'gold',
    label: 'طلا و سکه',
    description: 'کارت کامل طلا و سکه، به‌همراه انس، نقره و دلار',
    build: (ctx) => layoutOf([
      { id: 's_gold', title: 'طلا و سکه', style: 'detailed', items: goldIds(ctx) },
      {
        id: 's_ref',
        title: 'مرجع‌ها',
        style: 'compact',
        items: ['USD', 'USDT', ...assetIdsOf(ctx, (a) => a.category === 'silver', 6)],
      },
    ]),
  },
  {
    key: 'fx',
    label: 'ارز و رمزارز',
    description: 'همه ارزها و رمزارزهای اصلی',
    build: (ctx) => layoutOf([
      { id: 's_fx', title: 'ارزها', style: 'compact', items: currencyIds(ctx) },
      { id: 's_crypto', title: 'رمزارزها', style: 'compact', items: assetIdsOf(ctx, (a) => a.category === 'crypto', 12) },
    ]),
  },
  {
    key: 'bourse',
    label: 'بورس و صندوق‌ها',
    description: 'صندوق‌های طلا و نمادهای دلخواه شما',
    build: (ctx) => layoutOf([
      { id: 's_ref', title: 'مرجع‌ها', style: 'compact', items: ['USD', 'gold_18k', 'full_coin'] },
      {
        id: 's_funds',
        title: 'صندوق‌های طلا',
        style: 'compact',
        items: assetIdsOf(ctx, (a) => a.category === 'bourse_fund' && /طلا/.test(a.name || ''), 8),
      },
      { id: 's_bourse', title: 'نمادهای من', style: 'compact', items: [] },
    ]),
  },
  {
    key: 'minimal',
    label: 'خلاصه',
    description: 'فقط چند نرخ پرکاربرد',
    build: () => layoutOf([
      { id: 's_main', title: 'نرخ‌های اصلی', style: 'compact', items: ['gold_18k', 'full_coin', 'USD', 'USDT', 'EUR'] },
    ]),
  },
];

// ── Edit operations ─────────────────────────────────────────────────────────

const mapSection = (layout, sectionId, fn) =>
  layoutOf(layout.sections.map((s) => (s.id === sectionId ? fn(s) : s)));

const move = (list, index, delta) => {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

export function addSection(layout, { title = 'بخش جدید', style = 'compact' } = {}) {
  if (layout.sections.length >= HOME_LAYOUT_LIMITS.sections) return layout;
  return layoutOf([...layout.sections, { id: newSectionId(), title, style, items: [] }]);
}

export function removeSection(layout, sectionId) {
  return layoutOf(layout.sections.filter((s) => s.id !== sectionId));
}

export function moveSection(layout, sectionId, delta) {
  return layoutOf(move(layout.sections, layout.sections.findIndex((s) => s.id === sectionId), delta));
}

export function updateSection(layout, sectionId, patch) {
  return mapSection(layout, sectionId, (s) => ({ ...s, ...patch, id: s.id, items: s.items }));
}

export function addItem(layout, sectionId, assetId) {
  return mapSection(layout, sectionId, (s) =>
    s.items.includes(assetId) || s.items.length >= HOME_LAYOUT_LIMITS.itemsPerSection
      ? s
      : { ...s, items: [...s.items, assetId] });
}

export function removeItem(layout, sectionId, assetId) {
  return mapSection(layout, sectionId, (s) => ({ ...s, items: s.items.filter((id) => id !== assetId) }));
}

export function moveItem(layout, sectionId, assetId, delta) {
  return mapSection(layout, sectionId, (s) => ({ ...s, items: move(s.items, s.items.indexOf(assetId), delta) }));
}
