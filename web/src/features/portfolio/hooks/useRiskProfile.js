/**
 * useRiskProfile.js — Hook to load and save the active portfolio's risk-tolerance test result
 */

import { useState, useEffect, useCallback } from 'react';
import { loadRiskProfile, saveRiskProfile } from '../../../shared/vault/vaultRiskProfile.js';

export function useRiskProfile(portfolio, activeVaultKey, isVaultLocked) {
  const portfolioId = portfolio?.id || null;
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!portfolioId || !activeVaultKey || isVaultLocked) {
      setResult(null);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    loadRiskProfile(portfolioId, activeVaultKey)
      .then((r) => { if (!cancelled) setResult(r); })
      .catch((err) => {
        if (!cancelled) setResult(null);
        console.warn('Loading the risk profile failed:', err);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [portfolioId, activeVaultKey, isVaultLocked]);

  /** Store a finished test; throws when saving fails (the caller shows it) */
  const save = useCallback(async (input) => {
    const saved = await saveRiskProfile(portfolioId, activeVaultKey, input);
    setResult(saved);
    return saved;
  }, [portfolioId, activeVaultKey]);

  return { result, loading, save };
}
