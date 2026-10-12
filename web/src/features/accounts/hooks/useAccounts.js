/**
 * useAccounts.js — The user's money accounts (bank accounts, cash, ...) and changes to them
 *
 * Used by the accounts page and by the expense forms (the "paid from" picker). Nothing loads
 * without the `bank_accounts` feature or while the vault is locked.
 *
 * Inside an AccountsProvider (context/AccountsContext.jsx) every caller shares one list: one
 * download and decryption instead of one per component. Outside one, the hook keeps its own.
 */

import { useState, useEffect, useCallback, useContext } from 'react';
import { AccountsContext } from '../context/accountsContextValue.js';
import { useRefreshHandler } from '../../../shared/refresh/pageRefresh.js';
import { useAuth } from '../../auth/index.js';
import { useVault } from '../../../shared/vault/useVault.js';
import { useFeature } from '../../../shared/features/useFeature.js';
import { compareAccounts } from '../../../utils/accountDocument.js';
import * as api from '../../../shared/vault/vaultAccounts.js';

/** The accounts and changes to them: the shared list when there is a provider, else its own */
export function useAccounts() {
  const shared = useContext(AccountsContext);
  const own = useAccountsState(!shared);
  return shared || own;
}

/**
 * The state behind useAccounts (what AccountsProvider holds once)
 * @param {boolean} [active] false: loads nothing (a shared list is used instead)
 */
export function useAccountsState(active = true) {
  const { user } = useAuth() || {};
  const enabled = useFeature('bank_accounts');
  const { status: vaultStatus, epoch: vaultEpoch } = useVault();
  const vaultLocked = vaultStatus === 'locked';
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);

  const fetchAccounts = useCallback(async () => {
    if (!active || !user || !enabled || vaultLocked) {
      setAccounts([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      setAccounts((await api.getAccounts()).accounts);
    } catch (err) {
      setError(err.message || 'خطا در بارگذاری حساب‌ها');
    } finally {
      setLoading(false);
    }
    // vaultEpoch: reload after unlocking
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, user, enabled, vaultLocked, vaultEpoch]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);
  // The open tab's refresh (header button, window focus) reads them again
  useRefreshHandler('accounts', fetchAccounts, active);

  /** Errors are re-thrown so the open form can show them */
  const saveAccount = useCallback(async (input, existing = null) => {
    setSubmitting(true);
    try {
      const { account } = await api.saveAccount(input, existing);
      setAccounts((prev) => [...prev.filter((a) => a.id !== account.id), account].sort(compareAccounts));
      return account;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const deleteAccount = useCallback(async (accountId) => {
    setDeletingId(accountId);
    setError(null);
    try {
      await api.deleteAccount(accountId);
      setAccounts((prev) => prev.filter((a) => a.id !== accountId));
    } catch (err) {
      setError(err.message || 'خطا در حذف حساب');
      throw err;
    } finally {
      setDeletingId(null);
    }
  }, []);

  return {
    enabled,
    accounts,
    activeAccounts: accounts.filter((a) => !a.archived),
    vaultLocked,
    loading,
    submitting,
    deletingId,
    error,
    clearError: useCallback(() => setError(null), []),
    fetchAccounts,
    saveAccount,
    deleteAccount,
  };
}
