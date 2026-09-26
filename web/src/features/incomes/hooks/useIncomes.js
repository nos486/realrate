/**
 * useIncomes.js — The user's incomes by period, a page at a time, and their CRUD operations
 *
 * Only a date window is ever fetched (the server filters on each income's plaintext date):
 * - the list: one page of the chosen period, sorted by date on the server;
 * - the sidebar: the whole period (amounts are encrypted, so totals and the monthly chart are
 *   built in the browser) — never more than the period.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../auth/index.js';
import { useVault } from '../../../shared/vault/useVault.js';
import {
  getIncomes,
  createIncome as apiCreateIncome,
  updateIncome as apiUpdateIncome,
  deleteIncome as apiDeleteIncome,
} from '../api/incomeApi.js';
import {
  getRecurringIncomes,
  createRecurringIncome,
  updateRecurringIncome,
  deleteRecurringIncome as apiDeleteRecurring,
} from '../api/recurringIncomeApi.js';
import { syncRecurringIncomes, ruleInput } from '../utils/recurringSync.js';
import { dueOccurrences } from '../../../utils/recurringIncome.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { DEFAULT_RECENT_PERIOD, periodFrom } from '../../../shared/utils/recentPeriods.js';

const SILENT = { silent: true };
export const INCOMES_PAGE_SIZE = 10;

export function useIncomes() {
  const { user } = useAuth();
  // With account-wide encryption on, data is only readable once the vault is unlocked
  const { status: vaultStatus, epoch: vaultEpoch } = useVault();
  const vaultLocked = vaultStatus === 'locked';
  const ready = Boolean(user) && !vaultLocked;

  const [period, setPeriodState] = useState(DEFAULT_RECENT_PERIOD);
  const [order, setOrderState] = useState('desc');
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);

  // Each result is tagged with the request it answers, so loading is derived, not stored
  const [pageData, setPageData] = useState({ key: null, incomes: [], total: 0 });
  const [windowData, setWindowData] = useState({ key: null, incomes: [] });
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);
  const [recurringRules, setRecurringRules] = useState([]);
  const [recurringError, setRecurringError] = useState(null);
  const syncingRef = useRef(false);

  const today = todayIso();
  const from = periodFrom(period, today);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);
  const setPeriod = useCallback((next) => {
    setPeriodState(next);
    setPage(1);
  }, []);
  const setOrder = useCallback((next) => {
    setOrderState(next);
    setPage(1);
  }, []);

  // One page of the list (vaultEpoch: reload after unlocking or migrating)
  const pageKey = `${from}|${order}|${page}|${reloadToken}|${vaultEpoch}`;
  useEffect(() => {
    if (!ready) return undefined;
    let active = true;
    getIncomes({ from, order, limit: INCOMES_PAGE_SIZE, offset: (page - 1) * INCOMES_PAGE_SIZE })
      .then((res) => {
        if (!active) return;
        const total = Number(res?.total) || 0;
        // A delete can leave the last page empty: step back to the new last page
        const lastPage = Math.max(1, Math.ceil(total / INCOMES_PAGE_SIZE));
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setPageData({ key: pageKey, incomes: Array.isArray(res?.incomes) ? res.incomes : [], total });
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setPageData((prev) => ({ ...prev, key: pageKey }));
        setError(err.message || 'خطا در بارگذاری لیست درآمدها');
      });
    return () => {
      active = false;
    };
    // `pageKey` is derived from exactly these values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pageKey]);

  // The whole period, for the sidebar (report + monthly chart) and search
  const windowKey = `${from}|${reloadToken}|${vaultEpoch}`;
  useEffect(() => {
    if (!ready) return undefined;
    let active = true;
    getIncomes({ from })
      .then((res) => {
        if (active) setWindowData({ key: windowKey, incomes: Array.isArray(res?.incomes) ? res.incomes : [] });
      })
      .catch((err) => {
        if (!active) return;
        setWindowData((prev) => ({ ...prev, key: windowKey }));
        setError(err.message || 'خطا در بارگذاری گزارش درآمدها');
      });
    return () => {
      active = false;
    };
    // `windowKey` is derived from exactly these values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, windowKey]);

  const loadingIncomes = ready && pageData.key !== pageKey;
  const loadingWindow = ready && windowData.key !== windowKey;

  /**
   * Create the entries fixed incomes owe up to today (one run at a time). Only the incomes since
   * the earliest date still due are read, to skip entries that already exist.
   */
  const runRecurringSync = useCallback(async (rules) => {
    if (syncingRef.current || rules.length === 0) return;
    const todayDate = todayIso();
    const firstDue = rules
      .map((rule) => dueOccurrences(rule, todayDate)[0])
      .filter(Boolean)
      .sort()[0];
    if (!firstDue) return;
    syncingRef.current = true;
    try {
      const base = await getIncomes({ from: firstDue });
      const { created, rules: nextRules, errors } = await syncRecurringIncomes({
        rules,
        incomes: Array.isArray(base?.incomes) ? base.incomes : [],
        today: todayDate,
        createIncome: (data) => apiCreateIncome(data, SILENT),
        updateRule: (ruleId, data) => updateRecurringIncome(ruleId, data, SILENT),
      });
      // Merge by id: a sync may cover only some rules (e.g. the one just saved)
      setRecurringRules((prev) => {
        const byId = new Map(prev.map((r) => [r.id, r]));
        for (const rule of nextRules) byId.set(rule.id, rule);
        return [...byId.values()];
      });
      if (created.length > 0) reload();
      setRecurringError(errors.length ? `ثبت خودکار درآمد ثابت: ${errors.join('، ')}` : null);
    } catch (err) {
      setRecurringError(`ثبت خودکار درآمد ثابت: ${err.message || 'ناموفق بود'}`);
    } finally {
      syncingRef.current = false;
    }
  }, [reload]);

  // Fixed incomes: loaded once per account / unlock; the list still loads if they cannot
  useEffect(() => {
    if (!ready) return undefined;
    let active = true;
    getRecurringIncomes()
      .then((res) => {
        if (!active) return;
        const rules = Array.isArray(res?.rules) ? res.rules : [];
        setRecurringRules(rules);
        runRecurringSync(rules);
      })
      .catch((err) => {
        if (active) setRecurringError(err.message || 'خطا در دریافت درآمدهای ثابت');
      });
    return () => {
      active = false;
    };
  }, [ready, vaultEpoch, runRecurringSync]);

  /**
   * Create or update a fixed income, then add whatever it already owes (e.g. this month).
   * Errors are re-thrown so the open form can show them.
   */
  const saveRecurring = useCallback(async (data, ruleId = null) => {
    setSubmitting(true);
    try {
      const res = ruleId ? await updateRecurringIncome(ruleId, data) : await createRecurringIncome(data);
      if (!res?.rule) throw new Error(res?.message || 'خطا در ذخیره درآمد ثابت');
      setRecurringRules((prev) => [...prev.filter((r) => r.id !== res.rule.id), res.rule]);
      await runRecurringSync([res.rule]);
      return res.rule;
    } finally {
      setSubmitting(false);
    }
  }, [runRecurringSync]);

  /** Pause / resume a fixed income (a resumed rule catches up on the periods it missed) */
  const toggleRecurring = useCallback(async (rule) => {
    const res = await updateRecurringIncome(rule.id, { ...ruleInput(rule), active: !rule.active });
    setRecurringRules((prev) => prev.map((r) => (r.id === rule.id ? res.rule : r)));
    if (res.rule.active) await runRecurringSync([res.rule]);
  }, [runRecurringSync]);

  /** Delete a fixed income; entries it already created stay */
  const deleteRecurring = useCallback(async (ruleId) => {
    await apiDeleteRecurring(ruleId);
    setRecurringRules((prev) => prev.filter((r) => r.id !== ruleId));
  }, []);

  /**
   * Create or update an income depending on whether `incomeId` is given, then reload the page
   * and the period. Errors are re-thrown (not stored in `error`) so the open form can show them.
   * @param {object} incomeData
   * @param {string|null} [incomeId]
   * @param {{ reload?: boolean }} [options] reload: false while importing many at once
   * @returns {Promise<object>} The saved income
   */
  const saveIncome = useCallback(async (incomeData, incomeId = null, { reload: shouldReload = true } = {}) => {
    setSubmitting(true);
    try {
      const res = incomeId
        ? await apiUpdateIncome(incomeId, incomeData)
        : await apiCreateIncome(incomeData);
      if (!res?.success || !res.income) {
        throw new Error(res?.message || 'خطا در ذخیره درآمد');
      }
      if (shouldReload) reload();
      return res.income;
    } finally {
      setSubmitting(false);
    }
  }, [reload]);

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
      reload();
    } catch (err) {
      setError(err.message || 'خطا در حذف درآمد');
      throw err;
    } finally {
      setDeletingId(null);
    }
  }, [reload]);

  /** Every income, for the CSV export */
  const loadAllIncomes = useCallback(async () => {
    const res = await getIncomes();
    return Array.isArray(res?.incomes) ? res.incomes : [];
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    // The list: one page of the period
    incomes: ready ? pageData.incomes : [],
    total: ready ? pageData.total : 0,
    page,
    setPage,
    pageSize: INCOMES_PAGE_SIZE,
    period,
    setPeriod,
    periodStart: from,
    order,
    setOrder,
    // The whole period
    windowIncomes: ready ? windowData.incomes : [],
    loadingWindow,
    vaultLocked,
    loadingIncomes,
    submitting,
    deletingId,
    error,
    clearError,
    fetchIncomes: reload,
    loadAllIncomes,
    saveIncome,
    deleteIncome,
    recurringRules: ready ? recurringRules : [],
    recurringError,
    clearRecurringError: () => setRecurringError(null),
    saveRecurring,
    toggleRecurring,
    deleteRecurring,
  };
}
