/**
 * useMarketData.js — Custom hook for fetching gold/currency market data
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiGetRates, apiCalculate } from '../api/client.js';

export function useMarketData() {
  const [rates, setRates] = useState(null);
  const [calcData, setCalcData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [usdToman, setUsdToman] = useState('');
  const [goldUsd, setGoldUsd] = useState('');

  // Track if usd was manually edited
  const userEditedUsd = useRef(false);

  // Load initial rates
  useEffect(() => {
    apiGetRates()
      .then(data => {
        if (data.success) {
          setRates(data);
          const usd = data.live_usd_toman || data.globalSettings?.default_usd_toman || '';
          const gold = data.gold_usd || data.globalSettings?.default_gold_usd || 2700;
          setUsdToman(usd ? String(Math.round(usd)) : '');
          setGoldUsd(String(gold));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

function parseNum(val) {
  if (!val) return 0;
  const pers = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  let s = String(val);
  for (let i = 0; i < 10; i++) {
    s = s.replace(new RegExp(pers[i], 'g'), i);
  }
  return parseFloat(s.replace(/,/g, '')) || 0;
}

  // Re-calculate whenever inputs change
  const calculate = useCallback(async (usd, gold) => {
    const usdNum = parseNum(usd);
    const goldNum = parseNum(gold);
    if (!usdNum || usdNum <= 0 || !goldNum) return;

    try {
      const data = await apiCalculate(usdNum, goldNum, { silent: true });
      if (data.success) setCalcData(data);
    } catch (e) {
      console.error('Calculate error:', e);
    }
  }, []);

  // Debounce calculate on input changes
  useEffect(() => {
    if (!usdToman || !goldUsd) return;
    const timer = setTimeout(() => calculate(usdToman, goldUsd), 300);
    return () => clearTimeout(timer);
  }, [usdToman, goldUsd, calculate]);

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
  };
}
