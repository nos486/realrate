/**
 * useIncomes.js — Hook for loading the user's incomes and CRUD operations
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../auth/index.js';
import {
  getIncomes,
  createIncome as apiCreateIncome,
  updateIncome as apiUpdateIncome,
  deleteIncome as apiDeleteIncome,
} from '../api/incomeApi.js';

/** Newest income date first; ties broken by creation time — mirrors the API ordering */
const byNewest = (a, b) =>
  String(b.incomeDate).localeCompare(String(a.incomeDate)) ||
  String(b.createdAt || '').localeCompare(String(a.createdAt || ''));

export function useIncomes() {
  const { user } = useAuth();
  const [incomes, setIncomes] = useState([]);
  const [loadingIncomes, setLoadingIncomes] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);

  const fetchIncomes = useCallback(async () => {
    if (!user) {
      setIncomes([]);
      setLoadingIncomes(false);
      return;
    }

    try {
      setLoadingIncomes(true);
      setError(null);
      const res = await getIncomes();
      setIncomes(Array.isArray(res?.incomes) ? res.incomes : []);
    } catch (err) {
      setError(err.message || 'خطا در بارگذاری لیست درآمدها');
      setIncomes([]);
    } finally {
      setLoadingIncomes(false);
    }
  }, [user]);

  useEffect(() => {
    fetchIncomes();
  }, [fetchIncomes]);

  /**
   * Create or update an income depending on whether `incomeId` is given.
   * Errors are re-thrown (not stored in `error`) so the open form can show them inline.
   * @param {object} incomeData
   * @param {string|null} [incomeId]
   * @returns {Promise<object>} The saved income
   */
  const saveIncome = useCallback(async (incomeData, incomeId = null) => {
    setSubmitting(true);
    try {
      const res = incomeId
        ? await apiUpdateIncome(incomeId, incomeData)
        : await apiCreateIncome(incomeData);
      if (!res?.success || !res.income) {
        throw new Error(res?.message || 'خطا در ذخیره درآمد');
      }
      setIncomes((prev) =>
        [...prev.filter((i) => i.id !== res.income.id), res.income].sort(byNewest)
      );
      return res.income;
    } finally {
      setSubmitting(false);
    }
  }, []);

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
      setIncomes((prev) => prev.filter((i) => i.id !== incomeId));
    } catch (err) {
      setError(err.message || 'خطا در حذف درآمد');
      throw err;
    } finally {
      setDeletingId(null);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    incomes,
    loadingIncomes,
    submitting,
    deletingId,
    error,
    clearError,
    fetchIncomes,
    saveIncome,
    deleteIncome,
  };
}
