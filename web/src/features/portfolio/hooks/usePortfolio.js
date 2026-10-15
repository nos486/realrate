import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRefreshHandler } from '../../../shared/refresh/pageRefresh.js';
import {
  getPortfolios,
  createPortfolio as apiCreatePortfolio,
  updatePortfolio as apiUpdatePortfolio,
  deletePortfolio as apiDeletePortfolio,
} from '../api/portfolioApi.js';
import { useAuth } from '../../auth/index.js';
import { useVault } from '../../../shared/vault/useVault.js';
import { getVaultState, createPortfolioKey } from '../../../shared/vault/vaultStore.js';
import { ensureDefaultPortfolio } from '../../../shared/vault/defaultPortfolio.js';

export function usePortfolio(initialPortfolioId = null) {
  const { user } = useAuth();
  // Unlocking the vault (or setting it up) lets the first portfolio be created — reload then
  const { epoch: vaultEpoch } = useVault();
  const [portfolios, setPortfolios] = useState([]);
  const [activePortfolioId, setActivePortfolioId] = useState(null);
  const [loadingPortfolios, setLoadingPortfolios] = useState(true);

  // The portfolio the address names (/portfolio/:id): read when the list loads, and followed when it changes
  const initialIdRef = useRef(initialPortfolioId);
  useEffect(() => {
    initialIdRef.current = initialPortfolioId;
  }, [initialPortfolioId]);

  const activePortfolioIdRef = useRef(activePortfolioId);
  useEffect(() => {
    activePortfolioIdRef.current = activePortfolioId;
  }, [activePortfolioId]);

  const activePortfolio = useMemo(() => {
    return portfolios.find((p) => p.id === activePortfolioId) || portfolios[0] || null;
  }, [portfolios, activePortfolioId]);

  const fetchPortfolios = useCallback(async (targetPortfolioId = null) => {
    if (!user) {
      setPortfolios([]);
      setActivePortfolioId(null);
      setLoadingPortfolios(false);
      return [];
    }

    try {
      setLoadingPortfolios(true);
      const res = await getPortfolios();
      let list = Array.isArray(res?.portfolios) ? res.portfolios : [];
      // An account with no portfolio gets its first one, with its key (the vault must be open)
      if (!list.length && getVaultState().status === 'unlocked') list = await ensureDefaultPortfolio(list);
      if (list.length > 0) {
        setPortfolios(list);

        let savedId = null;
        try {
          savedId = localStorage.getItem('realrate_last_portfolio_id');
        } catch {}

        let resolvedId = null;
        if (targetPortfolioId && list.some((p) => p.id === targetPortfolioId)) {
          resolvedId = targetPortfolioId;
        } else if (initialIdRef.current && list.some((p) => p.id === initialIdRef.current)) {
          resolvedId = initialIdRef.current;
        } else if (savedId && list.some((p) => p.id === savedId)) {
          resolvedId = savedId;
        } else {
          const def = list.find((p) => p.isDefault);
          resolvedId = def ? def.id : list[0].id;
        }

        setActivePortfolioId(resolvedId);
        try {
          localStorage.setItem('realrate_last_portfolio_id', resolvedId);
        } catch {}
        return list;
      } else {
        setPortfolios([]);
        setActivePortfolioId(null);
        return [];
      }
    } catch (err) {
      console.error('Failed to fetch portfolios:', err);
      return [];
    } finally {
      setLoadingPortfolios(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPortfolios();
  }, [fetchPortfolios, vaultEpoch]);
  // The open tab's refresh (header button, window focus) reads them again; the active portfolio
  // then is a new object, so its holdings and transactions are read again with it
  useRefreshHandler('portfolio', fetchPortfolios);

  // Going to another portfolio's address (the switcher, back / forward) switches to it
  useEffect(() => {
    if (!initialPortfolioId || initialPortfolioId === activePortfolioIdRef.current) return;
    if (!portfolios.some((p) => p.id === initialPortfolioId)) return;
    setActivePortfolioId(initialPortfolioId);
    try {
      localStorage.setItem('realrate_last_portfolio_id', initialPortfolioId);
    } catch {}
  }, [initialPortfolioId, portfolios]);

  const switchPortfolio = useCallback((portfolioId) => {
    setActivePortfolioId(portfolioId);
    try {
      localStorage.setItem('realrate_last_portfolio_id', portfolioId);
    } catch {}
  }, []);

  const createPortfolio = useCallback(async (name) => {
    if (!name || !name.trim()) return null;
    // Every portfolio is born encrypted, with its own key
    const res = await apiCreatePortfolio({ name: name.trim(), e2eeWrappedKey: (await createPortfolioKey()).wrapped });
    if (res && res.success && res.portfolio) {
      await fetchPortfolios(res.portfolio.id);
      return res.portfolio;
    }
    return null;
  }, [fetchPortfolios]);

  const updatePortfolio = useCallback(async (data) => {
    const res = await apiUpdatePortfolio(data);
    if (res && res.success) {
      await fetchPortfolios(data.id || activePortfolioId);
      return res;
    }
    return res;
  }, [fetchPortfolios, activePortfolioId]);

  const deletePortfolio = useCallback(async (id) => {
    const res = await apiDeletePortfolio(id);
    if (res && res.success) {
      try {
        localStorage.removeItem('realrate_last_portfolio_id');
      } catch {}
      await fetchPortfolios();
      return true;
    }
    return false;
  }, [fetchPortfolios]);

  return {
    portfolios,
    activePortfolioId,
    activePortfolio,
    loadingPortfolios,
    fetchPortfolios,
    switchPortfolio,
    createPortfolio,
    updatePortfolio,
    deletePortfolio,
  };
}
