/**
 * incomeReport.js — Pure helpers that turn a list of incomes into report figures
 *
 * Incomes are stored with a Gregorian ISO `incomeDate`, but every period (month / year) here is a
 * Shamsi one, since that is the calendar users reason about their income in. Every figure is in
 * tomans: a foreign income at its currency's rate on its day (utils/incomeDocument.js, the rates
 * bag of utils/currencies.js).
 */

import { PERSIAN_MONTHS, gregorianToShamsi, getTodayShamsi } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { incomeInToman } from '../../../utils/incomeDocument.js';

/** An income in tomans (0 for a foreign one whose rate is unknown) */
const tomanOf = (income, rates) => incomeInToman(income, rates) || 0;

/**
 * Split a Shamsi "YYYY/MM/DD" string into numeric parts
 * @param {string} shamsi
 * @returns {{ year: number, month: number } | null}
 */
function parseShamsiYearMonth(shamsi) {
  const [year, month] = String(shamsi || '').split('/').map((p) => parseInt(p, 10));
  if (!year || !month) return null;
  return { year, month };
}

/**
 * Shamsi year & month of an ISO income date. The date is parsed as LOCAL midnight so the day
 * never shifts across a timezone boundary.
 * @param {string} isoDate - YYYY-MM-DD
 */
export function getShamsiYearMonth(isoDate) {
  if (!isoDate) return null;
  return parseShamsiYearMonth(gregorianToShamsi(`${isoDate}T00:00:00`));
}

/**
 * Human label for a Shamsi month, e.g. "مهر ۱۴۰۵"
 */
export function formatShamsiMonth(year, month) {
  const monthLabel = PERSIAN_MONTHS[month - 1]?.label || '';
  return `${monthLabel} ${Number(year).toLocaleString('fa-IR', { useGrouping: false })}`;
}

/**
 * Aggregate incomes into the figures shown on the report (in tomans)
 * @param {Array<object>} incomes
 * @param {object} [rates] the rates bag (utils/currencies.js), for foreign incomes
 * @returns {{
 *   total: number,
 *   count: number,
 *   monthlyAverage: number,
 *   largest: object | null,
 *   byCategory: Array<{ category: string, total: number, count: number, share: number }>,
 *   byMonth: Array<{ key: string, label: string, total: number, count: number }>,
 * }}
 */
export function buildIncomeReport(incomes, rates = {}) {
  let total = 0;
  let largest = null;
  const categoryTotals = new Map();
  const monthTotals = new Map();

  for (const income of incomes) {
    const amount = tomanOf(income, rates);
    total += amount;
    if (!largest || amount > tomanOf(largest, rates)) largest = income;

    const key = income.category || 'other';
    const cat = categoryTotals.get(key) || { total: 0, count: 0 };
    cat.total += amount;
    cat.count += 1;
    categoryTotals.set(key, cat);

    const ym = getShamsiYearMonth(income.incomeDate);
    if (ym) {
      const index = ym.year * 12 + (ym.month - 1);
      const month = monthTotals.get(index) || { ...ym, index, total: 0, count: 0 };
      month.total += amount;
      month.count += 1;
      monthTotals.set(index, month);
    }
  }

  // Every category used, the user's own included
  const byCategory = [...categoryTotals.entries()]
    .map(([category, { total: catTotal, count }]) => (
      { category, total: catTotal, count, share: total > 0 ? (catTotal / total) * 100 : 0 }
    ))
    .sort((a, b) => b.total - a.total);

  const months = [...monthTotals.values()].sort((a, b) => b.index - a.index);
  const byMonth = months.map((m) => ({
    key: `${m.year}/${String(m.month).padStart(2, '0')}`,
    label: formatShamsiMonth(m.year, m.month),
    total: m.total,
    count: m.count,
  }));

  // Average over the whole span from the first to the last month with income (inclusive), so
  // months with no income count as zero rather than being silently skipped.
  const monthSpan = months.length > 0 ? months[0].index - months[months.length - 1].index + 1 : 0;
  const monthlyAverage = monthSpan > 0 ? total / monthSpan : 0;

  return { total, count: incomes.length, monthlyAverage, largest, byCategory, byMonth };
}

/**
 * Shamsi months from the oldest income's month through the current one (at least 1)
 * @param {Array<object>} incomes
 * @param {string} [todayShamsi]
 */
export function monthsSpanned(incomes, todayShamsi = getTodayShamsi()) {
  const today = parseShamsiYearMonth(todayShamsi);
  if (!today) return 1;
  const last = today.year * 12 + (today.month - 1);
  let first = last;
  for (const income of incomes) {
    const ym = getShamsiYearMonth(income.incomeDate);
    if (ym) first = Math.min(first, ym.year * 12 + (ym.month - 1));
  }
  return last - first + 1;
}

/**
 * Income per Shamsi month over the last `months` months, ending with the current one (oldest
 * first). Months without income are included as zero so the chart shows real gaps and trends.
 * @param {Array<object>} incomes
 * @param {number} [months]
 * @param {string} [todayShamsi] - injectable for deterministic callers
 * @param {object} [rates] the rates bag (utils/currencies.js), for foreign incomes
 * @returns {Array<{ key: string, label: string, monthLabel: string, total: number, count: number,
 *   byCategory: Record<string, number> }>} byCategory: amount per income category that month
 */
export function buildMonthlySeries(incomes, months = 12, todayShamsi = getTodayShamsi(), rates = {}) {
  const today = parseShamsiYearMonth(todayShamsi);
  if (!today) return [];
  const last = today.year * 12 + (today.month - 1);
  const first = last - months + 1;

  const series = [];
  for (let index = first; index <= last; index++) {
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    series.push({
      key: `${year}/${String(month).padStart(2, '0')}`,
      label: formatShamsiMonth(year, month),
      monthLabel: PERSIAN_MONTHS[month - 1]?.label || '',
      total: 0,
      count: 0,
      byCategory: {},
    });
  }

  for (const income of incomes) {
    const ym = getShamsiYearMonth(income.incomeDate);
    if (!ym) continue;
    const slot = series[ym.year * 12 + (ym.month - 1) - first];
    if (!slot) continue;
    const amount = tomanOf(income, rates);
    slot.total += amount;
    slot.count += 1;
    slot.byCategory[income.category] = (slot.byCategory[income.category] || 0) + amount;
  }
  return series;
}
