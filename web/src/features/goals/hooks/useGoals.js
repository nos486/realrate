/**
 * useGoals.js — Loading the user's goals and every change to them
 *
 * Used by the goals page and the home card, each with its own copy: a goal is read when the
 * vault is open and again on the tab's refresh (shared/refresh).
 */

import { useState, useEffect, useCallback } from 'react';
import { t } from '../../../utils/i18n.js';
import { useRefreshHandler } from '../../../shared/refresh/pageRefresh.js';
import { useAuth } from '../../auth/index.js';
import { useVault } from '../../../shared/vault/useVault.js';
import * as api from '../../../shared/vault/vaultGoals.js';

/**
 * @param {{ enabled?: boolean }} [options] - enabled false: nothing is read (a card that is not shown)
 */
export function useGoals({ enabled = true } = {}) {
  const { user } = useAuth();
  const { status: vaultStatus, epoch: vaultEpoch } = useVault();
  const vaultLocked = vaultStatus === 'locked';
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const fetchGoals = useCallback(async () => {
    // Encrypted records only: readable once the vault is unlocked
    if (!enabled || !user || vaultStatus !== 'unlocked') {
      setGoals([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      setGoals((await api.getGoals()).goals);
    } catch (err) {
      setError(err.message || t('خطا در بارگذاری اهداف'));
    } finally {
      setLoading(false);
    }
    // vaultEpoch: reload after unlocking or a sync
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, user, vaultStatus, vaultEpoch]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);
  // The open tab's refresh (header button, coming back to the app) reads them again
  useRefreshHandler('goals', fetchGoals);

  /** Errors are re-thrown so the open form can show them */
  const saveGoal = useCallback(async (input, existing = null) => {
    setSubmitting(true);
    try {
      const { goal } = await api.saveGoal(input, existing);
      setGoals((prev) => [...prev.filter((g) => g.id !== goal.id), goal]);
      return goal;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const deleteGoal = useCallback(async (id) => {
    await api.deleteGoal(id);
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }, []);

  return {
    goals, vaultLocked, vaultStatus, loading, submitting, error,
    clearError: () => setError(null), fetchGoals, saveGoal, deleteGoal,
  };
}
