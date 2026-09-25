/**
 * incomeReport.js — Pure helpers that turn a list of incomes into report figures
 *
 * Incomes are stored with a Gregorian ISO `incomeDate`, but every period (month / year) here is a
 * Shamsi one, since that is the calendar users reason about their income in.
 */

import { PERSIAN_MONTHS, gregorianToShamsi, getTodayShamsi } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { INCOME_CATEGORIES } from '../constants/incomeCategories.js';

export const INCOME_PERIODS = [
  { value: 'all', label: 'همه' },
  { value: 'year', label: 'امسال' },
  { value: 'month', label: 'ماه جاری' },
];

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
 * Keep only the incomes that fall within the given period (relative to today, Shamsi)
 * @param {Array<object>} incomes
 * @param {'all'|'year'|'month'} period
 * @param {string} [todayShamsi] - injectable for deterministic callers
 */
export function filterIncomesByPeriod(incomes, period, todayShamsi = getTodayShamsi()) {
  if (period === 'all') return incomes;
  const today = parseShamsiYearMonth(todayShamsi);
  if (!today) return incomes;

  return incomes.filter((income) => {
    const ym = getShamsiYearMonth(income.incomeDate);
    if (!ym || ym.year !== today.year) return false;
    return period === 'year' || ym.month === today.month;
  });
}

/**
 * Aggregate incomes into the figures shown on the report
 * @param {Array<object>} incomes
 * @returns {{
 *   total: number,
 *   count: number,
 *   monthlyAverage: number,
 *   largest: object | null,
 *   byCategory: Array<{ category: string, total: number, count: number, share: number }>,
 *   byMonth: Array<{ key: string, label: string, total: number, count: number }>,
 * }}
 */
export function buildIncomeReport(incomes) {
  let total = 0;
  let largest = null;
  const categoryTotals = new Map();
  const monthTotals = new Map();

  for (const income of incomes) {
    const amount = Number(income.amount) || 0;
    total += amount;
    if (!largest || amount > Number(largest.amount)) largest = income;

    const cat = categoryTotals.get(income.category) || { total: 0, count: 0 };
    cat.total += amount;
    cat.count += 1;
    categoryTotals.set(income.category, cat);

    const ym = getShamsiYearMonth(income.incomeDate);
    if (ym) {
      const index = ym.year * 12 + (ym.month - 1);
      const month = monthTotals.get(index) || { ...ym, index, total: 0, count: 0 };
      month.total += amount;
      month.count += 1;
      monthTotals.set(index, month);
    }
  }

  const byCategory = INCOME_CATEGORIES
    .filter((c) => categoryTotals.has(c.value))
    .map((c) => {
      const { total: catTotal, count } = categoryTotals.get(c.value);
      return { category: c.value, total: catTotal, count, share: total > 0 ? (catTotal / total) * 100 : 0 };
    })
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
 * Income per Shamsi month over the last `months` months, ending with the current one (oldest
 * first). Months without income are included as zero so the chart shows real gaps and trends.
 * @param {Array<object>} incomes
 * @param {number} [months]
 * @param {string} [todayShamsi] - injectable for deterministic callers
 * @returns {Array<{ key: string, label: string, monthLabel: string, total: number, count: number }>}
 */
export function buildMonthlySeries(incomes, months = 12, todayShamsi = getTodayShamsi()) {
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
    });
  }

  for (const income of incomes) {
    const ym = getShamsiYearMonth(income.incomeDate);
    if (!ym) continue;
    const slot = series[ym.year * 12 + (ym.month - 1) - first];
    if (!slot) continue;
    slot.total += Number(income.amount) || 0;
    slot.count += 1;
  }
  return series;
}
