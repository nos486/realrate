import { useEffect, useState } from 'react';
import { useVault } from '../vault/useVault.js';
import { CATEGORIES_EVENT, loadCategories, resetCategories, listCategories } from './categoryStore.js';

/**
 * The user's categories, kept up to date (loaded once the vault is open)
 * @param {'expense'|'income'} kind
 * @param {{ includeHidden?: boolean, keep?: string }} [options]
 * @returns {object[]} the kind's categories (also re-renders the caller on any change, so its
 *   getExpenseCategory / getIncomeCategory lookups are current)
 */
export function useCategories(kind, options = {}) {
  const { status, epoch } = useVault();
  const [, setVersion] = useState(0);
  useEffect(() => {
    const refresh = () => setVersion((v) => v + 1);
    window.addEventListener(CATEGORIES_EVENT, refresh);
    return () => window.removeEventListener(CATEGORIES_EVENT, refresh);
  }, []);
  useEffect(() => {
    if (status === 'unlocked') loadCategories(epoch);
    else if (status === 'locked') resetCategories();
  }, [status, epoch]);
  return listCategories(kind, options);
}
