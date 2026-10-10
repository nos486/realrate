/**
 * useFxRates.js — The toman rates of the foreign currencies other than the dollar (euro, lira,
 * dirham: utils/currencies.js) a screen's records are in, today and on any day
 *
 * The dollar keeps its own pair (`usdToman`, and `usdAt` from dailyHistory.js) since it is also the
 * app's reference currency; a screen spreads these into the same rates bag:
 *   const rates = { usdToman, usdAt, ...useFxRates(expenses) }
 * Today's rate is the price book's (PricingContext); a past day's comes from that currency's daily
 * price history, loaded only for the currencies the records are in (one request each, cached).
 */

import { useMemo } from 'react';
import { usePricing } from './context/PricingContext.jsx';
import { useDailyHistory } from './dailyHistory.js';
import { currencyOf, otherCurrenciesOf } from '../../utils/currencies.js';

const priceIdOf = (code) => currencyOf(code).priceId;

/**
 * @param {Array<{ currency?: string }>} [records] what the screen converts (only their currencies load)
 * @param {boolean} [enabled] false: nothing is loaded
 * @returns {{ rateToday: (code: string) => number, rateAt: (code: string, isoDate: string) => number|null }}
 */
export function useFxRates(records = [], enabled = true) {
  const pricing = usePricing();
  const getAssetPrice = pricing?.getAssetPrice;
  const signature = enabled ? otherCurrenciesOf(records).join(',') : '';
  const ids = useMemo(() => (signature ? signature.split(',').map(priceIdOf) : []), [signature]);
  const { priceAt } = useDailyHistory(ids);
  return useMemo(() => ({
    rateToday: (code) => Number(getAssetPrice?.(priceIdOf(code))) || 0,
    rateAt: (code, isoDate) => priceAt(priceIdOf(code), isoDate),
  }), [getAssetPrice, priceAt]);
}
