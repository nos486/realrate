/**
 * useDailyExpenses.js — Everyday expenses of the Shamsi year of the month shown (and the month
 * before that year, so Farvardin has a month to compare with) — or just the month and the one
 * before (`year: false`) — and every change to them
 *
 * One download per window (the server filters the daily section's records by date): with the
 * year loaded, switching months inside it fetches nothing. `expenses` / `previousExpenses` are the month shown and
 * the one before; `yearExpenses` everything loaded, for the yearly report and the charts.
 * The daily section itself is created on the first everyday expense.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../auth/index.js';
import { useVault } from '../../../shared/vault/useVault.js';
import { compareExpensesByDate, shamsiMonthRange, shiftShamsiMonth } from '../../../utils/expenseDocument.js';
import { flowWindow } from '../../../shared/flow/flowYear.js';
import * as api from '../../../shared/vault/vaultExpenses.js';

const inRange = (e, { from, to }) => e.date >= from && e.date <= to;

/**
 * @param {{ jy: number, jm: number }} month the Shamsi month shown
 * @param {{ enabled?: boolean, year?: boolean }} [options] enabled: nothing loads when false (a
 *   page without the feature); year: load the month's whole Shamsi year (the expenses page) —
 *   otherwise only the month and the one before
 */
export function useDailyExpenses(month, { enabled = true, year = false } = {}) {
  const { user } = useAuth();
  const { status: vaultStatus, epoch: vaultEpoch } = useVault();
  const vaultLocked = vaultStatus === 'locked';
  const [dailyGroup, setDailyGroup] = useState(null);
  const [expenses, setExpenses] = useState([]); // the year and the month before it
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);
  // Only the latest request's answer counts (months switched quickly answer out of order)
  const requestRef = useRef(0);
  const expensesRef = useRef([]);
  expensesRef.current = expenses;

  const range = useMemo(() => shamsiMonthRange(month.jy, month.jm), [month.jy, month.jm]);
  const prevRange = useMemo(() => {
    const prev = shiftShamsiMonth(month, -1);
    return shamsiMonthRange(prev.jy, prev.jm);
  }, [month]);
  const loadWindow = useMemo(
    () => (year ? flowWindow(month.jy) : { from: prevRange.from, to: range.to }),
    [year, month.jy, prevRange.from, range.to],
  );

  const fetchMonth = useCallback(async () => {
    const request = ++requestRef.current;
    const isLatest = () => request === requestRef.current;
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
      const res = group ? await api.getExpenses({ parent: group.id, from: loadWindow.from, to: loadWindow.to }) : { expenses: [] };
      if (!isLatest()) return;
      setDailyGroup(group);
      setExpenses(res.expenses);
    } catch (err) {
      if (isLatest()) setError(err.message || 'خطا در بارگذاری هزینه‌های روزمره');
    } finally {
      if (isLatest()) setLoading(false);
    }
    // vaultEpoch: reload after unlocking
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, vaultLocked, enabled, vaultEpoch, loadWindow.from, loadWindow.to]);

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
      // Kept only when it falls in the window loaded
      setExpenses((prev) => {
        const rest = prev.filter((e) => e.id !== expense.id);
        return inRange(expense, loadWindow)
          ? [...rest, expense].sort(compareExpensesByDate)
          : rest;
      });
      return expense;
    } finally {
      setSubmitting(false);
    }
  }, [dailyGroup, loadWindow]);

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
      // The stored copy: an expense paid from a portfolio removes its transaction too
      await api.deleteExpense(expenseId, expensesRef.current.find((e) => e.id === expenseId) || null);
      setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
    } catch (err) {
      setError(err.message || 'خطا در حذف هزینه');
      throw err;
    } finally {
      setDeletingId(null);
    }
  }, []);

  const monthExpenses = useMemo(() => expenses.filter((e) => inRange(e, range)), [expenses, range]);
  const previousExpenses = useMemo(() => expenses.filter((e) => inRange(e, prevRange)), [expenses, prevRange]);

  return {
    expenses: monthExpenses,
    previousExpenses,
    yearExpenses: expenses,
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
