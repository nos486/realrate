/**
 * flowYear.js — Money in or out (incomes, expenses) by Shamsi month and year, for their pages
 *
 * Both pages show one Shamsi month at a time, or a whole Shamsi year; their charts run from the
 * start of the year. Each page turns its records into points `{ date, amount, category }`
 * (amount in tomans, only what counts toward the totals) and these helpers do the rest.
 */

import { shamsiMonthOf, shamsiMonthRange, shiftShamsiMonth } from '../../utils/expenseDocument.js';
import { PERSIAN_MONTHS } from '../../features/portfolio/components/ShamsiDatePicker.jsx';

export { shamsiMonthOf, shamsiMonthRange, shiftShamsiMonth };

export const monthIndex = ({ jy, jm }) => jy * 12 + jm;

/** "مهر ۱۴۰۵" */
export function formatShamsiMonth(jy, jm) {
  return `${PERSIAN_MONTHS[jm - 1]?.label || ''} ${Number(jy).toLocaleString('fa-IR', { useGrouping: false })}`;
}

export const formatShamsiYear = (jy) => Number(jy).toLocaleString('fa-IR', { useGrouping: false });

/** The Gregorian days of a Shamsi year (inclusive) */
export function shamsiYearRange(jy) {
  return { from: shamsiMonthRange(jy, 1).from, to: shamsiMonthRange(jy, 12).to };
}

/**
 * What a page loads for a year: the year itself and the month before it (last year's Esfand), so
 * Farvardin can be compared with the month before as every other month is
 */
export function flowWindow(jy) {
  return { from: shamsiMonthRange(jy - 1, 12).from, to: shamsiMonthRange(jy, 12).to };
}

/**
 * The year month by month: one entry per month (through `throughMonth`, e.g. the current month
 * of this year), each with its total, count, total per category and the change from the month
 * before (Farvardin against last year's Esfand when those points are given)
 * @param {Array<{ date: string, amount: number, category?: string }>} points
 * @param {number} jy
 * @param {{ throughMonth?: number }} [options]
 * @returns {Array<{ key: string, jy: number, jm: number, label: string, monthLabel: string,
 *   total: number, count: number, byCategory: Record<string, number>, change: number|null }>}
 */
export function buildYearSeries(points, jy, { throughMonth = 12 } = {}) {
  const last = Math.min(12, Math.max(1, throughMonth));
  const slots = new Map();
  const slot = (y, m) => {
    const key = `${y}/${m}`;
    if (!slots.has(key)) slots.set(key, { total: 0, count: 0, byCategory: {} });
    return slots.get(key);
  };
  for (const p of points || []) {
    if (!p?.date) continue;
    const { jy: y, jm: m } = shamsiMonthOf(p.date);
    if (!(y === jy || (y === jy - 1 && m === 12))) continue;
    const s = slot(y, m);
    const amount = Number(p.amount) || 0;
    const category = p.category || 'other';
    s.total += amount;
    s.count += 1;
    s.byCategory[category] = (s.byCategory[category] || 0) + amount;
  }
  const series = [];
  let prevTotal = slots.get(`${jy - 1}/12`)?.total ?? 0;
  for (let jm = 1; jm <= last; jm++) {
    const s = slots.get(`${jy}/${jm}`) || { total: 0, count: 0, byCategory: {} };
    series.push({
      key: `${jy}/${String(jm).padStart(2, '0')}`,
      jy,
      jm,
      label: formatShamsiMonth(jy, jm),
      monthLabel: PERSIAN_MONTHS[jm - 1]?.label || '',
      total: s.total,
      count: s.count,
      byCategory: s.byCategory,
      change: prevTotal > 0 ? ((s.total - prevTotal) / prevTotal) * 100 : null,
    });
    prevTotal = s.total;
  }
  return series;
}

/**
 * The year's headline figures
 * @param {ReturnType<typeof buildYearSeries>} series
 * @returns {{ total: number, count: number, months: number, monthlyAverage: number,
 *   top: object|null, low: object|null, byCategory: Array<{ category: string, total: number }> }}
 *   months: the months shown (so far this year); top / low: the months with the most / least
 *   (of those with any)
 */
export function summarizeYear(series) {
  const total = series.reduce((sum, m) => sum + m.total, 0);
  const count = series.reduce((sum, m) => sum + m.count, 0);
  const withData = series.filter((m) => m.total > 0);
  const byCat = new Map();
  for (const m of series) {
    for (const [category, value] of Object.entries(m.byCategory)) byCat.set(category, (byCat.get(category) || 0) + value);
  }
  return {
    total,
    count,
    months: series.length,
    monthlyAverage: series.length ? total / series.length : 0,
    top: withData.reduce((a, m) => (!a || m.total > a.total ? m : a), null),
    low: withData.reduce((a, m) => (!a || m.total < a.total ? m : a), null),
    byCategory: [...byCat.entries()].map(([category, value]) => ({ category, total: value })).sort((a, b) => b.total - a.total),
  };
}

/**
 * Days of the month counted so far (all of a past month's), and the day the month before is cut
 * at so a month still running is compared with the same number of days
 * @param {{ jy: number, jm: number }} month
 * @param {string} today ISO day
 */
export function monthProgress(month, today) {
  const range = shamsiMonthRange(month.jy, month.jm);
  const current = monthIndex(shamsiMonthOf(today)) === monthIndex(month);
  const days = current ? Math.max(1, Math.round((Date.parse(today) - Date.parse(range.from)) / 86_400_000) + 1) : range.days;
  const prev = shiftShamsiMonth(month, -1);
  const prevRange = shamsiMonthRange(prev.jy, prev.jm);
  const cutoff = current
    ? new Date(Date.parse(prevRange.from) + (days - 1) * 86_400_000).toISOString().slice(0, 10)
    : prevRange.to;
  return { range, prevRange, current, days, cutoff };
}
