/**
 * useMarketData.js — Custom hook for fetching gold/currency market data
 * Calculations performed 100% on the client with zero latency
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { calculateMarketData } from '../../../utils/calculator.js';
import { formatThousands } from '../../../shared/utils/formatters.js';
import { usePricing } from '../context/PricingContext.jsx';
import { getReferenceRatesSpecs } from '../../../config/sources.config.js';

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
  // The /api/prices snapshot is fetched (and auto-refreshed) once by PricingContext
  const rates = pricing?.pricesData || null;
  const loading = Boolean(pricing?.loading) && !rates;
  const [calcData, setCalcData] = useState(null);
  const [usdToman, setUsdToman] = useState('');
  const [goldUsd, setGoldUsd] = useState('');

  // Track if usd / gold were manually edited
  const userEditedUsd = useRef(false);
  const userEditedGold = useRef(false);

  // Sync when pricing.usdToman or activeReferenceKey changes externally (e.g. via cycleReferenceRate
  // or a background refresh)
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

  // Instant client-side calculation whenever inputs or rates change (0ms, zero network lag)
  useEffect(() => {
    const usdNum = parseNum(usdToman);
    const goldNum = parseNum(goldUsd);
    if (!usdNum || usdNum <= 0) return;

    // Only values the user typed flow back into the shared context. Pushing every local value
    // back would ping-pong with background refreshes: the context gets the new live price
    // while this effect still sees the previous local one, and each side keeps resetting the
    // other on every render.
    if (userEditedUsd.current && pricing?.setUsdToman && pricing.usdToman !== usdNum) {
      pricing.setUsdToman(usdNum);
    }
    if (userEditedGold.current && pricing?.setGoldUsd && goldNum > 0 && pricing.goldUsd !== goldNum) {
      pricing.setGoldUsd(goldNum);
    }

    const data = calculateMarketData({
      usdToman: usdNum,
      goldUsd: goldNum,
      silverUsd: rates?.silver_usd,
      marketPrices: rates?.prices || rates?.market_prices || {},
      forex: rates?.forex || {},
      globalSettings: rates?.globalSettings || {},
    });

    if (data.success) {
      setCalcData(data);
    }
    // Recalculate on input/snapshot changes only. `pricing` is read for its latest values and
    // written back only for user-typed input; depending on it would rerun the whole calculation
    // on every context update (e.g. each background refresh) for no change in the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usdToman, goldUsd, rates]);

  // Active reference rate key with resilient local state
  const [internalRefKey, setInternalRefKey] = useState(() => {
    try {
      return localStorage.getItem('realrate_active_reference_rate') || 'usd';
    } catch {
      return 'usd';
    }
  });

  // Sync internalRefKey if pricing.activeReferenceKey changes
  useEffect(() => {
    if (pricing?.activeReferenceKey && pricing.activeReferenceKey !== internalRefKey) {
      setInternalRefKey(pricing.activeReferenceKey);
    }
  }, [pricing?.activeReferenceKey, internalRefKey]);

  const currentRefKey = internalRefKey || pricing?.activeReferenceKey || 'usd';

  const availableReferenceRates = useMemo(() => {
    if (rates?.reference_rates && Array.isArray(rates.reference_rates) && rates.reference_rates.length > 0) {
      return rates.reference_rates;
    }
    if (pricing?.referenceRates && Array.isArray(pricing.referenceRates) && pricing.referenceRates.length > 0) {
      return pricing.referenceRates;
    }
    return getReferenceRatesSpecs().map((spec) => ({
      ...spec,
      price: spec.key === 'usd'
        ? Number(rates?.live_usd_toman || rates?.prices?.usd_toman?.price || 0)
        : Number(rates?.prices?.[spec.key]?.price || rates?.prices?.[spec.priceType?.toLowerCase()]?.price || 0),
    }));
  }, [rates?.reference_rates, rates?.live_usd_toman, rates?.prices, pricing?.referenceRates]);

  const activeReferenceRate = useMemo(() => {
    return availableReferenceRates.find((r) => r.key === currentRefKey) || availableReferenceRates[0] || null;
  }, [availableReferenceRates, currentRefKey]);

  const cycleReferenceRate = useCallback(() => {
    if (!availableReferenceRates || availableReferenceRates.length === 0) return null;
    const currentIdx = availableReferenceRates.findIndex((r) => r.key === currentRefKey);
    const nextIdx = (currentIdx + 1) % availableReferenceRates.length;
    const nextRate = availableReferenceRates[nextIdx];

    if (nextRate) {
      userEditedUsd.current = false;
      pricing?.setManualOverride?.({ usd: false });
      setInternalRefKey(nextRate.key);
      try {
        localStorage.setItem('realrate_active_reference_rate', nextRate.key);
      } catch { }

      if (pricing?.setReferenceRateKey) {
        pricing.setReferenceRateKey(nextRate.key);
      }
      if (Number(nextRate.price) > 0) {
        const roundedPrice = Math.round(Number(nextRate.price));
        setUsdToman(formatThousands(roundedPrice, false));
        if (pricing?.setUsdToman) {
          pricing.setUsdToman(roundedPrice);
        }
      }
      return nextRate;
    }
    return null;
  }, [availableReferenceRates, currentRefKey, pricing]);

  const selectReferenceRate = useCallback((targetKey) => {
    if (!availableReferenceRates || availableReferenceRates.length === 0) return null;
    const targetRate = availableReferenceRates.find((r) => r.key === targetKey);

    if (targetRate) {
      userEditedUsd.current = false;
      pricing?.setManualOverride?.({ usd: false });
      setInternalRefKey(targetRate.key);
      try {
        localStorage.setItem('realrate_active_reference_rate', targetRate.key);
      } catch { }

      const roundedPrice = Math.round(Number(targetRate.price));
      if (roundedPrice > 0) {
        const formatted = formatThousands(roundedPrice, false);
        setUsdToman((prev) => (prev === formatted ? prev : formatted));
      }

      if (pricing?.setReferenceRateKey) {
        pricing.setReferenceRateKey(targetRate.key);
      }
      return targetRate;
    }
    return null;
  }, [availableReferenceRates, pricing]);

  return {
    rates,
    calcData,
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
    liveUsdSource: rates?.live_usd_toman ? 'live' : 'manual',
    liveUsdDatetime: rates?.live_usd_item?.datetime || null,
    referenceRates: availableReferenceRates,
    activeReferenceKey: currentRefKey,
    activeReferenceRate,
    cycleReferenceRate,
    selectReferenceRate,
    setReferenceRateKey: selectReferenceRate,
  };
}
