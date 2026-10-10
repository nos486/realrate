/**
 * useDayRate.js — A currency's toman rate on a form's day, read from its daily price history, for
 * the forms of records in a foreign currency (an expense, an income): shown, never stored
 *
 * Today's is the live rate passed in (`todayRate`); a past day's comes from the history
 * (features/market/dailyHistory.js: that day's close, the last one before a quiet day).
 */

import { useEffect, useState } from 'react';
import { priceOnDay } from '../../features/market/dailyHistory.js';
import { currencyOf, isForeignCurrency } from '../../utils/currencies.js';
import { todayIso } from '../utils/dates.js';

/**
 * @param {string} currency the record's currency
 * @param {string} isoDate its day (YYYY-MM-DD; '' while the date is incomplete)
 * @param {number} [todayRate] today's live rate of the currency
 * @returns {{ rate: number, state: null|'loading'|'filled'|'missing' }} rate: 0 while unknown;
 *   state: null for tomans (no rate) or no day
 */
export function useDayRate(currency, isoDate, todayRate = 0) {
  const foreign = isForeignCurrency(currency);
  const priceId = currencyOf(currency).priceId;
  // Today's live rate needs no history
  const live = foreign && isoDate && isoDate === todayIso() && todayRate > 0;
  const key = foreign && isoDate && !live ? `${priceId}|${isoDate}` : '';
  const [day, setDay] = useState({ key: '', rate: 0 });

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    priceOnDay(priceId, isoDate).then((rate) => {
      if (!cancelled) setDay({ key, rate: rate > 0 ? Math.round(rate) : 0 });
    });
    return () => {
      cancelled = true;
    };
  }, [key, priceId, isoDate]);

  if (live) return { rate: Math.round(todayRate), state: 'filled' };
  if (!key) return { rate: 0, state: null };
  if (day.key !== key) return { rate: 0, state: 'loading' };
  return { rate: day.rate, state: day.rate > 0 ? 'filled' : 'missing' };
}
