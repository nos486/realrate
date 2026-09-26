/**
 * useMarketData.js — The home calculator's inputs and results
 *
 * Prices come from the price book (PricingContext). The dollar and ounce rates here are the
 * calculator's: they follow the live rates until the user types their own, and only decide
 * intrinsic values and bubbles.
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { calculateMarketData } from '../../../utils/calculator.js';
import { formatThousands } from '../../../shared/utils/formatters.js';
import { usePricing } from '../context/PricingContext.jsx';
import { BASE_PRICE_IDS } from '../../../utils/priceBook.js';

function parseNum(val) {
  if (!val) return 0;
  const pers = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  let s = String(val);
  for (let i = 0; i < 10; i++) {
    s = s.replace(new RegExp(pers[i], 'g'), i);
  }
  return parseFloat(s.replace(/,/g, '')) || 0;
}

export function useMarketData() {
  const pricing = usePricing();
  const book = pricing?.priceBook || null;
  const loading = Boolean(pricing?.loading) && !book;
  const [usdToman, setUsdToman] = useState('');
  const [goldUsd, setGoldUsd] = useState('');

  // Track if usd / gold were manually edited
  const userEditedUsd = useRef(false);
  const userEditedGold = useRef(false);

  // Follow the shared rate when it changes elsewhere (a reference rate switch, a background refresh)
  useEffect(() => {
    if (pricing?.usdToman) {
      const priceNum = typeof pricing.usdToman === 'string'
        ? parseNum(pricing.usdToman)
        : Number(pricing.usdToman);
      if (priceNum > 0) {
        userEditedUsd.current = false;
        const formatted = formatThousands(Math.round(priceNum), false);
        setUsdToman((prev) => (prev === formatted ? prev : formatted));
      }
    }
  }, [pricing?.usdToman, pricing?.activeReferenceKey]);

  // Same for the ounce price, unless the user typed their own
  useEffect(() => {
    if (userEditedGold.current) return;
    const goldNum = typeof pricing?.goldUsd === 'string' ? parseNum(pricing.goldUsd) : Number(pricing?.goldUsd || 0);
    if (goldNum > 0) {
      const formatted = formatThousands(goldNum, true);
      setGoldUsd((prev) => (prev === formatted ? prev : formatted));
    }
  }, [pricing?.goldUsd]);

  // Only values the user typed flow back into the shared context. Pushing every local value back
  // would ping-pong with background refreshes: the context gets the new live price while this
  // hook still holds the previous one, and each side keeps resetting the other.
  useEffect(() => {
    const usdNum = parseNum(usdToman);
    const goldNum = parseNum(goldUsd);
    if (userEditedUsd.current && usdNum > 0 && pricing?.setUsdToman && pricing.usdToman !== usdNum) {
      pricing.setUsdToman(usdNum);
    }
    if (userEditedGold.current && goldNum > 0 && pricing?.setGoldUsd && pricing.goldUsd !== goldNum) {
      pricing.setGoldUsd(goldNum);
    }
    // `pricing` is read for its latest values and written only for user-typed input
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usdToman, goldUsd]);

  const globalSettings = pricing?.globalSettings || null;
  const silverUsd = pricing?.silverUsd;
  const calcData = useMemo(() => {
    const data = calculateMarketData({
      usdToman: parseNum(usdToman),
      goldUsd: parseNum(goldUsd),
      silverUsd: Number(silverUsd) || 0,
      book,
      globalSettings: globalSettings || {},
    });
    return data.success ? data : null;
  }, [usdToman, goldUsd, silverUsd, book, globalSettings]);

  const referenceRates = useMemo(() => pricing?.referenceRates || [], [pricing?.referenceRates]);
  const activeReferenceKey = pricing?.activeReferenceKey || 'usd';
  const activeReferenceRate = pricing?.activeReferenceRate || null;

  const selectReferenceRate = useCallback((targetKey) => {
    const targetRate = referenceRates.find((r) => r.key === targetKey);
    if (!targetRate) return null;
    userEditedUsd.current = false;
    pricing?.setManualOverride?.({ usd: false });
    const roundedPrice = Math.round(Number(targetRate.price));
    if (roundedPrice > 0) {
      const formatted = formatThousands(roundedPrice, false);
      setUsdToman((prev) => (prev === formatted ? prev : formatted));
    }
    pricing?.setReferenceRateKey?.(targetRate.key);
    return targetRate;
  }, [referenceRates, pricing]);

  const cycleReferenceRate = useCallback(() => {
    if (referenceRates.length === 0) return null;
    const currentIdx = referenceRates.findIndex((r) => r.key === activeReferenceKey);
    const next = referenceRates[(currentIdx + 1) % referenceRates.length];
    return next ? selectReferenceRate(next.key) : null;
  }, [referenceRates, activeReferenceKey, selectReferenceRate]);

  const usdItem = book?.items?.[BASE_PRICE_IDS.usd] || null;

  return {
    calcData,
    globalSettings,
    loading,
    usdToman,
    goldUsd,
    setUsdToman: (v) => {
      userEditedUsd.current = true;
      pricing?.setManualOverride?.({ usd: true });
      setUsdToman(v);
    },
    setGoldUsd: (v) => {
      userEditedGold.current = true;
      pricing?.setManualOverride?.({ gold: true });
      setGoldUsd(v);
    },
    liveUsdSource: usdItem ? 'live' : 'manual',
    liveUsdDatetime: usdItem?.updatedAt || null,
    referenceRates,
    activeReferenceKey,
    activeReferenceRate,
    cycleReferenceRate,
    selectReferenceRate,
    setReferenceRateKey: selectReferenceRate,
  };
}
