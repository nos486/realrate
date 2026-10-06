/**
 * useIncomes.js — The user's incomes of a date window, and their CRUD operations
 *
 * One query per window: the server filters on each income's plaintext date and returns only that
 * window (the page asks for a Shamsi year and the month before it). Amounts are encrypted, so the
 * totals, the charts and the list's pages are all built in the browser from that one result —
 * switching months inside the year fetches nothing.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRefreshHandler } from '../../../shared/refresh/pageRefresh.js';
import { useAuth } from '../../auth/index.js';
import { useVault } from '../../../shared/vault/useVault.js';
import {
  getIncomes,
  createIncome as apiCreateIncome,
  updateIncome as apiUpdateIncome,
  deleteIncome as apiDeleteIncome,
} from '../api/incomeApi.js';

export const INCOMES_PAGE_SIZE = 20;

/** @param {{ from: string, to: string }} window inclusive YYYY-MM-DD */
export function useIncomes({ from, to }) {
  const { user } = useAuth();
  // With account-wide encryption on, data is only readable once the vault is unlocked
  const { status: vaultStatus, epoch: vaultEpoch } = useVault();
  const vaultLocked = vaultStatus === 'locked';
  const ready = Boolean(user) && !vaultLocked;

  const [reloadToken, setReloadToken] = useState(0);

  // The result is tagged with the request it answers, so loading is derived, not stored
  const [windowData, setWindowData] = useState({ key: null, incomes: [] });
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);
  // The open tab's refresh (header button, window focus) reads the window again
  useRefreshHandler('incomes', reload);

  // The whole window: the list, the reports, the charts and search all read it
  // (vaultEpoch: reload after unlocking or migrating)
  const windowKey = `${from}|${to}|${reloadToken}|${vaultEpoch}`;
  useEffect(() => {
    if (!ready) return undefined;
    let active = true;
    getIncomes({ from, to })
      .then((res) => {
        if (!active) return;
        setWindowData({ key: windowKey, incomes: Array.isArray(res?.incomes) ? res.incomes : [] });
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setWindowData((prev) => ({ ...prev, key: windowKey }));
        setError(err.message || 'خطا در بارگذاری لیست درآمدها');
      });
    return () => {
      active = false;
    };
    // `windowKey` is derived from exactly these values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, windowKey]);

  const loadingIncomes = ready && windowData.key !== windowKey;

  /**
   * Create or update an income depending on whether `incomeId` is given, then reload the period.
   * Errors are re-thrown (not stored in `error`) so the open form can show them.
   * @param {object} incomeData
   * @param {string|null} [incomeId]
   * @param {{ reload?: boolean }} [options] reload: false while importing many at once
   * @returns {Promise<object>} The saved income
   */
  const saveIncome = useCallback(async (incomeData, incomeId = null, { reload: shouldReload = true } = {}) => {
    setSubmitting(true);
    try {
      const res = incomeId
        ? await apiUpdateIncome(incomeId, incomeData)
        : await apiCreateIncome(incomeData);
      if (!res?.success || !res.income) {
        throw new Error(res?.message || 'خطا در ذخیره درآمد');
      }
      if (shouldReload) reload();
      return res.income;
    } finally {
      setSubmitting(false);
    }
  }, [reload]);

  /**
   * Delete an income
   * @param {string} incomeId
   */
  const deleteIncome = useCallback(async (incomeId) => {
    setDeletingId(incomeId);
    setError(null);
    try {
      const res = await apiDeleteIncome(incomeId);
      if (!res?.success) {
        throw new Error(res?.message || 'خطا در حذف درآمد');
      }
      reload();
    } catch (err) {
      setError(err.message || 'خطا در حذف درآمد');
      throw err;
    } finally {
      setDeletingId(null);
    }
  }, [reload]);

  /** Every income, for the CSV export */
  const loadAllIncomes = useCallback(async () => {
    const res = await getIncomes();
    return Array.isArray(res?.incomes) ? res.incomes : [];
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    // Every income of the window (newest first, as the server sorts them)
    incomes: ready ? windowData.incomes : [],
    pageSize: INCOMES_PAGE_SIZE,
    vaultLocked,
    loadingIncomes,
    submitting,
    deletingId,
    error,
    clearError,
    fetchIncomes: reload,
    loadAllIncomes,
    saveIncome,
    deleteIncome,
  };
}
