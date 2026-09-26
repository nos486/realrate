/**
 * PricingContext.jsx — Unified Pricing & Asset Catalog React Context
 * Feature: features/market
 *
 * Every price comes from the server's price book (GET /api/prices/book): tomans, one id per
 * asset, computed once on the server. The USD / ounce inputs below are the calculator's
 * "what if" rates for intrinsic value and bubble only — they never change a price.
 */

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef, useSyncExternalStore } from 'react';
import { getPriceBook } from '../api/marketApi.js';
import { searchUnifiedAssets } from '../../../utils/pricingEngine.js';
import { baseRatesOf, referenceRatesOf } from '../../../utils/priceBookViews.js';
import { bookToAssets, priceOf, assetOf } from '../priceBookAssets.js';
import { setKnownPriceIds } from '../knownPriceIds.js';

const PricingContext = createContext(null);

function subscribeOnlineStatus(onChange) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

function isBrowserOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** How often live prices are refreshed in the background while the tab is visible */
export const PRICE_REFRESH_INTERVAL_MS = 2 * 60 * 1000;

const REFERENCE_KEY_STORAGE = 'realrate_active_reference_rate';

function storedReferenceKey() {
  try {
    return localStorage.getItem(REFERENCE_KEY_STORAGE) || 'usd';
  } catch {
    return 'usd';
  }
}

export function PricingProvider({ children, initialUsdToman = null, initialGoldUsd = null }) {
  const [priceBook, setPriceBook] = useState(null);
  const [globalSettings, setGlobalSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isOffline = useSyncExternalStore(subscribeOnlineStatus, isBrowserOffline, () => false);

  // The calculator's rates: the live ones from the book, or what the user typed
  const [usdToman, setUsdToman] = useState(initialUsdToman || '');
  const [goldUsd, setGoldUsd] = useState(initialGoldUsd || '');
  const [silverUsd, setSilverUsd] = useState('');

  // Which reference rate (dollar, tether, …) the calculator starts from
  const [activeReferenceKey, setActiveReferenceKey] = useState(storedReferenceKey);

  // The reference rates, each at its price in the book
  const referenceRates = useMemo(() => referenceRatesOf(priceBook), [priceBook]);

  const activeReferenceRate = useMemo(() => {
    return referenceRates.find((r) => r.key === activeReferenceKey) || referenceRates[0] || null;
  }, [referenceRates, activeReferenceKey]);

  const setReferenceRateKey = useCallback((key) => {
    setActiveReferenceKey(key);
    try {
      localStorage.setItem(REFERENCE_KEY_STORAGE, key);
    } catch { }
    const targetRate = referenceRates.find((r) => r.key === key);
    if (targetRate && Number(targetRate.price) > 0) {
      const priceVal = Math.round(Number(targetRate.price));
      setUsdToman((prev) => (Number(prev) === priceVal ? prev : priceVal));
    }
    if (targetRate) window.dispatchEvent(new CustomEvent('realrate_reference_rate_changed', { detail: targetRate }));
    return targetRate || null;
  }, [referenceRates]);

  // Cycle to the next reference rate (dollar → tether → …)
  const cycleReferenceRate = useCallback(() => {
    if (referenceRates.length === 0) return null;
    const currentIdx = referenceRates.findIndex((r) => r.key === activeReferenceKey);
    const next = referenceRates[currentIdx === -1 ? 0 : (currentIdx + 1) % referenceRates.length];
    return next ? setReferenceRateKey(next.key) : null;
  }, [referenceRates, activeReferenceKey, setReferenceRateKey]);

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
   * Fetch the price book (one request: every price, plus the global settings).
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

      const res = await getPriceBook(background ? { silent: true } : {});
      if (seq !== fetchSeqRef.current) return;
      if (!res?.items) throw new Error('دریافت قیمت‌ها از سرور ناموفق بود.');

      const book = { updatedAt: res.updatedAt, items: res.items };
      setPriceBook(book);
      if (res.globalSettings) setGlobalSettings(res.globalSettings);
      setError(null);
      // Offline, the service worker answers with the last saved snapshot: show it, but don't
      // claim it was just updated
      if (!isBrowserOffline()) {
        const now = Date.now();
        lastUpdatedAtRef.current = now;
        setLastUpdatedAt(now);
      }

      // The calculator follows the live rates until the user types their own
      const base = baseRatesOf(book);
      const refs = referenceRatesOf(book);
      const matchedRef = refs.find((r) => r.key === storedReferenceKey()) || refs[0];
      const liveUsd = matchedRef?.price || base.usdToman;
      if (liveUsd && !manualOverrideRef.current.usd) {
        setUsdToman(liveUsd);
        if (matchedRef?.key) setActiveReferenceKey(matchedRef.key);
      }
      if (base.goldUsd && !manualOverrideRef.current.gold) setGoldUsd(base.goldUsd);
      if (base.silverUsd) setSilverUsd(base.silverUsd);
    } catch (e) {
      if (seq !== fetchSeqRef.current) return;
      console.error('Error fetching the price book:', e);
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

  // Every price is the book's; nothing here recomputes one
  const { assets: resolvedAssets, priceMap, itemMap } = useMemo(() => bookToAssets(priceBook), [priceBook]);

  // Code outside React (the vault's migration of stored ids) resolves ids against the book too
  useEffect(() => setKnownPriceIds(priceMap), [priceMap]);

  // The calculator's rates (what the user typed, or the live ones)
  const summary = useMemo(() => {
    const num = (v) => (typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) || 0 : Number(v || 0));
    return {
      usdToman: num(usdToman),
      goldUsd: num(goldUsd),
      silverUsd: num(silverUsd),
      totalAssetsCount: resolvedAssets.length,
    };
  }, [usdToman, goldUsd, silverUsd, resolvedAssets.length]);

  /** The price of any stored id (old id forms included) */
  const getAssetPrice = useCallback((id) => priceOf(priceMap, id), [priceMap]);

  /** The asset of any stored id (old id forms included) */
  const getAsset = useCallback((id) => assetOf(itemMap, id), [itemMap]);

  const searchAssets = useCallback((query, options) => {
    return searchUnifiedAssets(resolvedAssets, query, options);
  }, [resolvedAssets]);

  const value = useMemo(() => ({
    loading,
    refreshing,
    error,
    isOffline,
    lastUpdatedAt,
    priceBook,
    globalSettings,
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
  }), [
    loading, refreshing, error, isOffline, lastUpdatedAt, priceBook, globalSettings, resolvedAssets, priceMap,
    itemMap, summary, usdToman, goldUsd, silverUsd, setManualOverride, getAssetPrice, getAsset,
    searchAssets, refresh, activeReferenceKey, activeReferenceRate, referenceRates,
    cycleReferenceRate, setReferenceRateKey,
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
