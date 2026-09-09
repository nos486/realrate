/**
 * useMarketData.js — Custom hook for fetching gold/currency market data
 * Calculations performed 100% on the client with zero latency
 */
import { useState, useEffect, useRef } from 'react';
import { apiGetPrices, apiGetSparklines } from '../api/client.js';
import { calculateMarketData } from '../utils/calculator.js';
import { formatThousands } from '../utils/formatters.js';

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
  const [rates, setRates] = useState(null);
  const [sparklines, setSparklines] = useState({});
  const [calcData, setCalcData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [usdToman, setUsdToman] = useState('');
  const [goldUsd, setGoldUsd] = useState('');

  // Track if usd was manually edited
  const userEditedUsd = useRef(false);

  // Load initial raw prices & 24h sparklines concurrently
  useEffect(() => {
    Promise.allSettled([apiGetPrices(), apiGetSparklines()])
      .then(([pricesRes, sparklinesRes]) => {
        if (pricesRes.status === 'fulfilled' && pricesRes.value?.success) {
          const data = pricesRes.value;
          setRates(data);
          const usd = data.live_usd_toman || data.globalSettings?.default_usd_toman || '';
          const gold = data.gold_usd || data.globalSettings?.default_gold_usd || 2890;
          setUsdToman(usd ? formatThousands(Math.round(usd), false) : '');
          setGoldUsd(gold ? formatThousands(gold, true) : '');
        }
        if (sparklinesRes.status === 'fulfilled' && sparklinesRes.value?.success && sparklinesRes.value?.sparklines) {
          setSparklines(sparklinesRes.value.sparklines);
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

  return {
    rates,
    sparklines,
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
