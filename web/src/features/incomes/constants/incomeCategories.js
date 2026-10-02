/**
 * incomeCategories.js — Income categories as shown: the built-ins and the user's own, with their
 * icon and color (shared/categories/categoryStore.js; keys in utils/categoryDocument.js)
 */

import { BUILTIN_CATEGORIES } from '../../../utils/categoryDocument.js';
import { categoryIcon } from '../../../shared/categories/categoryIcons.js';
import { getCategory } from '../../../shared/categories/categoryStore.js';

/** The built-in categories with their default look (the user's own: useCategories('income')) */
export const INCOME_CATEGORIES = BUILTIN_CATEGORIES.income.map((c) => ({ ...c, Icon: categoryIcon(c.icon) }));

export const DEFAULT_INCOME_CATEGORY = 'salary';

/** Labels used by earlier versions (e.g. in exported CSV files) → category key */
export const LEGACY_CATEGORY_LABELS = { 'حقوق و دستمزد': 'salary' };

/**
 * Resolve a category key to its display metadata (as the user named it), falling back to "other"
 * @param {string} value
 */
export function getIncomeCategory(value) {
  return getCategory('income', value);
}
