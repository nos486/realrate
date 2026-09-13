/**
 * PricingContext.jsx — Unified Pricing & Asset Catalog React Context
 * Provides single-source-of-truth pricing across the whole app.
 */

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { apiGetMarketItems } from '../api/client.js';
import { computeUnifiedPrices, searchUnifiedAssets } from '../utils/pricingEngine.js';

const PricingContext = createContext(null);

export function PricingProvider({ children, initialUsdToman = null, initialGoldUsd = null }) {
  const [marketItems, setMarketItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Client-side inputs for live zero-latency recalculations
  const [usdToman, setUsdToman] = useState(initialUsdToman || '');
  const [goldUsd, setGoldUsd] = useState(initialGoldUsd || '');
  const [silverUsd, setSilverUsd] = useState('');

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiGetMarketItems();
      if (res && res.success) {
        setMarketItems(res);
        if (!usdToman) {
          const liveUsd = res.meta?.live_usd_toman || res.meta?.default_usd_toman || 62000;
          setUsdToman(liveUsd);
        }
        if (!goldUsd) {
          const liveGold = res.meta?.gold_usd || 2890;
          setGoldUsd(liveGold);
        }
        if (!silverUsd) {
          const liveSilver = res.meta?.silver_usd || 33.5;
          setSilverUsd(liveSilver);
        }
      }
    } catch (e) {
      console.error('Error fetching unified market items:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [usdToman, goldUsd, silverUsd]);

  useEffect(() => {
    fetchItems();
  }, []);

  // Compute live prices instantly whenever user edits USD or Gold spot
  const { resolvedAssets, priceMap, summary } = useMemo(() => {
    const usdNum = typeof usdToman === 'string' ? parseFloat(usdToman.replace(/,/g, '')) || 0 : Number(usdToman || 0);
    const goldNum = typeof goldUsd === 'string' ? parseFloat(goldUsd.replace(/,/g, '')) || 0 : Number(goldUsd || 0);
    const silverNum = typeof silverUsd === 'string' ? parseFloat(silverUsd.replace(/,/g, '')) || 0 : Number(silverUsd || 0);

    return computeUnifiedPrices({
      marketItems,
      usdToman: usdNum,
      goldUsd: goldNum,
      silverUsd: silverNum,
    });
  }, [marketItems, usdToman, goldUsd, silverUsd]);

  const getAssetPrice = useCallback((id) => {
    if (!id) return 0;
    const cleanId = String(id).replace(/^src_def_/, '').replace(/^derived_/, '').trim();
    return priceMap[cleanId] || priceMap[cleanId.toLowerCase()] || priceMap[id] || 0;
  }, [priceMap]);

  const getAsset = useCallback((id) => {
    if (!id) return null;
    const cleanId = String(id).replace(/^src_def_/, '').replace(/^derived_/, '').trim().toLowerCase();
    return resolvedAssets.find(a =>
      a.id?.toLowerCase() === cleanId ||
      a.symbol?.toLowerCase() === cleanId ||
      a.code?.toLowerCase() === cleanId
    ) || null;
  }, [resolvedAssets]);

  const searchAssets = useCallback((query, options) => {
    return searchUnifiedAssets(resolvedAssets, query, options);
  }, [resolvedAssets]);

  const value = {
    loading,
    error,
    marketItems,
    resolvedAssets,
    priceMap,
    summary,
    usdToman,
    setUsdToman,
    goldUsd,
    setGoldUsd,
    silverUsd,
    setSilverUsd,
    getAssetPrice,
    getAsset,
    searchAssets,
    refresh: fetchItems,
  };

  return (
    <PricingContext.Provider value={value}>
      {children}
    </PricingContext.Provider>
  );
}

export function usePricing() {
  const context = useContext(PricingContext);
  return context;
}
