/**
 * useCheques.js — Loading the user's cheques and every change to them
 *
 * Used once through ChequesProvider, so the cheques page and the home-page reminders share the
 * same list.
 *
 * A cheque's money is recorded with its clearing: when a status change clears it, an income
 * (received) or an expense (issued) is recorded for it, and taking the clearing back (another
 * status, or undoing the quick «پاس شد») removes that record (shared/vault/recordLinks.js).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useFeature } from '../../../shared/features/useFeature.js';
import { settleCheque, unsettleCheque } from '../../../shared/vault/recordLinks.js';
import { useRefreshHandler } from '../../../shared/refresh/pageRefresh.js';
import { useAuth } from '../../auth/index.js';
import { useVault } from '../../../shared/vault/useVault.js';
import { CHEQUE_CLEARED, compareChequesByDue, applyChequeStatus } from '../../../utils/chequeDocument.js';
import {
  getCheques,
  createCheque as apiCreateCheque,
  updateCheque as apiUpdateCheque,
  deleteCheque as apiDeleteCheque,
} from '../api/chequeApi.js';

/** The editable fields of a stored cheque (what the API accepts back) */
function toInput(cheque) {
  const {
    id: _id, userId: _userId, createdAt: _createdAt, updatedAt: _updatedAt, ...input
  } = cheque;
  return input;
}

export function useCheques() {
  const { user } = useAuth();
  // With account-wide encryption on, data is only readable once the vault is unlocked
  const { status: vaultStatus, epoch: vaultEpoch } = useVault();
  const vaultLocked = vaultStatus === 'locked';
  const [cheques, setCheques] = useState([]);
  const [loadingCheques, setLoadingCheques] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);
  const hasExpenses = useFeature('expenses');
  // The list as last read, for an undo that needs the stored copy (its record)
  const latest = useRef([]);
  latest.current = cheques;

  const fetchCheques = useCallback(async () => {
    if (!user || vaultLocked) {
      setCheques([]);
      setLoadingCheques(false);
      return;
    }
    try {
      setLoadingCheques(true);
      setError(null);
      const res = await getCheques();
      setCheques(Array.isArray(res?.cheques) ? res.cheques : []);
    } catch (err) {
      setError(err.message || 'خطا در بارگذاری لیست چک‌ها');
      setCheques([]);
    } finally {
      setLoadingCheques(false);
    }
    // vaultEpoch: reload after unlocking or migrating
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, vaultLocked, vaultEpoch]);

  useEffect(() => {
    fetchCheques();
  }, [fetchCheques]);
  // The open tab's refresh (header button, window focus) reads them again
  useRefreshHandler('cheques', fetchCheques);

  const store = useCallback((cheque) => {
    setCheques((prev) => [...prev.filter((c) => c.id !== cheque.id), cheque].sort(compareChequesByDue));
    return cheque;
  }, []);

  /**
   * Create or update a cheque depending on whether `chequeId` is given. Errors are re-thrown so
   * the open form can show them inline.
   * @returns {Promise<object>} The saved cheque
   */
  const saveCheque = useCallback(async (chequeData, chequeId = null) => {
    setSubmitting(true);
    try {
      const res = chequeId ? await apiUpdateCheque(chequeId, chequeData) : await apiCreateCheque(chequeData);
      if (!res?.success || !res.cheque) throw new Error(res?.message || 'خطا در ذخیره چک');
      return store(res.cheque);
    } finally {
      setSubmitting(false);
    }
  }, [store]);

  /**
   * Record a status change (or a follow-up note, with the same status) in the cheque's log
   * @returns {Promise<object>} The updated cheque
   */
  const changeStatus = useCallback(async (cheque, status, date, note = '') => {
    const saved = await saveCheque(toInput(applyChequeStatus(cheque, status, date, note)), cheque.id);
    await settleWithStatus(cheque, saved, date);
    return saved;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveCheque, hasExpenses]);

  /** Put a cheque back exactly as it was (undo of a quick status change) */
  const restoreCheque = useCallback(async (cheque) => {
    const stored = latest.current.find((c) => c.id === cheque.id) || null;
    // The copy put back keeps the record of its money, if it still has one
    const saved = await saveCheque(toInput({ ...cheque, settlement: stored?.settlement || cheque.settlement || null }), cheque.id);
    await settleWithStatus(stored, saved, saved.history?.at(-1)?.date);
    return saved;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveCheque, hasExpenses]);

  /**
   * The record of a cheque's money follows its status: cleared now → recorded; no longer
   * cleared → removed. Then the list is read again (the cheque points at its record).
   */
  async function settleWithStatus(before, saved, date) {
    const wasCleared = before?.status === CHEQUE_CLEARED;
    const isCleared = saved.status === CHEQUE_CLEARED;
    try {
      if (isCleared && !wasCleared) await settleCheque(saved, { date, expenses: hasExpenses });
      else if (!isCleared && saved.settlement) await unsettleCheque(saved);
      else return;
    } catch (err) {
      setError(`وضعیت چک ذخیره شد، ولی ${isCleared ? 'ثبت' : 'حذف'} درآمد یا هزینه‌اش ممکن نشد: ${err.message || ''}`.trim());
    }
    await fetchCheques();
  }

  const deleteCheque = useCallback(async (chequeId) => {
    setDeletingId(chequeId);
    setError(null);
    try {
      const res = await apiDeleteCheque(chequeId);
      if (!res?.success) throw new Error(res?.message || 'خطا در حذف چک');
      setCheques((prev) => prev.filter((c) => c.id !== chequeId));
    } catch (err) {
      setError(err.message || 'خطا در حذف چک');
      throw err;
    } finally {
      setDeletingId(null);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    cheques,
    vaultLocked,
    loadingCheques,
    submitting,
    deletingId,
    error,
    clearError,
    fetchCheques,
    saveCheque,
    changeStatus,
    restoreCheque,
    deleteCheque,
  };
}
