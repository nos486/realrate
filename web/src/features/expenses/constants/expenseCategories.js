/**
 * expenseCategories.js — Everyday expense categories as shown: the built-ins and the user's own,
 * with their icon and color (shared/categories/categoryStore.js; keys in utils/categoryDocument.js)
 */

import { BUILTIN_CATEGORIES } from '../../../utils/categoryDocument.js';
import { categoryIcon } from '../../../shared/categories/categoryIcons.js';
import { getCategory } from '../../../shared/categories/categoryStore.js';

/** The built-in categories with their default look (the user's own: useCategories('expense')) */
export const EXPENSE_CATEGORIES = BUILTIN_CATEGORIES.expense.map((c) => ({ ...c, Icon: categoryIcon(c.icon) }));

/** Display data of a category key (as the user named it), "other" for none or an unknown one */
export function getExpenseCategory(value) {
  return getCategory('expense', value);
}
