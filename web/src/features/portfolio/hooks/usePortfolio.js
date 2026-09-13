import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  getPortfolios,
  createPortfolio as apiCreatePortfolio,
  updatePortfolio as apiUpdatePortfolio,
  deletePortfolio as apiDeletePortfolio,
} from '../api/portfolioApi.js';
import { useAuth } from '../../auth/index.js';

export function usePortfolio(initialPortfolioId = null) {
  const { user } = useAuth();
  const [portfolios, setPortfolios] = useState([]);
  const [activePortfolioId, setActivePortfolioId] = useState(null);
  const [loadingPortfolios, setLoadingPortfolios] = useState(true);

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
      if (res && res.success && Array.isArray(res.portfolios) && res.portfolios.length > 0) {
        setPortfolios(res.portfolios);

        let savedId = null;
        try {
          savedId = localStorage.getItem('realrate_last_portfolio_id');
        } catch {}

        let resolvedId = null;
        if (targetPortfolioId && res.portfolios.some((p) => p.id === targetPortfolioId)) {
          resolvedId = targetPortfolioId;
        } else if (initialPortfolioId && res.portfolios.some((p) => p.id === initialPortfolioId)) {
          resolvedId = initialPortfolioId;
        } else if (savedId && res.portfolios.some((p) => p.id === savedId)) {
          resolvedId = savedId;
        } else {
          const def = res.portfolios.find((p) => p.isDefault);
          resolvedId = def ? def.id : res.portfolios[0].id;
        }

        setActivePortfolioId(resolvedId);
        try {
          localStorage.setItem('realrate_last_portfolio_id', resolvedId);
        } catch {}
        return res.portfolios;
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
  }, [user, initialPortfolioId]);

  useEffect(() => {
    fetchPortfolios();
  }, [fetchPortfolios]);

  const switchPortfolio = useCallback((portfolioId) => {
    setActivePortfolioId(portfolioId);
    try {
      localStorage.setItem('realrate_last_portfolio_id', portfolioId);
    } catch {}
  }, []);

  const createPortfolio = useCallback(async (name) => {
    if (!name || !name.trim()) return null;
    const res = await apiCreatePortfolio({ name: name.trim() });
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
