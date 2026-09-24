/**
 * PricingContext.jsx — Unified Pricing & Asset Catalog React Context
 * Feature: features/market
 * Provides single-source-of-truth pricing across the whole app.
 */

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getMarketItems, getPrices } from '../api/marketApi.js';
import { computeUnifiedPrices, searchUnifiedAssets } from '../../../utils/pricingEngine.js';
import { getReferenceRatesSpecs } from '../../../config/sources.config.js';

const PricingContext = createContext(null);

/** How often live prices are refreshed in the background while the tab is visible */
export const PRICE_REFRESH_INTERVAL_MS = 2 * 60 * 1000;

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

  const [customReferenceRates, setCustomReferenceRates] = useState([]);

  // Dynamic list of available reference rates discovered from backend meta or catalog
  const referenceRates = useMemo(() => {
    if (customReferenceRates && customReferenceRates.length > 0) {
      return customReferenceRates;
    }
    if (marketItems?.meta?.reference_rates && Array.isArray(marketItems.meta.reference_rates) && marketItems.meta.reference_rates.length > 0) {
      return marketItems.meta.reference_rates;
    }

    // Dynamic discovery fallback derived directly from sources.config.js
    return getReferenceRatesSpecs().map((spec) => {
      let price = 0;
      if (spec.key === 'usd') {
        price = Number(marketItems?.meta?.live_usd_toman || marketItems?.meta?.default_usd_toman || 0);
      } else {
        const candidate = marketItems?.currencies?.find((c) => String(c.code).toUpperCase() === spec.key.toUpperCase())
          || marketItems?.goldAndCoins?.find((c) => String(c.symbol).toUpperCase() === spec.key.toUpperCase());
        price = Number(candidate?.priceToman || candidate?.price || candidate?.marketPrice || 0);
      }
      return {
        ...spec,
        price,
      };
    });
  }, [customReferenceRates, marketItems]);

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
    setActiveReferenceKey(key);
    try {
      localStorage.setItem('realrate_active_reference_rate', key);
    } catch { }
    const targetRate = referenceRates.find((r) => r.key === key);
    if (targetRate && Number(targetRate.price) > 0) {
      const priceVal = Math.round(Number(targetRate.price));
      setUsdToman((prev) => (Number(prev) === priceVal ? prev : priceVal));
    }
  }, [referenceRates]);

  const updateReferenceRates = useCallback((newRates) => {
    if (Array.isArray(newRates) && newRates.length > 0) {
      setCustomReferenceRates(newRates);
    }
  }, []);

  // Raw /api/prices snapshot (shared with useMarketData so it isn't fetched twice)
  const [pricesData, setPricesData] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Values the user typed by hand in the calculator must survive background refreshes
  const manualOverrideRef = useRef({ usd: false, gold: false });
  const setManualOverride = useCallback((flags) => {
    manualOverrideRef.current = { ...manualOverrideRef.current, ...flags };
  }, []);

  const fetchSeqRef = useRef(0);
  const inFlightRef = useRef(false);
  const lastUpdatedAtRef = useRef(null);

  /**
   * Fetch catalog + price snapshot.
   * @param {{ background?: boolean }} [options] - background refreshes are silent (no
   *   full-screen loader) and keep showing the last good data if they fail.
   */
  const fetchItems = useCallback(async ({ background = false } = {}) => {
    if (background && inFlightRef.current) return;
    const seq = ++fetchSeqRef.current;
    inFlightRef.current = true;

    try {
      if (background) setRefreshing(true);
      else setLoading(true);

      const requestOptions = background ? { silent: true } : {};
      const [itemsRes, pricesRes] = await Promise.allSettled([
        getMarketItems('', '', requestOptions),
        getPrices(requestOptions),
      ]);
      if (seq !== fetchSeqRef.current) return;

      const res = itemsRes.status === 'fulfilled' && itemsRes.value?.success ? itemsRes.value : null;
      const freshPrices = pricesRes.status === 'fulfilled' && pricesRes.value?.success ? pricesRes.value : null;

      if (res) {
        setMarketItems(res);
      }
      if (freshPrices) {
        setPricesData(freshPrices);
      }

      if (!res || !freshPrices) {
        const failed = [itemsRes, pricesRes].find((r) => r.status === 'rejected');
        setError(failed?.reason?.message || 'دریافت قیمت‌ها از سرور ناموفق بود.');
      } else {
        setError(null);
      }
      if (res || freshPrices) {
        const now = Date.now();
        lastUpdatedAtRef.current = now;
        setLastUpdatedAt(now);
      }

      const availableRefs = freshPrices?.reference_rates || res?.meta?.reference_rates || [];
      if (availableRefs.length > 0) {
        setCustomReferenceRates(availableRefs);
      }

      const storedKey = (() => {
        try {
          return localStorage.getItem('realrate_active_reference_rate') || 'usd';
        } catch {
          return 'usd';
        }
      })();

      const matchedRef = availableRefs.find((r) => r.key === storedKey) || availableRefs[0];

      const liveUsd = matchedRef?.price || freshPrices?.live_usd_toman || freshPrices?.prices?.usd_toman?.price || res?.meta?.live_usd_toman;
      if (liveUsd && !manualOverrideRef.current.usd) {
        setUsdToman(liveUsd);
        if (matchedRef?.key) setActiveReferenceKey(matchedRef.key);
      }
      const liveGold = freshPrices?.gold_usd || res?.meta?.gold_usd;
      if (liveGold && !manualOverrideRef.current.gold) setGoldUsd(liveGold);
      const liveSilver = freshPrices?.silver_usd || res?.meta?.silver_usd;
      if (liveSilver) setSilverUsd(liveSilver);
    } catch (e) {
      if (seq !== fetchSeqRef.current) return;
      console.error('Error fetching unified market items:', e);
      setError(e.message || 'دریافت قیمت‌ها از سرور ناموفق بود.');
    } finally {
      if (seq === fetchSeqRef.current) {
        inFlightRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Background auto-refresh: every PRICE_REFRESH_INTERVAL_MS while the tab is visible, plus
  // an immediate refresh when the user comes back to a tab (or network) with stale data.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    const isStale = () =>
      !lastUpdatedAtRef.current || Date.now() - lastUpdatedAtRef.current >= PRICE_REFRESH_INTERVAL_MS;
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') fetchItems({ background: true });
    };
    const refreshIfStale = () => {
      if (document.visibilityState === 'visible' && isStale()) fetchItems({ background: true });
    };

    const timer = window.setInterval(refreshIfVisible, PRICE_REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', refreshIfStale);
    window.addEventListener('online', refreshIfStale);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshIfStale);
      window.removeEventListener('online', refreshIfStale);
    };
  }, [fetchItems]);

  const refresh = useCallback(() => fetchItems({ background: true }), [fetchItems]);

  // Compute live prices instantly whenever user edits USD or Gold spot
  const { resolvedAssets, priceMap, itemMap, summary } = useMemo(() => {
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

  const value = useMemo(() => ({
    loading,
    refreshing,
    error,
    lastUpdatedAt,
    marketItems,
    pricesData,
    resolvedAssets,
    priceMap,
    itemMap,
    summary,
    usdToman,
    setUsdToman,
    goldUsd,
    setGoldUsd,
    silverUsd,
    setSilverUsd,
    setManualOverride,
    getAssetPrice,
    getAsset,
    searchAssets,
    refresh,
    activeReferenceKey,
    activeReferenceRate,
    referenceRates,
    cycleReferenceRate,
    setReferenceRateKey,
    updateReferenceRates,
  }), [
    loading, refreshing, error, lastUpdatedAt, marketItems, pricesData, resolvedAssets, priceMap,
    itemMap, summary, usdToman, goldUsd, silverUsd, setManualOverride, getAssetPrice, getAsset,
    searchAssets, refresh, activeReferenceKey, activeReferenceRate, referenceRates,
    cycleReferenceRate, setReferenceRateKey, updateReferenceRates,
  ]);

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
