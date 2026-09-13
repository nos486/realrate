import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getPortfolio,
  addPortfolioHolding,
  updatePortfolioHolding,
  deletePortfolioHolding,
  searchBourseSymbols,
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
  const [boursePricesMap, setBoursePricesMap] = useState({});

  // Active vault key for current portfolio
  const activeVaultKey = activePortfolio?.isE2ee && activePortfolio?.id
    ? vaultKeys[activePortfolio.id] || null
    : null;

  const isVaultLocked = Boolean(
    activePortfolio?.isE2ee && activePortfolio?.id && !activeVaultKey
  );

  // 1. Fetch Holdings for active portfolio + Auto-migration of local storage holdings
  const fetchHoldings = useCallback(async () => {
    if (!user || !activePortfolio?.id) {
      setHoldings([]);
      setLoadingHoldings(false);
      return;
    }

    try {
      setLoadingHoldings(true);
      const res = await getPortfolio(activePortfolio.id);

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
                  assetName: itm.name || itm.assetName,
                  assetType: itm.category || itm.assetType || 'custom',
                  unit: itm.unit,
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
        if (activePortfolio.isE2ee) {
          const key = vaultKeys[activePortfolio.id];
          if (key) {
            const decrypted = await Promise.all(
              rawHoldings.map((h) => decryptHoldingFromApi(h, key))
            );
            setHoldings(decrypted.map(normalizeHolding));
          } else {
            // Check session storage for cached passphrase
            const cachedPass = getVaultPassphraseFromSession(activePortfolio.id);
            if (cachedPass && activePortfolio.e2eeSalt && activePortfolio.e2eeVerifier) {
              try {
                const derivedKey = await deriveE2eeKey(cachedPass, activePortfolio.e2eeSalt);
                const isValid = await verifyE2eeKey(derivedKey, activePortfolio.e2eeVerifier);
                if (isValid) {
                  setVaultKeys((prev) => ({ ...prev, [activePortfolio.id]: derivedKey }));
                  const decrypted = await Promise.all(
                    rawHoldings.map((h) => decryptHoldingFromApi(h, derivedKey))
                  );
                  setHoldings(decrypted.map(normalizeHolding));
                } else {
                  setHoldings(rawHoldings.map(normalizeHolding));
                }
              } catch {
                setHoldings(rawHoldings.map(normalizeHolding));
              }
            } else {
              setHoldings(rawHoldings.map(normalizeHolding));
            }
          }
        } else {
          setHoldings(rawHoldings.map(normalizeHolding));
        }
      } else {
        setHoldings([]);
      }
    } catch (err) {
      console.error('Failed to load portfolio holdings:', err);
      setHoldings([]);
    } finally {
      setLoadingHoldings(false);
    }
  }, [user, activePortfolio, vaultKeys]);

  useEffect(() => {
    fetchHoldings();
  }, [fetchHoldings]);

  // Synchronize bourse prices for active bourse holdings
  useEffect(() => {
    let isMounted = true;
    const bourseHoldings = holdings.filter(
      (h) => h.assetType === 'bourse' || h.assetType === 'bourse_fund' || h.assetId?.startsWith('bourse_')
    );
    if (bourseHoldings.length === 0) return;

    searchBourseSymbols('', 2000)
      .then((res) => {
        if (!isMounted || !res?.success || !Array.isArray(res.symbols)) return;
        const newMap = {};
        res.symbols.forEach((s) => {
          const p = Number(s.priceToman !== undefined ? s.priceToman : (s.price || 0));
          if (s.symbol) {
            newMap[s.symbol] = p;
            const norm = s.symbol.replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim();
            newMap[norm] = p;
          }
        });
        setBoursePricesMap((prev) => ({ ...prev, ...newMap }));
      })
      .catch((err) => {
        console.warn('Failed to fetch bourse symbols for portfolio:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [holdings]);

  // Unlock E2EE Vault
  const unlockVault = async (passphrase) => {
    if (!activePortfolio || !activePortfolio.isE2ee || !passphrase) return false;
    setUnlockingVault(true);
    setVaultUnlockError('');

    try {
      const derivedKey = await deriveE2eeKey(passphrase, activePortfolio.e2eeSalt);
      const isValid = await verifyE2eeKey(derivedKey, activePortfolio.e2eeVerifier);
      if (!isValid) {
        setVaultUnlockError('رمز عبور گاوصندوق اشتباه است.');
        return false;
      }

      setVaultKeys((prev) => ({ ...prev, [activePortfolio.id]: derivedKey }));
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
    setVaultKeys((prev) => {
      const copy = { ...prev };
      delete copy[activePortfolio.id];
      return copy;
    });
    clearVaultPassphraseFromSession(activePortfolio.id);
  };

  // Add holding
  const addHolding = async (holdingData) => {
    if (!activePortfolio?.id) return null;
    setSubmitting(true);
    try {
      let payload = { ...holdingData, portfolioId: activePortfolio.id };
      if (activePortfolio.isE2ee && activeVaultKey) {
        payload = await encryptHoldingForApi(payload, activeVaultKey);
      }
      const res = await addPortfolioHolding(payload);
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
    if (!holdingData?.id || !activePortfolio?.id) return null;
    setSubmitting(true);
    try {
      let payload = { ...holdingData, portfolioId: activePortfolio.id };
      if (activePortfolio.isE2ee && activeVaultKey) {
        payload = await encryptHoldingForApi(payload, activeVaultKey);
      }
      const res = await updatePortfolioHolding(payload);
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
    if (!id) return false;
    setDeletingId(id);
    try {
      const res = await deletePortfolioHolding(id);
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
    boursePricesMap,
    fetchHoldings,
    addHolding,
    updateHolding,
    deleteHolding,
    isVaultLocked,
    unlockVault,
    lockVault,
    vaultUnlockError,
    unlockingVault,
  };
}
