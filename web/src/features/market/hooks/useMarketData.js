/**
 * useMarketData.js — The home calculator's results (intrinsic values, bubbles) at the live rates
 *
 * Prices come from the price book (PricingContext); the dollar and ounce rates are its live ones.
 */
import { useMemo } from 'react';
import { calculateMarketData } from '../../../utils/calculator.js';
import { usePricing } from '../context/PricingContext.jsx';

export function useMarketData() {
  const pricing = usePricing();
  const book = pricing?.priceBook || null;
  const loading = Boolean(pricing?.loading) && !book;
  const usdToman = Number(pricing?.usdToman) || 0;
  const goldUsd = Number(pricing?.goldUsd) || 0;
  const silverUsd = Number(pricing?.silverUsd) || 0;
  const globalSettings = pricing?.globalSettings || null;

  const calcData = useMemo(() => {
    const data = calculateMarketData({ usdToman, goldUsd, silverUsd, book, globalSettings: globalSettings || {} });
    return data.success ? data : null;
  }, [usdToman, goldUsd, silverUsd, book, globalSettings]);

  return { calcData, globalSettings, loading, usdToman, goldUsd };
}
