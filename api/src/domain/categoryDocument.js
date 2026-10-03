/**
 * categoryDocument.js — The user's own expense and income categories
 *
 * The built-in categories (DAILY_EXPENSE_CATEGORIES in expenseDocument.js, INCOME_CATEGORIES in
 * config/constants.js) can be renamed, given another icon and color, reordered and hidden from the
 * pickers; new ones can be added (id `c_…`) and removed. All of it is one end-to-end encrypted
 * vault record per user (kind "category_settings", id "main"):
 *
 *   { expense: [{ value, label, icon, color, hidden, excluded }], income: [...] }
 *
 * `excluded`: the category's records are listed but not counted in the totals, charts and budgets
 * — money that is still the user's (moving it between their own accounts: «مدیریت نقدینگی») or
 * money put to work rather than spent («سرمایه‌گذاری») or an asset turned back into cash («فروش
 * دارایی»). Those are excluded by default; any
 * category can be switched. A stored item without the field keeps the built-in's default.
 *
 * The stored list is laid over the built-ins (mergeCategories): it gives the order and the
 * changes; a built-in it doesn't mention (one added in a later release) is still there. "other"
 * can't be hidden: it is where unknown and removed categories show. A record keeps its category
 * key, so a removed custom category's records show as "other" and come back if it is restored.
 * Shared with the web app through a symlink (web/src/utils/categoryDocument.js).
 */

import { INCOME_CATEGORIES } from '../config/constants.js';

export const CATEGORY_KINDS = ['expense', 'income'];
export const CATEGORY_RECORD_KIND = 'category_settings';
export const CATEGORY_RECORD_ID = 'main';
export const CUSTOM_CATEGORY_RE = /^c_[a-z0-9]{4,16}$/;
export const FALLBACK_CATEGORY = 'other';

export const CATEGORY_LIMITS = { labelLength: 30, customPerKind: 50 };

/** Icon names the web app can draw (web/src/shared/categories/categoryIcons.js) */
export const CATEGORY_ICON_NAMES = [
  'ShoppingBasket', 'UtensilsCrossed', 'Car', 'Receipt', 'House', 'ShoppingBag', 'HeartPulse',
  'GraduationCap', 'Plane', 'Wifi', 'Gift', 'Landmark', 'TrendingUp', 'CircleEllipsis',
  'Briefcase', 'HandCoins', 'Award', 'Laptop', 'Store', 'Home', 'CircleDollarSign',
  'Coffee', 'Fuel', 'Bus', 'Baby', 'PawPrint', 'Dumbbell', 'Shirt', 'Smartphone', 'Book',
  'Music', 'Film', 'Gamepad2', 'Wrench', 'Hammer', 'Pill', 'Stethoscope', 'Scissors', 'Sparkles',
  'Users', 'PiggyBank', 'Wallet', 'CreditCard', 'Building2', 'Tag', 'Star', 'Heart', 'Zap',
];

export const CATEGORY_COLORS = [
  '#10b981', '#34d399', '#22d3ee', '#38bdf8', '#60a5fa', '#a78bfa', '#e879f9', '#f472b6',
  '#fb7185', '#ef4444', '#fb923c', '#f59e0b', '#facc15', '#94a3b8',
];

const ICON_SET = new Set(CATEGORY_ICON_NAMES);
const COLOR_RE = /^#[0-9a-f]{6}$/i;

/** The built-in categories of a kind, with their default icon and color */
export const BUILTIN_CATEGORIES = {
  expense: [
    { value: 'groceries', label: 'خوراک و خواربار', icon: 'ShoppingBasket', color: '#10b981' },
    { value: 'dining', label: 'رستوران و کافه', icon: 'UtensilsCrossed', color: '#f59e0b' },
    { value: 'transport', label: 'رفت‌وآمد و سوخت', icon: 'Car', color: '#38bdf8' },
    { value: 'bills', label: 'قبوض و شارژ', icon: 'Receipt', color: '#a78bfa' },
    { value: 'housing', label: 'مسکن و اجاره', icon: 'House', color: '#fb7185' },
    { value: 'shopping', label: 'خرید و پوشاک', icon: 'ShoppingBag', color: '#f472b6' },
    { value: 'health', label: 'سلامت و درمان', icon: 'HeartPulse', color: '#ef4444' },
    { value: 'education', label: 'آموزش', icon: 'GraduationCap', color: '#22d3ee' },
    { value: 'entertainment', label: 'تفریح و سفر', icon: 'Plane', color: '#facc15' },
    { value: 'subscriptions', label: 'اینترنت و اشتراک‌ها', icon: 'Wifi', color: '#60a5fa' },
    { value: 'gifts', label: 'هدیه و خیریه', icon: 'Gift', color: '#e879f9' },
    { value: 'installments', label: 'پرداخت قسط', icon: 'Landmark', color: '#fb923c' },
    { value: 'investment', label: 'سرمایه‌گذاری', icon: 'TrendingUp', color: '#34d399', excluded: true },
    { value: 'cash_management', label: 'مدیریت نقدینگی', icon: 'Wallet', color: '#22d3ee', excluded: true },
    { value: 'other', label: 'سایر', icon: 'CircleEllipsis', color: '#94a3b8' },
  ],
  income: [
    { value: 'salary', label: 'حقوق', icon: 'Briefcase', color: '#38bdf8' },
    { value: 'benefits', label: 'مزایا', icon: 'HandCoins', color: '#22d3ee' },
    { value: 'bonus', label: 'پاداش', icon: 'Award', color: '#facc15' },
    { value: 'freelance', label: 'پروژه و فریلنس', icon: 'Laptop', color: '#a78bfa' },
    { value: 'business', label: 'کسب‌وکار', icon: 'Store', color: '#f59e0b' },
    { value: 'investment', label: 'سود سرمایه‌گذاری', icon: 'TrendingUp', color: '#10b981' },
    { value: 'rental', label: 'اجاره', icon: 'Home', color: '#fb7185' },
    { value: 'gift', label: 'هدیه و کمک', icon: 'Gift', color: '#f472b6' },
    { value: 'cash_management', label: 'مدیریت نقدینگی', icon: 'Wallet', color: '#22d3ee', excluded: true },
    { value: 'asset_sale', label: 'فروش دارایی', icon: 'PiggyBank', color: '#34d399', excluded: true },
    { value: 'other', label: 'سایر', icon: 'CircleDollarSign', color: '#94a3b8' },
  ],
};

const builtinValues = (kind) => new Set((BUILTIN_CATEGORIES[kind] || []).map((c) => c.value));
const BUILTIN_VALUES = { expense: builtinValues('expense'), income: new Set([...builtinValues('income'), ...INCOME_CATEGORIES]) };

/** A category key a record may carry: a built-in one, or a custom one's id */
export function isCategoryValue(kind, value) {
  const v = String(value ?? '');
  return Boolean(BUILTIN_VALUES[kind]?.has(v) || CUSTOM_CATEGORY_RE.test(v));
}

/** A new custom category's id */
export function newCategoryId(random = () => Math.random()) {
  let id = 'c_';
  while (id.length < 10) id += Math.floor(random() * 36).toString(36);
  return id;
}

/**
 * Validate one kind's stored list
 * @returns {{ value?: object[], error?: string }}
 */
export function validateCategoryList(kind, list) {
  if (!CATEGORY_KINDS.includes(kind)) return { error: 'نوع دسته نامعتبر است.' };
  if (!Array.isArray(list)) return { error: 'فهرست دسته‌ها نامعتبر است.' };
  const builtins = new Map(BUILTIN_CATEGORIES[kind].map((c) => [c.value, c]));
  const seen = new Set();
  const labels = new Set();
  const value = [];
  let custom = 0;
  for (const raw of list) {
    const key = String(raw?.value ?? '');
    const builtin = builtins.get(key);
    if (!builtin && !CUSTOM_CATEGORY_RE.test(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!builtin && ++custom > CATEGORY_LIMITS.customPerKind) return { error: `حداکثر ${CATEGORY_LIMITS.customPerKind} دسته‌ی جدید می‌شود ساخت.` };
    const label = String(raw?.label ?? '').trim() || builtin?.label || '';
    if (!label) return { error: 'نام دسته الزامی است.' };
    if (label.length > CATEGORY_LIMITS.labelLength) return { error: `نام دسته نباید بیشتر از ${CATEGORY_LIMITS.labelLength} کاراکتر باشد.` };
    if (labels.has(label)) return { error: `دسته‌ی «${label}» تکراری است.` };
    labels.add(label);
    const icon = ICON_SET.has(raw?.icon) ? raw.icon : (builtin?.icon || 'Tag');
    const color = COLOR_RE.test(String(raw?.color ?? '')) ? String(raw.color).toLowerCase() : (builtin?.color || '#94a3b8');
    const hidden = key !== FALLBACK_CATEGORY && Boolean(raw?.hidden);
    const excluded = raw?.excluded === undefined ? Boolean(builtin?.excluded) : Boolean(raw.excluded);
    value.push({ value: key, label, icon, color, hidden, excluded });
  }
  return { value };
}

/**
 * Validate the whole record
 * @returns {{ value?: { expense: object[], income: object[] }, error?: string }}
 */
export function validateCategorySettings(body = {}) {
  const value = {};
  for (const kind of CATEGORY_KINDS) {
    const { value: list, error } = validateCategoryList(kind, body?.[kind] || []);
    if (error) return { error };
    value[kind] = list;
  }
  return { value };
}

/**
 * The categories of a kind as shown: the stored list over the built-ins
 * @param {'expense'|'income'} kind
 * @param {object[]|null|undefined} stored
 * @returns {Array<{ value: string, label: string, icon: string, color: string, hidden: boolean, excluded: boolean, custom: boolean }>}
 */
export function mergeCategories(kind, stored) {
  const builtins = BUILTIN_CATEGORIES[kind] || [];
  const list = validateCategoryList(kind, stored || []).value || [];
  const listed = new Set(list.map((c) => c.value));
  const merged = [
    ...list,
    // Built-ins the stored list doesn't mention yet, before "other" when it is at the end
    ...builtins.filter((c) => !listed.has(c.value)).map((c) => ({ ...c, hidden: false, excluded: Boolean(c.excluded) })),
  ].map((c) => ({ ...c, custom: CUSTOM_CATEGORY_RE.test(c.value) }));
  const otherIndex = merged.findIndex((c) => c.value === FALLBACK_CATEGORY);
  if (otherIndex >= 0 && !listed.has(FALLBACK_CATEGORY)) merged.push(...merged.splice(otherIndex, 1));
  return merged;
}

/**
 * Split records into the ones counted in totals and the ones of excluded categories
 * @param {object[]} records
 * @param {(category: string) => boolean} isExcluded
 * @returns {{ counted: object[], excluded: object[] }}
 */
export function splitByExclusion(records = [], isExcluded = () => false) {
  const counted = [];
  const excluded = [];
  for (const r of records) (isExcluded(r?.category) ? excluded : counted).push(r);
  return { counted, excluded };
}
