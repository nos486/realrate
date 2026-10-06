/**
 * PricingContext.jsx — Unified Pricing & Asset Catalog React Context
 * Feature: features/market
 *
 * Every price comes from the server's price book (GET /api/prices/book): tomans, one id per
 * asset, computed once on the server. The USD / ounce inputs below are the calculator's
 * "what if" rates for intrinsic value and bubble only — they never change a price.
 */

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef, useSyncExternalStore } from 'react';
import { getCorePriceBook, getPriceCatalog } from '../api/marketApi.js';
import { searchUnifiedAssets } from '../../../utils/pricingEngine.js';
import { baseRatesOf } from '../../../utils/priceBookViews.js';
import { bookToAssets, priceOf, assetOf } from '../priceBookAssets.js';
import { setKnownPriceIds } from '../knownPriceIds.js';
import { useRefreshHandler } from '../../../shared/refresh/pageRefresh.js';

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

/*
 * Prices are read when the app opens, and then only with the rest of a tab that shows them
 * (shared/refresh/pageRefresh.js, scope `prices`): the header's refresh button and the window
 * getting focus again. Never on a timer, and never by switching tabs.
 */

// A dollar rate picked by hand in an earlier version (the old «نرخ مبنا»): forgotten
try {
  if (typeof localStorage !== 'undefined') localStorage.removeItem('realrate_active_reference_rate');
} catch { /* storage unavailable */ }

export function PricingProvider({ children, initialUsdToman = null, initialGoldUsd = null }) {
  const [priceBook, setPriceBook] = useState(null);
  const [globalSettings, setGlobalSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isOffline = useSyncExternalStore(subscribeOnlineStatus, isBrowserOffline, () => false);

  // The calculator's rates: always the live ones from the book
  const [usdToman, setUsdToman] = useState(initialUsdToman || '');
  const [goldUsd, setGoldUsd] = useState(initialGoldUsd || '');
  const [silverUsd, setSilverUsd] = useState('');

  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSeqRef = useRef(0);
  const inFlightRef = useRef(false);
  const lastUpdatedAtRef = useRef(null);
  // The catalog part (exchange symbols, funds…): read again only when its version moves
  const catalogRef = useRef(null);

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

      const requestOptions = background ? { silent: true } : {};
      const res = await getCorePriceBook(requestOptions);
      if (seq !== fetchSeqRef.current) return;
      if (!res?.items) throw new Error('دریافت قیمت‌ها از سرور ناموفق بود.');

      // The catalogs change about once an hour: loaded only when the core book names a new version
      if (res.catalogVersion && catalogRef.current?.version !== res.catalogVersion) {
        try {
          const catalog = await getPriceCatalog(requestOptions);
          if (catalog?.items) catalogRef.current = { version: catalog.version || res.catalogVersion, items: catalog.items };
        } catch (err) {
          // The last catalog stays (or none yet): the core prices still show
          console.warn('Loading the catalog prices failed:', err);
        }
        if (seq !== fetchSeqRef.current) return;
      }

      const book = { updatedAt: res.updatedAt, items: { ...(catalogRef.current?.items || {}), ...res.items } };
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

      // The calculator uses the live dollar and ounce
      const base = baseRatesOf(book);
      if (base.usdToman) setUsdToman(base.usdToman);
      if (base.goldUsd) setGoldUsd(base.goldUsd);
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

  // The first read failed without a connection: read once the connection is back (an update
  // after that waits for the button or the window's focus)
  const hasBookRef = useRef(false);
  useEffect(() => {
    hasBookRef.current = Boolean(priceBook);
  }, [priceBook]);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onOnline = () => {
      if (!hasBookRef.current) fetchItems({ background: true });
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [fetchItems]);

  const refresh = useCallback(() => fetchItems({ background: true }), [fetchItems]);
  // A tab showing prices reads them again on its refresh
  useRefreshHandler('prices', refresh);

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
    goldUsd,
    silverUsd,
    getAssetPrice,
    getAsset,
    searchAssets,
    refresh,
  }), [
    loading, refreshing, error, isOffline, lastUpdatedAt, priceBook, globalSettings, resolvedAssets, priceMap,
    itemMap, summary, usdToman, goldUsd, silverUsd, getAssetPrice, getAsset, searchAssets, refresh,
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
