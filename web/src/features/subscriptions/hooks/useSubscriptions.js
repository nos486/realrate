/**
 * useSubscriptions.js — Loading the user's subscriptions and every change to them
 *
 * Used once through SubscriptionsProvider, so the subscriptions page and the renewal reminders
 * (the alert center, the Android notifications, the browser's push) share one list.
 *
 * Every subscription has its spending in the expenses: when one is saved, and whenever the list
 * is read, the payments it is due are recorded as expenses (a new one's first payment; each
 * renewal of one that renews by itself as its day comes — shared/vault/spendingRecords.js).
 */

import { useState, useEffect, useCallback } from 'react';
import { useRefreshHandler } from '../../../shared/refresh/pageRefresh.js';
import { useAuth } from '../../auth/index.js';
import { useVault } from '../../../shared/vault/useVault.js';
import * as api from '../../../shared/vault/vaultSubscriptions.js';
import { useFeature } from '../../../shared/features/useFeature.js';
import { isDemoReadOnly } from '../../demo/index.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { recordSubscriptionPayments } from '../../../shared/vault/spendingRecords.js';

const saveStored = async (input, existing) => (await api.saveSubscription(input, existing)).subscription;

export function useSubscriptions() {
  const { user } = useAuth();
  const { status: vaultStatus, epoch: vaultEpoch } = useVault();
  const vaultLocked = vaultStatus === 'locked';
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  // Their payments go into the expenses (not without the expenses, nor in the read-only demo)
  const recordsSpending = useFeature('expenses') && !isDemoReadOnly();

  /** Record what each is due; the subscriptions as saved after it */
  const recordDue = useCallback(async (list) => {
    if (!recordsSpending) return list;
    const today = todayIso();
    let recorded = false;
    const out = [];
    for (const sub of list) {
      try {
        const saved = await recordSubscriptionPayments(sub, today, { saveSubscription: saveStored });
        recorded = recorded || Boolean(saved);
        out.push(saved || sub);
      } catch (err) {
        console.warn('[subscriptions] a payment could not be recorded:', err?.message || err);
        out.push(sub);
      }
    }
    // The expenses tab, if open, reads them again
    if (recorded) import('../../../shared/refresh/pageRefresh.js').then(({ refreshScopes }) => refreshScopes({ scopes: ['expenses'] })).catch(() => {});
    return out;
  }, [recordsSpending]);

  const fetchSubscriptions = useCallback(async () => {
    // Encrypted records only: readable once the vault is unlocked
    if (!user || vaultStatus !== 'unlocked') {
      setSubscriptions([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const { subscriptions: list } = await api.getSubscriptions();
      setSubscriptions(list);
      const current = await recordDue(list);
      if (current.some((sub, i) => sub !== list[i])) setSubscriptions(current);
    } catch (err) {
      setError(err.message || 'خطا در بارگذاری اشتراک‌ها');
    } finally {
      setLoading(false);
    }
    // vaultEpoch: reload after unlocking or a sync
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, vaultStatus, vaultEpoch, recordDue]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);
  // The open tab's refresh (header button, coming back to the app) reads them again
  useRefreshHandler('subscriptions', fetchSubscriptions);

  /** Errors are re-thrown so the open form can show them */
  const saveSubscription = useCallback(async (input, existing = null) => {
    setSubmitting(true);
    try {
      const { subscription: saved } = await api.saveSubscription(input, existing);
      // A new one's first payment (or a renewal its edit made due) goes into the expenses
      const [subscription] = await recordDue([saved]);
      setSubscriptions((prev) => [...prev.filter((s) => s.id !== subscription.id), subscription]);
      return subscription;
    } finally {
      setSubmitting(false);
    }
  }, [recordDue]);

  const deleteSubscription = useCallback(async (id) => {
    await api.deleteSubscription(id);
    setSubscriptions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return {
    subscriptions, vaultLocked, vaultStatus, loading, submitting, error,
    clearError: () => setError(null), fetchSubscriptions, saveSubscription, deleteSubscription,
  };
}
