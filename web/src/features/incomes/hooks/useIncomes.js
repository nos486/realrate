/**
 * useIncomes.js — The user's incomes of a period, and their CRUD operations
 *
 * One query per period: the server filters on each income's plaintext date and returns only the
 * chosen window (a year by default). Amounts are encrypted, so the totals, the monthly chart
 * and the list's pages are all built in the browser from that one result — nothing is fetched
 * twice and nothing outside the period is fetched at all.
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
export const INCOMES_PAGE_SIZE = 20;

export function useIncomes() {
  const { user } = useAuth();
  // With account-wide encryption on, data is only readable once the vault is unlocked
  const { status: vaultStatus, epoch: vaultEpoch } = useVault();
  const vaultLocked = vaultStatus === 'locked';
  const ready = Boolean(user) && !vaultLocked;

  const [period, setPeriod] = useState(DEFAULT_RECENT_PERIOD);
  const [reloadToken, setReloadToken] = useState(0);

  // The result is tagged with the request it answers, so loading is derived, not stored
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

  // The whole period: the list, the report, the monthly chart and search all read it
  // (vaultEpoch: reload after unlocking or migrating)
  const windowKey = `${from}|${reloadToken}|${vaultEpoch}`;
  useEffect(() => {
    if (!ready) return undefined;
    let active = true;
    getIncomes({ from })
      .then((res) => {
        if (!active) return;
        setWindowData({ key: windowKey, incomes: Array.isArray(res?.incomes) ? res.incomes : [] });
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setWindowData((prev) => ({ ...prev, key: windowKey }));
        setError(err.message || 'خطا در بارگذاری لیست درآمدها');
      });
    return () => {
      active = false;
    };
    // `windowKey` is derived from exactly these values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, windowKey]);

  const loadingIncomes = ready && windowData.key !== windowKey;

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
   * Create or update an income depending on whether `incomeId` is given, then reload the period.
   * Errors are re-thrown (not stored in `error`) so the open form can show them.
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
    // Every income of the period (newest first, as the server sorts them)
    incomes: ready ? windowData.incomes : [],
    pageSize: INCOMES_PAGE_SIZE,
    period,
    setPeriod,
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
