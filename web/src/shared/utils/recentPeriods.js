/**
 * recentPeriods.js — "Last N months" periods for date-filtered lists (incomes, transactions)
 *
 * A period becomes a Gregorian `from` date, which the server filters on (records keep their
 * primary date in plaintext), so only that window is ever fetched.
 */

import { todayIso } from './dates.js';

export const RECENT_PERIODS = [
  { value: '1m', label: 'ماه اخیر', months: 1 },
  { value: '3m', label: '۳ ماه اخیر', months: 3 },
  { value: '6m', label: '۶ ماه اخیر', months: 6 },
  { value: '1y', label: 'یک سال اخیر', months: 12 },
  { value: 'all', label: 'همه', months: null },
];

export const DEFAULT_RECENT_PERIOD = '6m';

/** Months a period covers (null for all) */
export function periodMonths(period) {
  return RECENT_PERIODS.find((p) => p.value === period)?.months ?? null;
}

/**
 * First day (YYYY-MM-DD) of the last `months` months up to `today`, e.g. 3 months before
 * 2026-09-26 is 2026-06-27. A day past the end of the target month clamps to its last day.
 * @param {number|null} months
 * @param {string} [today] YYYY-MM-DD
 * @returns {string} '' for no limit
 */
export function monthsAgo(months, today = todayIso()) {
  if (!months) return '';
  const [y, m, d] = today.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  target.setUTCDate(target.getUTCDate() + 1);
  return target.toISOString().slice(0, 10);
}

/** `from` date of a period ('' for all) */
export function periodFrom(period, today = todayIso()) {
  return monthsAgo(periodMonths(period), today);
}
