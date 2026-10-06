/**
 * useExpenses.js — The user's project sections and their expenses, and every change to them
 *
 * Everything is an encrypted vault record (shared/vault/vaultExpenses.js), so nothing loads
 * while the vault is locked. The daily section is left out (useDailyExpenses loads it a month at
 * a time); each project's expenses are fetched by section, so everyday spending is never
 * downloaded here. Totals are computed from them in the view.
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import { useRefreshHandler } from '../../../shared/refresh/pageRefresh.js';
import { useAuth } from '../../auth/index.js';
import { useVault } from '../../../shared/vault/useVault.js';
import { compareExpensesByDate } from '../../../utils/expenseDocument.js';
import * as api from '../../../shared/vault/vaultExpenses.js';

export function useExpenses() {
  const { user } = useAuth();
  const { status: vaultStatus, epoch: vaultEpoch } = useVault();
  const vaultLocked = vaultStatus === 'locked';
  const [groups, setGroups] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const expensesRef = useRef([]);
  expensesRef.current = expenses;
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!user || vaultLocked) {
      setGroups([]);
      setExpenses([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const { groups: all } = await api.getExpenseGroups();
      const projects = all.filter((g) => g.type !== 'daily');
      const lists = await Promise.all(projects.map((g) => api.getExpenses({ parent: g.id })));
      setGroups(projects);
      setExpenses(lists.flatMap((res) => res.expenses).sort(compareExpensesByDate));
    } catch (err) {
      setError(err.message || 'خطا در بارگذاری هزینه‌ها');
    } finally {
      setLoading(false);
    }
    // vaultEpoch: reload after unlocking
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, vaultLocked, vaultEpoch]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);
  // The open tab's refresh (header button, window focus) reads them again
  useRefreshHandler('expenses', fetchAll);

  /** Errors are re-thrown so the open form can show them */
  const withSubmit = useCallback(async (fn) => {
    setSubmitting(true);
    try {
      return await fn();
    } finally {
      setSubmitting(false);
    }
  }, []);

  const saveGroup = useCallback((input, existing = null) => withSubmit(async () => {
    const { group } = await api.saveExpenseGroup(input, existing);
    setGroups((prev) => (existing ? prev.map((g) => (g.id === group.id ? group : g)) : [...prev, group]));
    return group;
  }), [withSubmit]);

  const saveExpense = useCallback((input, existing = null) => withSubmit(async () => {
    const { expense } = await api.saveExpense(input, existing);
    setExpenses((prev) => [...prev.filter((e) => e.id !== expense.id), expense].sort(compareExpensesByDate));
    return expense;
  }), [withSubmit]);

  const remove = useCallback(async (id, fn, onDone) => {
    setDeletingId(id);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (err) {
      setError(err.message || 'خطا در حذف');
      throw err;
    } finally {
      setDeletingId(null);
    }
  }, []);

  const deleteGroup = useCallback((groupId) => remove(groupId, () => api.deleteExpenseGroup(groupId), () => {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    setExpenses((prev) => prev.filter((e) => e.groupId !== groupId));
  }), [remove]);

  const deleteExpense = useCallback((expenseId) => remove(expenseId, () => api.deleteExpense(expenseId, expensesRef.current.find((e) => e.id === expenseId) || null), () => {
    setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
  }), [remove]);

  return {
    groups,
    expenses,
    vaultLocked,
    loading,
    submitting,
    deletingId,
    error,
    clearError: useCallback(() => setError(null), []),
    fetchAll,
    saveGroup,
    deleteGroup,
    saveExpense,
    deleteExpense,
  };
}
