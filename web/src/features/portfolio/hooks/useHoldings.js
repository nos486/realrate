import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getPortfolio,
  addPortfolioHolding,
  updatePortfolioHolding,
  deletePortfolioHolding,
} from '../api/portfolioApi.js';
import { useAuth } from '../../auth/index.js';
import { normalizeHolding } from '../utils/holdingHelpers.js';
import {
  deriveE2eeKey,
  verifyE2eeKey,
  encryptHoldingForApi,
  decryptHoldingFromApi,
  getVaultPassphraseFromSession,
  saveVaultPassphraseToSession,
  clearVaultPassphraseFromSession,
} from '../../../lib/e2ee.js';
import { usePortfolioVaultKey } from '../../../shared/vault/usePortfolioVaultKey.js';
import {
  listPortfolioHoldings,
  savePortfolioHolding,
  deletePortfolioHoldingRecord,
} from '../../../shared/vault/vaultPortfolioItems.js';
import {
  unlockVault as unlockAccountVault,
  lockAll,
  markLegacyVaultUnlocked,
  LOCK_ALL_EVENT,
} from '../../../shared/vault/vaultStore.js';

export function useHoldings(activePortfolio) {
  const { user } = useAuth();
  const [holdings, setHoldings] = useState([]);
  const [loadingHoldings, setLoadingHoldings] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // E2EE Vault Keys State
  const [vaultKeys, setVaultKeys] = useState({});
  const [vaultUnlockError, setVaultUnlockError] = useState('');
  const [unlockingVault, setUnlockingVault] = useState(false);

  // Bourse Live Prices Map

  // Key for the current portfolio: from the account-wide vault when the portfolio is under it,
  // otherwise from the portfolio's own (older) passphrase vault. An account-vault portfolio that
  // came from an older vault can still be opened with its old passphrase too.
  const { accountManaged, key: accountKey, resolving: resolvingAccountKey } = usePortfolioVaultKey(activePortfolio);
  const usesEncryption = Boolean(activePortfolio?.id && (activePortfolio.isE2ee || accountManaged));
  const passphraseKey = usesEncryption ? vaultKeys[activePortfolio.id] || null : null;
  const activeVaultKey = accountKey || passphraseKey;
  const hasOwnPassphrase = Boolean(activePortfolio?.e2eeSalt && activePortfolio?.e2eeVerifier);

  const isVaultLocked = Boolean(usesEncryption && !activeVaultKey && !resolvingAccountKey);

  // Only the newest fetch may write state: a slow response for a portfolio the user already
  // switched away from must not overwrite the current one's holdings.
  const fetchSeqRef = useRef(0);
  const loadedPortfolioIdRef = useRef(null);

  // 1. Fetch Holdings for active portfolio + Auto-migration of local storage holdings
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

    // The account key is still being unwrapped: stay in the loading state, the next run decrypts
    if (usesEncryption && resolvingAccountKey) {
      setLoadingHoldings(true);
      return;
    }

    try {
      setLoadingHoldings(true);

      // Account vault: every holding is an encrypted vault record of this portfolio
      if (accountManaged && activeVaultKey) {
        const items = await listPortfolioHoldings(activePortfolio, activeVaultKey);
        applyHoldings(items.map(normalizeHolding));
        return;
      }

      const res = await getPortfolio(activePortfolio.id);
      if (isStale()) return;

      if (res && res.success && Array.isArray(res.holdings)) {
        let rawHoldings = res.holdings;

        // Auto-migration: Check if there are local offline holdings from legacy realrate_portfolio_v1
        try {
          const localStr = localStorage.getItem('realrate_portfolio_v1');
          if (localStr && rawHoldings.length === 0) {
            const localItems = JSON.parse(localStr);
            if (Array.isArray(localItems) && localItems.length > 0) {
              for (const itm of localItems) {
                await addPortfolioHolding({
                  portfolioId: activePortfolio.id,
                  assetId: itm.assetId,
                  amount: itm.amount,
                  buyPrice: itm.buyPrice || 0,
                  buyDate: itm.buyDate || '',
                  notes: itm.notes || '',
                });
              }
              localStorage.removeItem('realrate_portfolio_v1');
              const refreshed = await getPortfolio(activePortfolio.id);
              if (refreshed && refreshed.success && Array.isArray(refreshed.holdings)) {
                rawHoldings = refreshed.holdings;
              }
            }
          }
        } catch (migrationErr) {
          console.warn('Auto-migration of local holdings skipped:', migrationErr);
        }

        // Handle E2EE Decryption if portfolio is encrypted
        if (usesEncryption) {
          const key = activeVaultKey;
          if (key) {
            const decrypted = await Promise.all(
              rawHoldings.map((h) => decryptHoldingFromApi(key, h))
            );
            applyHoldings(decrypted.map(normalizeHolding));
          } else {
            // Check session storage for cached passphrase
            const cachedPass = getVaultPassphraseFromSession(activePortfolio.id);
            if (cachedPass && hasOwnPassphrase) {
              try {
                const derivedKey = await deriveE2eeKey(cachedPass, activePortfolio.e2eeSalt);
                const isValid = await verifyE2eeKey(derivedKey, activePortfolio.e2eeVerifier);
                if (isValid && !isStale()) {
                  setVaultKeys((prev) => ({ ...prev, [activePortfolio.id]: derivedKey }));
                  markLegacyVaultUnlocked();
                  const decrypted = await Promise.all(
                    rawHoldings.map((h) => decryptHoldingFromApi(derivedKey, h))
                  );
                  applyHoldings(decrypted.map(normalizeHolding));
                } else {
                  applyHoldings([]);
                }
              } catch {
                applyHoldings([]);
              }
            } else {
              applyHoldings([]);
            }
          }
        } else {
          applyHoldings(rawHoldings.map(normalizeHolding));
        }
      } else {
        applyHoldings([]);
      }
    } catch (err) {
      if (!isStale()) console.error('Failed to load portfolio holdings:', err);
      applyHoldings([]);
    } finally {
      if (!isStale()) setLoadingHoldings(false);
    }
  }, [user, activePortfolio, usesEncryption, activeVaultKey, resolvingAccountKey, hasOwnPassphrase, accountManaged]);

  useEffect(() => {
    fetchHoldings();
  }, [fetchHoldings]);

  // The header's global lock also drops keys opened with a portfolio's own passphrase
  useEffect(() => {
    const dropKeys = () => setVaultKeys({});
    window.addEventListener(LOCK_ALL_EVENT, dropKeys);
    return () => window.removeEventListener(LOCK_ALL_EVENT, dropKeys);
  }, []);

  // Synchronize bourse prices for active bourse holdings

  // Unlock E2EE Vault
  const unlockVault = async (passphrase) => {
    if (!activePortfolio || !usesEncryption || !passphrase) return false;
    setUnlockingVault(true);
    setVaultUnlockError('');

    try {
      if (accountManaged) {
        // One passphrase opens the whole account vault (every portfolio, loans, incomes)
        if (await unlockAccountVault(passphrase)) return true;
        if (!hasOwnPassphrase) {
          setVaultUnlockError('رمز عبور رمزنگاری حساب اشتباه است.');
          return false;
        }
      }

      const derivedKey = await deriveE2eeKey(passphrase, activePortfolio.e2eeSalt);
      const isValid = await verifyE2eeKey(derivedKey, activePortfolio.e2eeVerifier);
      if (!isValid) {
        setVaultUnlockError('رمز عبور گاوصندوق اشتباه است.');
        return false;
      }

      setVaultKeys((prev) => ({ ...prev, [activePortfolio.id]: derivedKey }));
      markLegacyVaultUnlocked();
      saveVaultPassphraseToSession(activePortfolio.id, passphrase);
      return true;
    } catch (err) {
      setVaultUnlockError('خطا در بررسی رمز عبور: ' + (err.message || ''));
      return false;
    } finally {
      setUnlockingVault(false);
    }
  };

  const lockVault = () => {
    if (!activePortfolio?.id) return;
    if (accountManaged) lockAll();
    setVaultKeys((prev) => {
      const copy = { ...prev };
      delete copy[activePortfolio.id];
      return copy;
    });
    clearVaultPassphraseFromSession(activePortfolio.id);
  };

  // Add holding
  const addHolding = async (holdingData) => {
    if (isVaultLocked) {
      throw new Error("پورتفو قفل است، ابتدا آن را باز کنید.");
    }
    if (!activePortfolio?.id) return null;
    setSubmitting(true);
    try {
      let payload = { ...holdingData, portfolioId: activePortfolio.id };
      let res;
      if (accountManaged && activeVaultKey) {
        res = await savePortfolioHolding(activePortfolio, activeVaultKey, { ...payload, id: undefined });
      } else {
        if (usesEncryption && activeVaultKey) payload = await encryptHoldingForApi(activeVaultKey, payload);
        res = await addPortfolioHolding(payload);
      }
      if (res && res.success) {
        await fetchHoldings();
        return res;
      }
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  // Update holding
  const updateHolding = async (holdingData) => {
    if (isVaultLocked) {
      throw new Error("پورتفو قفل است، ابتدا آن را باز کنید.");
    }
    if (!holdingData?.id || !activePortfolio?.id) return null;
    setSubmitting(true);
    try {
      let payload = { ...holdingData, portfolioId: activePortfolio.id };
      let res;
      if (accountManaged && activeVaultKey) {
        res = await savePortfolioHolding(activePortfolio, activeVaultKey, payload);
      } else {
        if (usesEncryption && activeVaultKey) payload = await encryptHoldingForApi(activeVaultKey, payload);
        res = await updatePortfolioHolding(payload);
      }
      if (res && res.success) {
        await fetchHoldings();
        return res;
      }
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  // Delete holding
  const deleteHolding = async (id) => {
    if (isVaultLocked) {
      throw new Error("پورتفو قفل است، ابتدا آن را باز کنید.");
    }
    if (!id) return false;
    setDeletingId(id);
    try {
      const res = accountManaged ? await deletePortfolioHoldingRecord(id) : await deletePortfolioHolding(id);
      if (res && res.success) {
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
