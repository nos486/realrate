/**
 * useAccounts.js — The user's money accounts (bank accounts, cash, ...) and changes to them
 *
 * Used by the accounts page and by the expense forms (the "paid from" picker). Nothing loads
 * without the `bank_accounts` feature or while the vault is locked.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRefreshHandler } from '../../../shared/refresh/pageRefresh.js';
import { useAuth } from '../../auth/index.js';
import { useVault } from '../../../shared/vault/useVault.js';
import { useFeature } from '../../../shared/features/useFeature.js';
import { compareAccounts } from '../../../utils/accountDocument.js';
import * as api from '../../../shared/vault/vaultAccounts.js';

export function useAccounts() {
  const { user } = useAuth();
  const enabled = useFeature('bank_accounts');
  const { status: vaultStatus, epoch: vaultEpoch } = useVault();
  const vaultLocked = vaultStatus === 'locked';
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);

  const fetchAccounts = useCallback(async () => {
    if (!user || !enabled || vaultLocked) {
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
  }, [user, enabled, vaultLocked, vaultEpoch]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);
  // The open tab's refresh (header button, window focus) reads them again
  useRefreshHandler('accounts', fetchAccounts);

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
