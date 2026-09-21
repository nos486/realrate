/**
 * useLoanDetail.js — Hook for single loan detail inspection and installment payments
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getLoanDetail,
  markInstallmentPaid as apiMarkPaid,
  unmarkInstallmentPaid as apiUnmarkPaid,
  setInstallmentAmount as apiSetInstallmentAmount,
} from '../api/loanApi.js';

export function useLoanDetail(loanId) {
  const [loan, setLoan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Fetch loan details and all its installments
   */
  const fetchLoan = useCallback(async () => {
    if (!loanId) {
      setLoan(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await getLoanDetail(loanId);
      if (res?.success && res.loan) {
        setLoan(res.loan);
      } else {
        setLoan(null);
      }
    } catch (err) {
      setError(err.message || 'خطا در بارگذاری جزئیات وام');
      setLoan(null);
    } finally {
      setLoading(false);
    }
  }, [loanId]);

  useEffect(() => {
    fetchLoan();
  }, [fetchLoan]);

  /**
   * Mark an installment as paid with optimistic UI update and server synchronization
   * @param {string} installmentId
   * @param {object} [details={}]
   * @param {string} [details.paidDate]
   * @param {number} [details.paidAmount]
   */
  const markPaid = useCallback(
    async (installmentId, details = {}) => {
      if (!loanId || !installmentId) return;

      setSubmitting(true);
      setError(null);

      // Optimistic update
      const prevLoan = loan;
      setLoan((curr) => {
        if (!curr || !Array.isArray(curr.installments)) return curr;
        return {
          ...curr,
          installments: curr.installments.map((inst) =>
            inst.id === installmentId
              ? {
                  ...inst,
                  isPaid: true,
                  paidDate: details.paidDate || new Date().toISOString().split('T')[0],
                  paidAmount: details.paidAmount ?? inst.totalAmount,
                }
              : inst
          ),
        };
      });

      try {
        await apiMarkPaid(loanId, installmentId, details);
        // Refresh to guarantee full server synchronization
        await fetchLoan();
      } catch (err) {
        // Rollback on error
        setLoan(prevLoan);
        setError(err.message || 'خطا در ثبت پرداخت قسط');
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [loanId, loan, fetchLoan]
  );

  /**
   * Reset an installment to unpaid with optimistic UI update
   * @param {string} installmentId
   */
  const unmarkPaid = useCallback(
    async (installmentId) => {
      if (!loanId || !installmentId) return;

      setSubmitting(true);
      setError(null);

      // Optimistic update
      const prevLoan = loan;
      setLoan((curr) => {
        if (!curr || !Array.isArray(curr.installments)) return curr;
        return {
          ...curr,
          installments: curr.installments.map((inst) =>
            inst.id === installmentId
              ? {
                  ...inst,
                  isPaid: false,
                  paidDate: '',
                  paidAmount: 0,
                }
              : inst
          ),
        };
      });

      try {
        await apiUnmarkPaid(loanId, installmentId);
        // Refresh to guarantee full server synchronization
        await fetchLoan();
      } catch (err) {
        // Rollback on error
        setLoan(prevLoan);
        setError(err.message || 'خطا در لغو پرداخت قسط');
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [loanId, loan, fetchLoan]
  );

  /**
   * Manually override a specific unpaid installment amount
   * Automatically refetches the loan details because subsequent installments are recalculated.
   * @param {string} installmentId
   * @param {number} newAmount
   * @returns {Promise<object>}
   */
  const setInstallmentAmount = useCallback(
    async (installmentId, newAmount) => {
      if (!loanId || !installmentId) return;

      setSubmitting(true);
      setError(null);

      try {
        const res = await apiSetInstallmentAmount(loanId, installmentId, newAmount);
        // Refetch whole loan details because all subsequent installments were recalculated
        await fetchLoan();
        return res;
      } catch (err) {
        setError(err.message || 'خطا در ویرایش مبلغ قسط');
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [loanId, fetchLoan]
  );

  return {
    loan,
    loading,
    submitting,
    error,
    fetchLoan,
    markPaid,
    unmarkPaid,
    setInstallmentAmount,
  };
}
