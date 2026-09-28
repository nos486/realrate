/**
 * useDailyExpenses.js — Everyday expenses of one Shamsi month (and the month before, for the
 * comparison), and every change to them
 *
 * Only the two months are downloaded (the server filters the daily section's records by date).
 * The daily section itself is created on the first everyday expense.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../auth/index.js';
import { useVault } from '../../../shared/vault/useVault.js';
import { compareExpensesByDate, shamsiMonthRange, shiftShamsiMonth } from '../../../utils/expenseDocument.js';
import * as api from '../../../shared/vault/vaultExpenses.js';

const inRange = (e, { from, to }) => e.date >= from && e.date <= to;

/**
 * @param {{ jy: number, jm: number }} month the Shamsi month shown
 * @param {{ enabled?: boolean }} [options] nothing loads when false (a page without the feature)
 */
export function useDailyExpenses(month, { enabled = true } = {}) {
  const { user } = useAuth();
  const { status: vaultStatus, epoch: vaultEpoch } = useVault();
  const vaultLocked = vaultStatus === 'locked';
  const [dailyGroup, setDailyGroup] = useState(null);
  const [expenses, setExpenses] = useState([]); // this month and the previous one
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);

  const range = shamsiMonthRange(month.jy, month.jm);
  const prev = shiftShamsiMonth(month, -1);
  const prevRange = shamsiMonthRange(prev.jy, prev.jm);

  const fetchMonth = useCallback(async () => {
    if (!user || vaultLocked || !enabled) {
      setExpenses([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const { groups } = await api.getExpenseGroups();
      const group = groups.find((g) => g.type === 'daily') || null;
      setDailyGroup(group);
      const res = group ? await api.getExpenses({ parent: group.id, from: prevRange.from, to: range.to }) : { expenses: [] };
      setExpenses(res.expenses);
    } catch (err) {
      setError(err.message || 'خطا در بارگذاری هزینه‌های روزمره');
    } finally {
      setLoading(false);
    }
    // vaultEpoch: reload after unlocking
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, vaultLocked, enabled, vaultEpoch, range.to, prevRange.from]);

  useEffect(() => {
    fetchMonth();
  }, [fetchMonth]);

  /** Create or update an everyday expense; errors are re-thrown for the open form */
  const saveExpense = useCallback(async (input, existing = null) => {
    setSubmitting(true);
    try {
      const group = dailyGroup || await api.ensureDailyGroup((await api.getExpenseGroups()).groups);
      setDailyGroup(group);
      const { expense } = await api.saveExpense({ ...input, groupId: group.id }, existing);
      // Kept only when it falls in the two months loaded
      setExpenses((prev) => {
        const rest = prev.filter((e) => e.id !== expense.id);
        return inRange(expense, { from: prevRange.from, to: range.to })
          ? [...rest, expense].sort(compareExpensesByDate)
          : rest;
      });
      return expense;
    } finally {
      setSubmitting(false);
    }
  }, [dailyGroup, prevRange.from, range.to]);

  /** Set the monthly budgets (per category and `total`); creates the daily section if needed */
  const saveBudgets = useCallback(async (budgets) => {
    setSubmitting(true);
    try {
      const group = dailyGroup || await api.ensureDailyGroup((await api.getExpenseGroups()).groups);
      const { group: saved } = await api.saveExpenseGroup({ budgets }, group);
      setDailyGroup(saved);
      return saved;
    } finally {
      setSubmitting(false);
    }
  }, [dailyGroup]);

  const deleteExpense = useCallback(async (expenseId) => {
    setDeletingId(expenseId);
    setError(null);
    try {
      await api.deleteExpense(expenseId);
      setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
    } catch (err) {
      setError(err.message || 'خطا در حذف هزینه');
      throw err;
    } finally {
      setDeletingId(null);
    }
  }, []);

  return {
    expenses: expenses.filter((e) => inRange(e, range)),
    previousExpenses: expenses.filter((e) => inRange(e, prevRange)),
    range,
    budgets: dailyGroup?.budgets || {},
    vaultLocked,
    loading,
    submitting,
    deletingId,
    error,
    clearError: useCallback(() => setError(null), []),
    fetchMonth,
    saveExpense,
    saveBudgets,
    deleteExpense,
  };
}
