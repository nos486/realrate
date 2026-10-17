/**
 * useLoans.js — Hook for managing user loans list and CRUD operations
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { t } from '../../../utils/i18n.js';
import { useRefreshHandler } from '../../../shared/refresh/pageRefresh.js';
import { useAuth } from '../../auth/index.js';
import { useVault } from '../../../shared/vault/useVault.js';
import {
  getLoans,
  createLoan as apiCreateLoan,
  updateLoan as apiUpdateLoan,
  deleteLoan as apiDeleteLoan,
  getLoanExtraPayments as apiGetLoanExtraPayments,
} from '../api/loanApi.js';
import { useFeature } from '../../../shared/features/useFeature.js';
import { isDemoReadOnly } from '../../demo/index.js';
import { removeLoanPayments, renameLoanPayments } from '../../../shared/vault/spendingRecords.js';

export function useLoans() {
  const { user } = useAuth();
  // With account-wide encryption on, data is only readable once the vault is unlocked
  const { status: vaultStatus, epoch: vaultEpoch } = useVault();
  const vaultLocked = vaultStatus === 'locked';
  const [loans, setLoans] = useState([]);
  const [loadingLoans, setLoadingLoans] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  // Its payments are in the expenses (not without the expenses, nor in the read-only demo)
  const recordsSpending = useFeature('expenses') && !isDemoReadOnly();
  // The list as last read: a rename needs the title before the edit
  const loansRef = useRef([]);
  loansRef.current = loans;

  /**
   * Fetch all user loans with aggregate metadata
   */
  const fetchLoans = useCallback(async () => {
    if (!user || vaultLocked) {
      setLoans([]);
      setLoadingLoans(false);
      return;
    }

    try {
      setLoadingLoans(true);
      setError(null);
      const res = await getLoans();
      if (res && res.success && Array.isArray(res.loans)) {
        setLoans(res.loans);
      } else {
        setLoans([]);
      }
    } catch (err) {
      setError(err.message || t('خطا در بارگذاری لیست وام‌ها'));
      setLoans([]);
    } finally {
      setLoadingLoans(false);
    }
    // vaultEpoch: reload after unlocking or migrating
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, vaultLocked, vaultEpoch]);

  // Initial fetch on mount or auth change
  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);
  // The open tab's refresh (header button, window focus) reads them again
  useRefreshHandler('loans', fetchLoans);

  /**
   * Create a new loan (supports atomic customFirstInstallmentAmount)
   * @param {object} loanData
   * @returns {Promise<object>} Created loan
   */
  const addLoan = useCallback(
    async (loanData) => {
      setSubmitting(true);
      setError(null);
      try {
        const res = await apiCreateLoan(loanData);
        if (res?.success && res.loan) {
          await fetchLoans();
          return res.loan;
        }
        throw new Error(res?.message || t('خطا در ایجاد وام'));
      } catch (err) {
        setError(err.message || t('خطا در ایجاد وام'));
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [fetchLoans]
  );

  /**
   * Update an existing loan
   * @param {string} loanId
   * @param {object} loanData
   * @returns {Promise<object>} Updated loan
   */
  const updateLoan = useCallback(
    async (loanId, loanData) => {
      setSubmitting(true);
      setError(null);
      try {
        const before = recordsSpending ? loansRef.current.find((l) => l.id === loanId) : null;
        const res = await apiUpdateLoan(loanId, loanData);
        if (res?.success && res.loan) {
          // The expenses it recorded carry its name
          if (before && before.title !== res.loan.title) {
            const extraPaymentIds = await apiGetLoanExtraPayments(loanId).then((r) => (r?.extraPayments || []).map((p) => p.id)).catch(() => []);
            await renameLoanPayments(loanId, before.title, res.loan.title, extraPaymentIds).catch((err) => console.warn('[loans] renaming its expenses failed:', err?.message || err));
          }
          await fetchLoans();
          return res.loan;
        }
        throw new Error(res?.message || t('خطا در ویرایش وام'));
      } catch (err) {
        setError(err.message || t('خطا در ویرایش وام'));
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [fetchLoans, recordsSpending]
  );

  /**
   * Delete a loan
   * @param {string} loanId
   * @returns {Promise<boolean>}
   */
  const deleteLoan = useCallback(async (loanId) => {
    setSubmitting(true);
    setError(null);
    try {
      // The extra payments can't be read once the loan is gone
      const extraPaymentIds = recordsSpending
        ? await apiGetLoanExtraPayments(loanId).then((r) => (r?.extraPayments || []).map((p) => p.id)).catch(() => [])
        : [];
      const res = await apiDeleteLoan(loanId);
      if (res?.success) {
        setLoans((prev) => prev.filter((l) => l.id !== loanId));
        // Its expenses go with it; a failure there never undoes the deletion
        if (recordsSpending) {
          await removeLoanPayments(loanId, extraPaymentIds).catch((err) => {
            setError(t('وام حذف شد، ولی هزینه‌هایش پاک نشد: {reason}', { reason: err?.message || '' }).trim());
          });
        }
        return true;
      }
      throw new Error(res?.message || t('خطا در حذف وام'));
    } catch (err) {
      setError(err.message || t('خطا در حذف وام'));
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, [recordsSpending]);

  return {
    loans,
    vaultLocked,
    loadingLoans,
    submitting,
    error,
    fetchLoans,
    addLoan,
    updateLoan,
    deleteLoan,
  };
}
