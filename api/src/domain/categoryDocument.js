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
 * — money put to work rather than spent («سرمایه‌گذاری») or an asset turned back into cash («فروش
 * دارایی») or a deposit that pays a bank credit's debt («تسویه بدهی اعتباری», creditAccount.js).
 * Those are excluded by default; any category can be switched. A stored item without the field
 * keeps the built-in's default.
 *
 * `retired`: a built-in no longer offered — never in a picker or in «دسته‌ها», only shown on the
 * older records that have it, always out of the totals. «مدیریت نقدینگی» (money moved between the
 * user's own accounts) is retired: such a move is a transfer between the accounts, never an
 * expense or an income (transferDocument.js).
 *
 * The stored list is laid over the built-ins (mergeCategories): it gives the order and the
 * changes; a built-in it doesn't mention (one added in a later release) is still there. "other"
 * can't be hidden: it is where unknown and removed categories show. A record keeps its category
 * key, so a removed custom category's records show as "other" and come back if it is restored.
 * Shared with the web app through a symlink (web/src/utils/categoryDocument.js).
 */

import { INCOME_CATEGORIES } from '../config/constants.js';
import { t, msg } from './i18n.js';

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
  'FileCheck',
];

export const CATEGORY_COLORS = [
  '#10b981', '#34d399', '#22d3ee', '#38bdf8', '#60a5fa', '#a78bfa', '#e879f9', '#f472b6',
  '#fb7185', '#ef4444', '#fb923c', '#f59e0b', '#facc15', '#94a3b8',
];

const ICON_SET = new Set(CATEGORY_ICON_NAMES);
const COLOR_RE = /^#[0-9a-f]{6}$/i;


/** The built-in categories of a kind with their Persian source names (the language a stored name is compared in) */
const SOURCE_BUILTINS = {
  expense: [
    { value: 'groceries', label: msg('خوراک و خواربار'), icon: 'ShoppingBasket', color: '#10b981' },
    { value: 'dining', label: msg('رستوران و کافه'), icon: 'UtensilsCrossed', color: '#f59e0b' },
    { value: 'transport', label: msg('رفت‌وآمد و سوخت'), icon: 'Car', color: '#38bdf8' },
    { value: 'bills', label: msg('قبوض و شارژ'), icon: 'Receipt', color: '#a78bfa' },
    { value: 'housing', label: msg('مسکن و اجاره'), icon: 'House', color: '#fb7185' },
    { value: 'shopping', label: msg('خرید و پوشاک'), icon: 'ShoppingBag', color: '#f472b6' },
    { value: 'health', label: msg('سلامت و درمان'), icon: 'HeartPulse', color: '#ef4444' },
    { value: 'education', label: msg('آموزش'), icon: 'GraduationCap', color: '#22d3ee' },
    { value: 'entertainment', label: msg('تفریح و سفر'), icon: 'Plane', color: '#facc15' },
    { value: 'subscriptions', label: msg('اینترنت و اشتراک‌ها'), icon: 'Wifi', color: '#60a5fa' },
    { value: 'gifts', label: msg('هدیه و خیریه'), icon: 'Gift', color: '#e879f9' },
    { value: 'installments', label: msg('پرداخت قسط'), icon: 'Landmark', color: '#fb923c' },
    { value: 'credit_fees', label: msg('کارمزد و سود اعتبار'), icon: 'CreditCard', color: '#ef4444' },
    { value: 'running_costs', label: msg('هزینه‌های جاری'), icon: 'Wallet', color: '#2dd4bf' },
    { value: 'investment', label: msg('سرمایه‌گذاری'), icon: 'TrendingUp', color: '#34d399', excluded: true },
    // Retired: a move between the user's own accounts is a transfer
    { value: 'cash_management', label: msg('مدیریت نقدینگی'), icon: 'Wallet', color: '#22d3ee', excluded: true, retired: true },
    { value: 'other', label: msg('سایر'), icon: 'CircleEllipsis', color: '#94a3b8' },
  ],
  income: [
    { value: 'salary', label: msg('حقوق'), icon: 'Briefcase', color: '#38bdf8' },
    { value: 'benefits', label: msg('مزایا'), icon: 'HandCoins', color: '#22d3ee' },
    { value: 'bonus', label: msg('پاداش'), icon: 'Award', color: '#facc15' },
    { value: 'freelance', label: msg('پروژه و فریلنس'), icon: 'Laptop', color: '#a78bfa' },
    { value: 'business', label: msg('کسب‌وکار'), icon: 'Store', color: '#f59e0b' },
    { value: 'investment', label: msg('سود سرمایه‌گذاری'), icon: 'TrendingUp', color: '#10b981' },
    { value: 'rental', label: msg('اجاره'), icon: 'Home', color: '#fb7185' },
    { value: 'gift', label: msg('هدیه و کمک'), icon: 'Gift', color: '#f472b6' },
    // Retired: a move between the user's own accounts is a transfer
    { value: 'cash_management', label: msg('مدیریت نقدینگی'), icon: 'Wallet', color: '#22d3ee', excluded: true, retired: true },
    { value: 'asset_sale', label: msg('فروش دارایی'), icon: 'PiggyBank', color: '#34d399', excluded: true },
    { value: 'credit_settlement', label: msg('تسویه بدهی اعتباری'), icon: 'CreditCard', color: '#60a5fa', excluded: true },
    { value: 'small_income', label: msg('درآمد خرد'), icon: 'HandCoins', color: '#a3e635' },
    { value: 'loan_received', label: msg('دریافت وام'), icon: 'Landmark', color: '#fb923c', excluded: true },
    { value: 'other', label: msg('سایر'), icon: 'CircleDollarSign', color: '#94a3b8' },
  ],
};

/** The built-in categories of a kind, with their default icon and color (names in the page's language) */
export const BUILTIN_CATEGORIES = Object.fromEntries(
  Object.entries(SOURCE_BUILTINS).map(([kind, list]) => [kind, list.map((c) => ({ ...c, label: t(c.label) }))]),
);

/** A built-in's Persian source name, by kind and key: what a record stores while the user has not renamed it */
const sourceLabel = (kind, value) => SOURCE_BUILTINS[kind]?.find((c) => c.value === value)?.label;

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
  if (!CATEGORY_KINDS.includes(kind)) return { error: t('نوع دسته نامعتبر است.') };
  if (!Array.isArray(list)) return { error: t('فهرست دسته‌ها نامعتبر است.') };
  const builtins = new Map((BUILTIN_CATEGORIES[kind] || []).map((c) => [c.value, c]));
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
    if (!builtin && ++custom > CATEGORY_LIMITS.customPerKind) return { error: t('حداکثر {customPerKind} دسته‌ی جدید می‌شود ساخت.', { customPerKind: CATEGORY_LIMITS.customPerKind }) };
    // A built-in keeps its Persian source name until renamed, whatever language the list was edited in
    const given = String(raw?.label ?? '').trim();
    const label = (builtin && given === builtin.label ? sourceLabel(kind, key) : given) || sourceLabel(kind, key) || '';
    if (!label) return { error: t('نام دسته الزامی است.') };
    if (label.length > CATEGORY_LIMITS.labelLength) return { error: t('نام دسته نباید بیشتر از {labelLength} کاراکتر باشد.', { labelLength: CATEGORY_LIMITS.labelLength }) };
    if (labels.has(label)) return { error: t('دسته‌ی «{label}» تکراری است.', { label }) };
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
 * @returns {Array<{ value: string, label: string, icon: string, color: string, hidden: boolean, excluded: boolean, custom: boolean, retired?: boolean }>}
 */
export function mergeCategories(kind, stored) {
  const builtins = BUILTIN_CATEGORIES[kind] || [];
  const list = validateCategoryList(kind, stored || []).value || [];
  const listed = new Set(list.map((c) => c.value));
  const merged = [
    ...list,
    // Built-ins the stored list doesn't mention yet, before "other" when it is at the end
    ...builtins.filter((c) => !listed.has(c.value)).map((c) => ({ ...c, hidden: false, excluded: Boolean(c.excluded) })),
  ].map((c) => {
    // A retired built-in stays as it was made: shown on its old records, out of the totals
    const builtin = builtins.find((b) => b.value === c.value);
    // A built-in not renamed by the user shows in the page's language (its stored name is the Persian source)
    const shown = builtin && c.label === sourceLabel(kind, c.value) ? { ...c, label: builtin.label } : c;
    return builtin?.retired
      ? { ...shown, retired: true, excluded: true, custom: false }
      : { ...shown, custom: CUSTOM_CATEGORY_RE.test(c.value) };
  });
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
