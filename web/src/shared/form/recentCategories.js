/**
 * recentCategories.js — The categories used last in the entry forms, per kind, on this device only
 * (localStorage): CategoryGrid shows them first and a new entry starts in the last one. Only a
 * convenience — never a record, and nothing breaks without it.
 */

/** How many recent categories are kept per kind */
export const RECENT_LIMIT = 6;

const recentKey = (kind) => `realrate_recent_categories_${kind}`;

/** The categories of a kind used last on this device, newest first */
export function recentCategories(kind) {
  try {
    const list = JSON.parse(localStorage.getItem(recentKey(kind)) || '[]');
    return Array.isArray(list) ? list.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** Remember a category just used (it comes first next time) */
export function rememberCategory(kind, value) {
  if (!value) return;
  try {
    const list = [value, ...recentCategories(kind).filter((v) => v !== value)].slice(0, RECENT_LIMIT);
    localStorage.setItem(recentKey(kind), JSON.stringify(list));
  } catch {
    // Only a convenience
  }
}

