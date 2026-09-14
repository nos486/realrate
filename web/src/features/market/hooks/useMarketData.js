/**
 * useMarketData.js — Custom hook for fetching gold/currency market data
 * Calculations performed 100% on the client with zero latency
 */
import { useState, useEffect, useRef } from 'react';
import { getPrices } from '../api/marketApi.js';
import { calculateMarketData } from '../../../utils/calculator.js';
import { formatThousands } from '../../../utils/formatters.js';
import { usePricing } from '../context/PricingContext.jsx';

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
  const [rates, setRates] = useState(null);
  const [calcData, setCalcData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [usdToman, setUsdToman] = useState('');
  const [goldUsd, setGoldUsd] = useState('');

  // Track if usd was manually edited
  const userEditedUsd = useRef(false);

  // Sync when pricing.usdToman or activeReferenceKey changes externally (e.g. via cycleReferenceRate)
  useEffect(() => {
    if (pricing?.usdToman) {
      const priceNum = typeof pricing.usdToman === 'string'
        ? parseNum(pricing.usdToman)
        : Number(pricing.usdToman);
      if (priceNum > 0) {
        userEditedUsd.current = false;
        setUsdToman(formatThousands(Math.round(priceNum), false));
      }
    }
  }, [pricing?.usdToman, pricing?.activeReferenceKey]);

  // Load initial raw prices from market API
  useEffect(() => {
    getPrices()
      .then((data) => {
        if (data && data.success) {
          setRates(data);

          if (data.reference_rates && pricing?.updateReferenceRates) {
            pricing.updateReferenceRates(data.reference_rates);
          }

          const storedKey = (() => {
            try {
              return localStorage.getItem('realrate_active_reference_rate') || 'usd';
            } catch {
              return 'usd';
            }
          })();

          const availableRefs = data.reference_rates || data.prices?.reference_rates || [];
          const matchedRef = availableRefs.find((r) => r.key === storedKey) || availableRefs[0];

          const usd = matchedRef?.price || data.live_usd_toman || data.prices?.usd_toman?.price || data.prices?.usd?.price || data.globalSettings?.default_usd_toman || '';
          const gold = data.gold_usd || data.prices?.ons_gold?.price || data.globalSettings?.default_gold_usd || 2890;
          setUsdToman(usd ? formatThousands(Math.round(usd), false) : '');
          setGoldUsd(gold ? formatThousands(gold, true) : '');
          if (pricing?.setUsdToman && usd) pricing.setUsdToman(Math.round(usd));
          if (pricing?.setGoldUsd && gold) pricing.setGoldUsd(gold);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Instant client-side calculation whenever inputs or rates change (0ms, zero network lag)
  useEffect(() => {
    const usdNum = parseNum(usdToman);
    const goldNum = parseNum(goldUsd);
    if (!usdNum || usdNum <= 0) return;

    if (pricing?.setUsdToman && pricing.usdToman !== usdNum) {
      pricing.setUsdToman(usdNum);
    }
    if (pricing?.setGoldUsd && goldNum > 0 && pricing.goldUsd !== goldNum) {
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
  }, [pricing?.activeReferenceKey]);

  const currentRefKey = internalRefKey || pricing?.activeReferenceKey || 'usd';

  const availableReferenceRates = useMemo(() => {
    if (rates?.reference_rates && Array.isArray(rates.reference_rates) && rates.reference_rates.length > 0) {
      return rates.reference_rates;
    }
    if (pricing?.referenceRates && Array.isArray(pricing.referenceRates) && pricing.referenceRates.length > 0) {
      return pricing.referenceRates;
    }
    const defaultUsdPrice = Number(rates?.live_usd_toman || rates?.prices?.usd_toman?.price || 231500);
    const defaultUsdtPrice = Number(rates?.prices?.usdt?.price || 233205);
    return [
      { key: 'usd', priceType: 'usd', label: 'دلار آزاد', shortLabel: 'دلار', symbol: '$', price: defaultUsdPrice },
      { key: 'usdt', priceType: 'USDT', label: 'دلار تتر', shortLabel: 'تتر', symbol: '₮', price: defaultUsdtPrice },
    ];
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

  return {
    rates,
    calcData,
    loading,
    usdToman,
    goldUsd,
    setUsdToman: (v) => { userEditedUsd.current = true; setUsdToman(v); },
    setGoldUsd,
    liveUsdSource: rates?.live_usd_toman ? 'live' : 'manual',
    liveUsdDatetime: rates?.live_usd_item?.datetime || null,
    referenceRates: availableReferenceRates,
    activeReferenceKey: currentRefKey,
    activeReferenceRate,
    cycleReferenceRate,
  };
}
