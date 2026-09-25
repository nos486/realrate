/**
 * incomeCategories.js — Income category catalog
 * Keys must stay in sync with INCOME_CATEGORIES in api/src/config/constants.js.
 */

import { Briefcase, HandCoins, Award, Laptop, Store, TrendingUp, Home, Gift, CircleDollarSign } from 'lucide-react';

export const INCOME_CATEGORIES = [
  { value: 'salary', label: 'حقوق', Icon: Briefcase, color: '#38bdf8' },
  { value: 'benefits', label: 'مزایا', Icon: HandCoins, color: '#22d3ee' },
  { value: 'bonus', label: 'پاداش', Icon: Award, color: '#facc15' },
  { value: 'freelance', label: 'پروژه و فریلنس', Icon: Laptop, color: '#a78bfa' },
  { value: 'business', label: 'کسب‌وکار', Icon: Store, color: '#f59e0b' },
  { value: 'investment', label: 'سود سرمایه‌گذاری', Icon: TrendingUp, color: '#10b981' },
  { value: 'rental', label: 'اجاره', Icon: Home, color: '#fb7185' },
  { value: 'gift', label: 'هدیه و کمک', Icon: Gift, color: '#f472b6' },
  { value: 'other', label: 'سایر', Icon: CircleDollarSign, color: '#94a3b8' },
];

export const DEFAULT_INCOME_CATEGORY = 'salary';

/** Labels used by earlier versions (e.g. in exported CSV files) → category key */
export const LEGACY_CATEGORY_LABELS = { 'حقوق و دستمزد': 'salary' };

const CATEGORY_MAP = Object.fromEntries(INCOME_CATEGORIES.map((c) => [c.value, c]));

/**
 * Resolve a category key to its display metadata, falling back to "other"
 * @param {string} value
 */
export function getIncomeCategory(value) {
  return CATEGORY_MAP[value] || CATEGORY_MAP.other;
}
