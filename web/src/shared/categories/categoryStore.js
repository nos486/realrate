/**
 * categoryStore.js — The user's expense and income categories (built-in ones as they changed
 * them, and their own), for every screen
 *
 * Kept as one encrypted vault record ("category_settings", utils/categoryDocument.js), loaded
 * once the vault is open (useCategories) and held here, so getExpenseCategory /
 * getIncomeCategory stay plain synchronous lookups. Until then — or with the vault locked — the
 * built-in categories are used. A change is announced with CATEGORIES_EVENT.
 */

import {
  CATEGORY_RECORD_KIND,
  CATEGORY_RECORD_ID,
  FALLBACK_CATEGORY,
  mergeCategories,
  validateCategorySettings,
} from '../../utils/categoryDocument.js';
import { listVaultRecords } from '../vault/vaultApi.js';
import { putRecord } from '../vault/vaultRecordMeta.js';
import { encryptVaultRecord, decryptVaultRecord } from '../vault/vaultStore.js';
import { categoryIcon } from './categoryIcons.js';

export const CATEGORIES_EVENT = 'realrate:categories';

let stored = null; // { expense, income } as saved, or null for the built-ins
let loadedFor = null; // the vault epoch it was loaded in
let loading = null;
let cache = null;

function build() {
  const shown = (kind) => mergeCategories(kind, stored?.[kind]).map((c) => ({ ...c, Icon: categoryIcon(c.icon) }));
  const expense = shown('expense');
  const income = shown('income');
  cache = {
    expense,
    income,
    byValue: {
      expense: Object.fromEntries(expense.map((c) => [c.value, c])),
      income: Object.fromEntries(income.map((c) => [c.value, c])),
    },
  };
}

function current() {
  if (!cache) build();
  return cache;
}

function notify() {
  cache = null;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CATEGORIES_EVENT));
}

/**
 * A kind's categories, in the user's order
 * @param {'expense'|'income'} kind
 * @param {{ includeHidden?: boolean, keep?: string }} [options] keep: also a hidden one (the value
 *   a record being edited already has)
 */
export function listCategories(kind, { includeHidden = false, keep = '' } = {}) {
  return current()[kind].filter((c) => includeHidden || !c.hidden || c.value === keep);
}

/** Display data of a category key; "other" for none, an unknown or a removed one */
export function getCategory(kind, value) {
  const { byValue } = current();
  return byValue[kind][value] || byValue[kind][FALLBACK_CATEGORY];
}

/** What is saved (for the manager to edit) */
export function getStoredCategories() {
  return stored;
}

/** Load the record (once per vault opening); the built-ins stay when there is none */
export function loadCategories(epoch = 0) {
  if (loadedFor === epoch && !loading) return Promise.resolve(stored);
  if (loading) return loading;
  loading = (async () => {
    try {
      const res = await listVaultRecords(CATEGORY_RECORD_KIND);
      const record = (res?.records || []).find((r) => r.id === CATEGORY_RECORD_ID) || res?.records?.[0];
      const plain = record ? await decryptVaultRecord(record.payload) : null;
      stored = plain ? validateCategorySettings(plain).value || null : null;
      loadedFor = epoch;
      notify();
    } catch (err) {
      console.warn('Loading categories failed:', err);
    } finally {
      loading = null;
    }
    return stored;
  })();
  return loading;
}

/** Forget the user's categories (signed out or vault locked) */
export function resetCategories() {
  stored = null;
  loadedFor = null;
  notify();
}

/**
 * Save one kind's list (the other kind is kept as it is)
 * @param {'expense'|'income'} kind
 * @param {object[]} list the whole list, in order (built-ins with their changes, and custom ones)
 */
export async function saveCategories(kind, list) {
  const next = { expense: stored?.expense || [], income: stored?.income || [], [kind]: list };
  const { value, error } = validateCategorySettings(next);
  if (error) throw new Error(error);
  const now = new Date().toISOString();
  const record = { id: CATEGORY_RECORD_ID, ...value, updatedAt: now };
  await putRecord(CATEGORY_RECORD_KIND, CATEGORY_RECORD_ID, await encryptVaultRecord(record), record);
  stored = value;
  notify();
  return value;
}
