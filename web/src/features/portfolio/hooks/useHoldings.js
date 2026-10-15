/**
 * useHoldings.js — A portfolio's holdings, end-to-end encrypted
 *
 * Every holding is a vault record of its portfolio, encrypted with the portfolio's own key
 * (unwrapped by the account vault: usePortfolioVaultKey). One passphrase, the account vault's,
 * opens every portfolio; locking locks them all.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../auth/index.js';
import { normalizeHolding } from '../utils/holdingHelpers.js';
import { usePortfolioVaultKey } from '../../../shared/vault/usePortfolioVaultKey.js';
import {
  listPortfolioHoldings,
  savePortfolioHolding,
  deletePortfolioHoldingRecord,
} from '../../../shared/vault/vaultPortfolioItems.js';
import { unlockVault as unlockAccountVault, lockAll } from '../../../shared/vault/vaultStore.js';
import { t } from '../../../utils/i18n.js';

export function useHoldings(activePortfolio) {
  const { user } = useAuth();
  const [holdings, setHoldings] = useState([]);
  const [loadingHoldings, setLoadingHoldings] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [vaultUnlockError, setVaultUnlockError] = useState('');
  const [unlockingVault, setUnlockingVault] = useState(false);

  const { accountManaged, key: activeVaultKey, resolving: resolvingKey } = usePortfolioVaultKey(activePortfolio);
  const isVaultLocked = Boolean(activePortfolio?.id && !activeVaultKey && !resolvingKey);

  // Only the newest fetch may write state: a slow response for a portfolio the user already
  // switched away from must not overwrite the current one's holdings.
  const fetchSeqRef = useRef(0);
  const loadedPortfolioIdRef = useRef(null);

  const fetchHoldings = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    const isStale = () => seq !== fetchSeqRef.current;
    const applyHoldings = (list) => {
      if (isStale()) return;
      loadedPortfolioIdRef.current = activePortfolio?.id || null;
      setHoldings(list);
    };

    if (!user || !activePortfolio?.id) {
      applyHoldings([]);
      setLoadingHoldings(false);
      return;
    }

    // Don't keep showing the previous portfolio's rows while the new one loads
    if (loadedPortfolioIdRef.current !== activePortfolio.id) {
      setHoldings([]);
    }

    // The key is still being unwrapped: stay in the loading state, the next run decrypts
    if (resolvingKey) {
      setLoadingHoldings(true);
      return;
    }
    if (!activeVaultKey) {
      applyHoldings([]);
      setLoadingHoldings(false);
      return;
    }

    try {
      setLoadingHoldings(true);
      const items = await listPortfolioHoldings(activePortfolio, activeVaultKey);
      applyHoldings(items.map(normalizeHolding));
    } catch (err) {
      if (!isStale()) console.error('Failed to load portfolio holdings:', err);
      applyHoldings([]);
    } finally {
      if (!isStale()) setLoadingHoldings(false);
    }
  }, [user, activePortfolio, activeVaultKey, resolvingKey]);

  useEffect(() => {
    fetchHoldings();
  }, [fetchHoldings]);

  /** One passphrase opens the whole account vault (every portfolio, loans, incomes) */
  const unlockVault = async (passphrase) => {
    if (!activePortfolio || !passphrase) return false;
    setUnlockingVault(true);
    setVaultUnlockError('');
    try {
      if (await unlockAccountVault(passphrase)) return true;
      setVaultUnlockError(t('رمز عبور رمزنگاری حساب اشتباه است.'));
      return false;
    } catch (err) {
      setVaultUnlockError(t('خطا در بررسی رمز عبور: {message}', { message: err.message || '' }));
      return false;
    } finally {
      setUnlockingVault(false);
    }
  };

  const lockVault = () => lockAll();

  const requireKey = () => {
    if (isVaultLocked) throw new Error(t('پورتفو قفل است، ابتدا آن را باز کنید.'));
  };

  const addHolding = async (holdingData) => {
    requireKey();
    if (!activePortfolio?.id) return null;
    setSubmitting(true);
    try {
      const res = await savePortfolioHolding(activePortfolio, activeVaultKey, { ...holdingData, portfolioId: activePortfolio.id, id: undefined });
      if (res?.success) {
        await fetchHoldings();
        return res;
      }
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  const updateHolding = async (holdingData) => {
    requireKey();
    if (!holdingData?.id || !activePortfolio?.id) return null;
    setSubmitting(true);
    try {
      const res = await savePortfolioHolding(activePortfolio, activeVaultKey, { ...holdingData, portfolioId: activePortfolio.id });
      if (res?.success) {
        await fetchHoldings();
        return res;
      }
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  const deleteHolding = async (id) => {
    requireKey();
    if (!id) return false;
    setDeletingId(id);
    try {
      const res = await deletePortfolioHoldingRecord(id);
      if (res?.success) {
        setHoldings((prev) => prev.filter((h) => h.id !== id));
        return true;
      }
      return false;
    } finally {
      setDeletingId(null);
    }
  };

  return {
    holdings,
    loadingHoldings,
    submitting,
    deletingId,
    fetchHoldings,
    addHolding,
    updateHolding,
    deleteHolding,
    isVaultLocked,
    unlockVault,
    lockVault,
    vaultUnlockError,
    unlockingVault,
    activeVaultKey,
    accountManaged,
  };
}
