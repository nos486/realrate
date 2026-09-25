/**
 * useLoanDetail.js — Hook for single loan detail inspection and installment payments
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getLoanDetail,
  markInstallmentPaid as apiMarkPaid,
  unmarkInstallmentPaid as apiUnmarkPaid,
  bulkDistributeInstallments as apiBulkDistributeInstallments,
  addLoanExtraPayment as apiAddLoanExtraPayment,
  getLoanExtraPayments as apiGetLoanExtraPayments,
} from '../api/loanApi.js';
import { todayIso } from '../../../shared/utils/dates.js';

export function useLoanDetail(loanId) {
  const [loan, setLoan] = useState(null);
  const [extraPayments, setExtraPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Fetch extra payments list
   */
  const fetchExtraPayments = useCallback(async () => {
    if (!loanId) {
      setExtraPayments([]);
      return;
    }
    try {
      const res = await apiGetLoanExtraPayments(loanId);
      if (res?.success && Array.isArray(res.extraPayments)) {
        setExtraPayments(res.extraPayments);
      } else {
        setExtraPayments([]);
      }
    } catch {
      setExtraPayments([]);
    }
  }, [loanId]);

  /**
   * Fetch loan details and all its installments
   */
  const fetchLoan = useCallback(async () => {
    if (!loanId) {
      setLoan(null);
      setExtraPayments([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const [loanRes] = await Promise.all([
        getLoanDetail(loanId),
        fetchExtraPayments(),
      ]);
      if (loanRes?.success && loanRes.loan) {
        setLoan(loanRes.loan);
      } else {
        setLoan(null);
      }
    } catch (err) {
      setError(err.message || 'خطا در بارگذاری جزئیات وام');
      setLoan(null);
    } finally {
      setLoading(false);
    }
  }, [loanId, fetchExtraPayments]);

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
                  paidDate: details.paidDate || todayIso(),
                  paidAmount: details.paidAmount ?? inst.totalAmount,
                }
              : inst
          ),
        };
      });

      try {
        const res = await apiMarkPaid(loanId, installmentId, details);
        // Refresh to guarantee full server synchronization
        await fetchLoan();
        return res;
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
   * Re-plan every pending installment's amount at once ("ویرایش گروهی اقساط")
   * @param {Object<number, number>} knownAmounts - installmentNumber -> totalAmount
   * @param {number} [totalRepaymentAmount] - the exact pool to divide (loan's current total)
   * @returns {Promise<object>}
   */
  const bulkDistributeInstallments = useCallback(
    async (knownAmounts, totalRepaymentAmount) => {
      if (!loanId) return;

      setSubmitting(true);
      setError(null);

      try {
        const res = await apiBulkDistributeInstallments(loanId, knownAmounts, totalRepaymentAmount);
        await fetchLoan();
        return res;
      } catch (err) {
        setError(err.message || 'خطا در ویرایش گروهی اقساط');
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [loanId, fetchLoan]
  );

  /**
   * Record extra payment
   * @param {object} paymentData
   * @returns {Promise<object>}
   */
  const addExtraPayment = useCallback(
    async (paymentData) => {
      if (!loanId) return;

      setSubmitting(true);
      setError(null);

      try {
        const res = await apiAddLoanExtraPayment(loanId, paymentData);
        await fetchLoan();
        return res;
      } catch (err) {
        setError(err.message || 'خطا در ثبت پرداخت اضافه');
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [loanId, fetchLoan]
  );

  return {
    loan,
    extraPayments,
    loading,
    submitting,
    error,
    fetchLoan,
    fetchExtraPayments,
    markPaid,
    unmarkPaid,
    bulkDistributeInstallments,
    addExtraPayment,
  };
}
