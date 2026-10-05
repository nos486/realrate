/**
 * expenseCategories.js — Everyday expense categories as shown: the built-ins and the user's own,
 * with their icon and color (shared/categories/categoryStore.js; keys in utils/categoryDocument.js)
 */

import { getCategory } from '../../../shared/categories/categoryStore.js';

/** Display data of a category key (as the user named it), "other" for none or an unknown one */
export function getExpenseCategory(value) {
  return getCategory('expense', value);
}
