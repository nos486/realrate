/**
 * useSubscriptions.js — Loading the user's subscriptions and every change to them
 *
 * Used once through SubscriptionsProvider, so the subscriptions page and the renewal reminders
 * (the alert center, the Android notifications, the browser's push) share one list.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRefreshHandler } from '../../../shared/refresh/pageRefresh.js';
import { useAuth } from '../../auth/index.js';
import { useVault } from '../../../shared/vault/useVault.js';
import * as api from '../../../shared/vault/vaultSubscriptions.js';

export function useSubscriptions() {
  const { user } = useAuth();
  const { status: vaultStatus, epoch: vaultEpoch } = useVault();
  const vaultLocked = vaultStatus === 'locked';
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

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
      setSubscriptions((await api.getSubscriptions()).subscriptions);
    } catch (err) {
      setError(err.message || 'خطا در بارگذاری اشتراک‌ها');
    } finally {
      setLoading(false);
    }
    // vaultEpoch: reload after unlocking or a sync
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, vaultStatus, vaultEpoch]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);
  // The open tab's refresh (header button, coming back to the app) reads them again
  useRefreshHandler('subscriptions', fetchSubscriptions);

  /** Errors are re-thrown so the open form can show them */
  const saveSubscription = useCallback(async (input, existing = null) => {
    setSubmitting(true);
    try {
      const { subscription } = await api.saveSubscription(input, existing);
      setSubscriptions((prev) => [...prev.filter((s) => s.id !== subscription.id), subscription]);
      return subscription;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const deleteSubscription = useCallback(async (id) => {
    await api.deleteSubscription(id);
    setSubscriptions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return {
    subscriptions, vaultLocked, vaultStatus, loading, submitting, error,
    clearError: () => setError(null), fetchSubscriptions, saveSubscription, deleteSubscription,
  };
}
