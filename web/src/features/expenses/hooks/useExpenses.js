/**
 * useExpenses.js — The user's expense sections and expenses, and every change to them
 *
 * Everything is an encrypted vault record (shared/vault/vaultExpenses.js), so nothing loads
 * while the vault is locked. Sections and expenses are loaded once and kept in state; totals are
 * computed from them in the page.
 */

import { useState, useEffect, useCallback } from 'react';
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
      const [g, e] = await Promise.all([api.getExpenseGroups(), api.getExpenses()]);
      setGroups(g.groups);
      setExpenses(e.expenses);
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

  const deleteExpense = useCallback((expenseId) => remove(expenseId, () => api.deleteExpense(expenseId), () => {
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
