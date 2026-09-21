/**
 * useLoans.js — Hook for managing user loans list and CRUD operations
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../auth/index.js';
import {
  getLoans,
  createLoan as apiCreateLoan,
  updateLoan as apiUpdateLoan,
  deleteLoan as apiDeleteLoan,
} from '../api/loanApi.js';

export function useLoans() {
  const { user } = useAuth();
  const [loans, setLoans] = useState([]);
  const [loadingLoans, setLoadingLoans] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Fetch all user loans with aggregate metadata
   */
  const fetchLoans = useCallback(async () => {
    if (!user) {
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
      setError(err.message || 'خطا در بارگذاری لیست وام‌ها');
      setLoans([]);
    } finally {
      setLoadingLoans(false);
    }
  }, [user]);

  // Initial fetch on mount or auth change
  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

  /**
   * Create a new loan
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
        throw new Error(res?.message || 'خطا در ایجاد وام');
      } catch (err) {
        setError(err.message || 'خطا در ایجاد وام');
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
        const res = await apiUpdateLoan(loanId, loanData);
        if (res?.success && res.loan) {
          await fetchLoans();
          return res.loan;
        }
        throw new Error(res?.message || 'خطا در ویرایش وام');
      } catch (err) {
        setError(err.message || 'خطا در ویرایش وام');
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [fetchLoans]
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
      const res = await apiDeleteLoan(loanId);
      if (res?.success) {
        setLoans((prev) => prev.filter((l) => l.id !== loanId));
        return true;
      }
      throw new Error(res?.message || 'خطا در حذف وام');
    } catch (err) {
      setError(err.message || 'خطا در حذف وام');
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return {
    loans,
    loadingLoans,
    submitting,
    error,
    fetchLoans,
    addLoan,
    updateLoan,
    deleteLoan,
  };
}
