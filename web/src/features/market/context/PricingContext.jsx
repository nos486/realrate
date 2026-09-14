/**
 * PricingContext.jsx — Unified Pricing & Asset Catalog React Context
 * Feature: features/market
 * Provides single-source-of-truth pricing across the whole app.
 */

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { getMarketItems } from '../api/marketApi.js';
import { computeUnifiedPrices, searchUnifiedAssets } from '../../../utils/pricingEngine.js';

const PricingContext = createContext(null);

export function PricingProvider({ children, initialUsdToman = null, initialGoldUsd = null }) {
  const [marketItems, setMarketItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Client-side inputs for live zero-latency recalculations
  const [usdToman, setUsdToman] = useState(initialUsdToman || '');
  const [goldUsd, setGoldUsd] = useState(initialGoldUsd || '');
  const [silverUsd, setSilverUsd] = useState('');

  // Active base reference rate key (e.g. 'usd' or 'usdt' or any future reference rate)
  const [activeReferenceKey, setActiveReferenceKey] = useState(() => {
    try {
      return localStorage.getItem('realrate_active_reference_rate') || 'usd';
    } catch {
      return 'usd';
    }
  });

  // Dynamic list of available reference rates discovered from backend meta or catalog
  const referenceRates = useMemo(() => {
    if (marketItems?.meta?.reference_rates && Array.isArray(marketItems.meta.reference_rates) && marketItems.meta.reference_rates.length > 0) {
      return marketItems.meta.reference_rates;
    }

    // Dynamic discovery fallback
    const list = [
      {
        key: 'usd',
        priceType: 'usd',
        label: 'دلار آزاد',
        shortLabel: 'دلار',
        symbol: '$',
        price: Number(marketItems?.meta?.live_usd_toman || marketItems?.meta?.default_usd_toman || 62000),
      },
    ];

    const usdtCandidate = marketItems?.currencies?.find((c) => String(c.code).toUpperCase() === 'USDT')
      || marketItems?.goldAndCoins?.find((c) => String(c.symbol).toUpperCase() === 'USDT');
    if (usdtCandidate && Number(usdtCandidate.priceToman || usdtCandidate.price || usdtCandidate.marketPrice) > 0) {
      list.push({
        key: 'usdt',
        priceType: 'usdt',
        label: 'دلار تتر',
        shortLabel: 'تتر',
        symbol: '₮',
        price: Number(usdtCandidate.priceToman || usdtCandidate.price || usdtCandidate.marketPrice),
      });
    }

    return list;
  }, [marketItems]);

  const activeReferenceRate = useMemo(() => {
    return referenceRates.find((r) => r.key === activeReferenceKey) || referenceRates[0] || null;
  }, [referenceRates, activeReferenceKey]);

  // Cycle to next reference rate in rotation (e.g. USD -> USDT -> etc.)
  const cycleReferenceRate = useCallback(() => {
    if (!referenceRates || referenceRates.length === 0) return null;
    const currentIdx = referenceRates.findIndex((r) => r.key === activeReferenceKey);
    const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % referenceRates.length;
    const nextRate = referenceRates[nextIdx];

    if (nextRate) {
      setActiveReferenceKey(nextRate.key);
      try {
        localStorage.setItem('realrate_active_reference_rate', nextRate.key);
      } catch { }

      if (Number(nextRate.price) > 0) {
        setUsdToman(nextRate.price);
      }
      window.dispatchEvent(new CustomEvent('realrate_reference_rate_changed', { detail: nextRate }));
      return nextRate;
    }
    return null;
  }, [referenceRates, activeReferenceKey]);

  const setReferenceRateKey = useCallback((key) => {
    const targetRate = referenceRates.find((r) => r.key === key);
    if (targetRate) {
      setActiveReferenceKey(key);
      try {
        localStorage.setItem('realrate_active_reference_rate', key);
      } catch { }
      if (Number(targetRate.price) > 0) {
        setUsdToman(targetRate.price);
      }
      window.dispatchEvent(new CustomEvent('realrate_reference_rate_changed', { detail: targetRate }));
    }
  }, [referenceRates]);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getMarketItems();
      if (res && res.success) {
        setMarketItems(res);

        const storedKey = (() => {
          try {
            return localStorage.getItem('realrate_active_reference_rate') || 'usd';
          } catch {
            return 'usd';
          }
        })();

        const availableRefs = res.meta?.reference_rates || [];
        const matchedRef = availableRefs.find((r) => r.key === storedKey) || availableRefs[0];

        if (!usdToman) {
          const liveUsd = matchedRef?.price || res.meta?.live_usd_toman || res.meta?.default_usd_toman || 62000;
          setUsdToman(liveUsd);
          if (matchedRef?.key) setActiveReferenceKey(matchedRef.key);
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
    activeReferenceKey,
    activeReferenceRate,
    referenceRates,
    cycleReferenceRate,
    setReferenceRateKey,
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
