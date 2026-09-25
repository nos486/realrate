/**
 * useIncomes.js — Hook for loading the user's incomes and CRUD operations
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
import { todayIso } from '../../../shared/utils/dates.js';

const SILENT = { silent: true };

/** Newest income date first; ties broken by creation time — mirrors the API ordering */
const byNewest = (a, b) =>
  String(b.incomeDate).localeCompare(String(a.incomeDate)) ||
  String(b.createdAt || '').localeCompare(String(a.createdAt || ''));

export function useIncomes() {
  const { user } = useAuth();
  // With account-wide encryption on, data is only readable once the vault is unlocked
  const { status: vaultStatus, epoch: vaultEpoch } = useVault();
  const vaultLocked = vaultStatus === 'locked';
  const [incomes, setIncomes] = useState([]);
  const [loadingIncomes, setLoadingIncomes] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);
  const [recurringRules, setRecurringRules] = useState([]);
  const [recurringError, setRecurringError] = useState(null);
  const syncingRef = useRef(false);

  /**
   * Create the entries fixed incomes owe up to today. `baseIncomes` / `baseRules` are the lists
   * just loaded; one run at a time.
   */
  const runRecurringSync = useCallback(async (baseIncomes, baseRules) => {
    if (syncingRef.current || baseRules.length === 0) return;
    syncingRef.current = true;
    try {
      const { created, rules, errors } = await syncRecurringIncomes({
        rules: baseRules,
        incomes: baseIncomes,
        today: todayIso(),
        createIncome: (data) => apiCreateIncome(data, SILENT),
        updateRule: (ruleId, data) => updateRecurringIncome(ruleId, data, SILENT),
      });
      // Merge by id: a sync may cover only some rules (e.g. the one just saved)
      setRecurringRules((prev) => {
        const byId = new Map(prev.map((r) => [r.id, r]));
        for (const rule of rules) byId.set(rule.id, rule);
        return [...byId.values()];
      });
      if (created.length > 0) {
        setIncomes((prev) => [...prev.filter((i) => !created.some((c) => c.id === i.id)), ...created].sort(byNewest));
      }
      setRecurringError(errors.length ? `ثبت خودکار درآمد ثابت: ${errors.join('، ')}` : null);
    } finally {
      syncingRef.current = false;
    }
  }, []);

  const fetchIncomes = useCallback(async () => {
    if (!user || vaultLocked) {
      setIncomes([]);
      setLoadingIncomes(false);
      return;
    }

    try {
      setLoadingIncomes(true);
      setError(null);
      const [res, rulesRes] = await Promise.all([
        getIncomes(),
        // Fixed incomes are an addition: the list still loads if they cannot
        getRecurringIncomes().catch((err) => {
          setRecurringError(err.message || 'خطا در دریافت درآمدهای ثابت');
          return null;
        }),
      ]);
      const loaded = Array.isArray(res?.incomes) ? res.incomes : [];
      const rules = Array.isArray(rulesRes?.rules) ? rulesRes.rules : [];
      setIncomes(loaded);
      setRecurringRules(rules);
      runRecurringSync(loaded, rules);
    } catch (err) {
      setError(err.message || 'خطا در بارگذاری لیست درآمدها');
      setIncomes([]);
    } finally {
      setLoadingIncomes(false);
    }
    // vaultEpoch: reload after unlocking or migrating
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, vaultLocked, vaultEpoch, runRecurringSync]);

  useEffect(() => {
    fetchIncomes();
  }, [fetchIncomes]);

  // Latest list for the recurring actions (they run after async work)
  const incomesRef = useRef(incomes);
  incomesRef.current = incomes;

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
      await runRecurringSync(incomesRef.current, [res.rule]);
      return res.rule;
    } finally {
      setSubmitting(false);
    }
  }, [runRecurringSync]);

  /** Pause / resume a fixed income (a resumed rule catches up on the periods it missed) */
  const toggleRecurring = useCallback(async (rule) => {
    const res = await updateRecurringIncome(rule.id, { ...ruleInput(rule), active: !rule.active });
    setRecurringRules((prev) => prev.map((r) => (r.id === rule.id ? res.rule : r)));
    if (res.rule.active) await runRecurringSync(incomesRef.current, [res.rule]);
  }, [runRecurringSync]);

  /** Delete a fixed income; entries it already created stay */
  const deleteRecurring = useCallback(async (ruleId) => {
    await apiDeleteRecurring(ruleId);
    setRecurringRules((prev) => prev.filter((r) => r.id !== ruleId));
  }, []);

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
    vaultLocked,
    loadingIncomes,
    submitting,
    deletingId,
    error,
    clearError,
    fetchIncomes,
    saveIncome,
    deleteIncome,
    recurringRules,
    recurringError,
    clearRecurringError: () => setRecurringError(null),
    saveRecurring,
    toggleRecurring,
    deleteRecurring,
  };
}
