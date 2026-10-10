/**
 * useDailyExpenses.js — Everyday expenses of the Shamsi year of the month shown (and the month
 * before that year, so Farvardin has a month to compare with) — or just the month and the one
 * before (`year: false`) — and every change to them
 *
 * One download per window (the server filters the expense records by date): with the year
 * loaded, switching months inside it fetches nothing. `expenses` / `previousExpenses` are the
 * month shown and the one before; `yearExpenses` everything loaded, for the yearly report and the
 * charts — the everyday ones only. All spending is in the expenses: the projects' expenses come in
 * the same download (`projectExpenses` for the month, `yearProjectExpenses`), shown in the list
 * but counted only in their project. An expense is saved where its form put it (`groupId`: a
 * project, or '' for the everyday expenses), so one saved here may be a project's — or move
 * between the two. The daily section itself is created on the first everyday expense.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRefreshHandler } from '../../../shared/refresh/pageRefresh.js';
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
  // The other sections (projects), read in the same request: where expenses can be moved
  const [projects, setProjects] = useState([]);
  const [expenses, setExpenses] = useState([]); // the year and the month before it
  const [projectItems, setProjectItems] = useState([]); // the projects' expenses in the same window
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);
  // Only the latest request's answer counts (months switched quickly answer out of order)
  const requestRef = useRef(0);
  const expensesRef = useRef([]);
  expensesRef.current = expenses;
  const projectItemsRef = useRef([]);
  projectItemsRef.current = projectItems;

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
      // Every section's expenses in the window: the everyday ones, and the projects' (counted apart)
      const res = await api.getExpenses({ from: loadWindow.from, to: loadWindow.to });
      if (!isLatest()) return;
      setDailyGroup(group);
      setProjects(groups.filter((g) => g.type !== 'daily'));
      setExpenses(res.expenses.filter((e) => group && e.groupId === group.id));
      const projectIds = new Set(groups.filter((g) => g.type !== 'daily').map((g) => g.id));
      setProjectItems(res.expenses.filter((e) => projectIds.has(e.groupId)));
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
  // The open tab's refresh (header button, window focus) reads them again
  useRefreshHandler('expenses', fetchMonth);

  /**
   * Create or update an expense — an everyday one, or a project's (`groupId`); errors are
   * re-thrown for the open form
   */
  const saveExpense = useCallback(async (input, existing = null) => {
    setSubmitting(true);
    try {
      // Its section: the one asked for, else the one it is in, else the everyday expenses
      const wanted = 'groupId' in input ? input.groupId : existing?.groupId;
      const group = wanted ? null : dailyGroup || await api.ensureDailyGroup((await api.getExpenseGroups()).groups);
      if (group) setDailyGroup(group);
      const { expense } = await api.saveExpense({ ...input, groupId: wanted || group.id }, existing);
      // In its list (the everyday expenses, or the projects'), when it falls in the window loaded
      const place = (prev, mine) => {
        const rest = prev.filter((e) => e.id !== expense.id);
        return mine && inRange(expense, loadWindow) ? [...rest, expense].sort(compareExpensesByDate) : rest;
      };
      const isProjects = projects.some((p) => p.id === expense.groupId);
      setExpenses((prev) => place(prev, !isProjects));
      setProjectItems((prev) => place(prev, isProjects));
      return expense;
    } finally {
      setSubmitting(false);
    }
  }, [dailyGroup, loadWindow, projects]);

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
      // The stored copy (an everyday one or a project's): one paid from a portfolio removes its
      // transaction too
      const stored = [...expensesRef.current, ...projectItemsRef.current].find((e) => e.id === expenseId) || null;
      await api.deleteExpense(expenseId, stored);
      setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
      setProjectItems((prev) => prev.filter((e) => e.id !== expenseId));
    } catch (err) {
      setError(err.message || 'خطا در حذف هزینه');
      throw err;
    } finally {
      setDeletingId(null);
    }
  }, []);

  /**
   * Move expenses into a project (an existing one by id, or a new one `{ name }`): they leave the
   * everyday expenses — one request per 100 expenses, plus one for a new project
   * @returns {Promise<{ group: object, moved: number }>}
   */
  const moveToProject = useCallback(async (ids, target) => {
    setSubmitting(true);
    setError(null);
    try {
      const group = typeof target === 'string'
        ? projects.find((g) => g.id === target)
        : (await api.saveExpenseGroup({ name: target?.name, type: 'project' })).group;
      if (!group) throw new Error('پروژه پیدا نشد.');
      if (typeof target !== 'string') setProjects((prev) => [...prev, group]);
      const wanted = new Set(ids);
      const moved = await api.moveExpenses(expensesRef.current.filter((e) => wanted.has(e.id)), group.id);
      const gone = new Set(moved.map((e) => e.id));
      setExpenses((prev) => prev.filter((e) => !gone.has(e.id)));
      // Still in the list, now as the project's
      setProjectItems((prev) => [...prev.filter((e) => !gone.has(e.id)), ...moved]);
      return { group, moved: moved.length };
    } finally {
      setSubmitting(false);
    }
  }, [projects]);

  const monthExpenses = useMemo(() => expenses.filter((e) => inRange(e, range)), [expenses, range]);
  const previousExpenses = useMemo(() => expenses.filter((e) => inRange(e, prevRange)), [expenses, prevRange]);
  const projectExpenses = useMemo(() => projectItems.filter((e) => inRange(e, range)), [projectItems, range]);

  return {
    expenses: monthExpenses,
    previousExpenses,
    yearExpenses: expenses,
    projectExpenses,
    yearProjectExpenses: projectItems,
    range,
    budgets: dailyGroup?.budgets || {},
    projects,
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
    moveToProject,
  };
}
