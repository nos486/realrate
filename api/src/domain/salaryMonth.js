/**
 * salaryMonth.js — The «ماه حقوقی»: a month that starts the day the salary arrives, not on the 1st
 *
 * The user marks the days salary was received (`starts`, Gregorian YYYY-MM-DD). Each mark starts
 * the Shamsi month it is named for: a mark on day 16 or later opens the month that follows (a
 * salary on 25 Shahrivar starts Mehr), an earlier one opens the month it is in. A month without
 * a mark starts on its 1st, and every month ends the day before the next one starts, so the
 * months stay in a row with no gap or overlap. Without marks this is the calendar month.
 *
 * Pure and shared by the browser and the API, like the other domain modules.
 */

import { shamsiMonthRange, shiftShamsiMonth, shamsiMonthOf } from './expenseDocument.js';
import { gregorianToJalali } from './loanCalculator.js';
import { isValidIsoDate } from './isoDate.js';

/** A mark on this Shamsi day or later starts the next month */
export const SALARY_NEXT_MONTH_FROM_DAY = 16;
export const SALARY_RECORD_KIND = 'salary_month';
export const SALARY_RECORD_ID = 'main';
const MAX_STARTS = 600;
const DAY_MS = 86_400_000;

const shiftDay = (iso, delta) => new Date(Date.parse(iso) + delta * DAY_MS).toISOString().slice(0, 10);

/** The Shamsi month a salary received on `isoDay` starts */
export function salaryMonthOf(isoDay) {
  const [y, m, d] = String(isoDay).split('-').map(Number);
  const { jy, jm, jd } = gregorianToJalali(y, m, d);
  return jd >= SALARY_NEXT_MONTH_FROM_DAY ? shiftShamsiMonth({ jy, jm }, 1) : { jy, jm };
}

/** The first day of a month: its latest mark, else the 1st */
function startOf({ jy, jm }, starts) {
  let found = '';
  for (const day of starts) {
    const label = salaryMonthOf(day);
    if (label.jy === jy && label.jm === jm && day > found) found = day;
  }
  return found || shamsiMonthRange(jy, jm).from;
}

/**
 * The days of a month (inclusive) when it starts at the salary
 * @param {number} jy
 * @param {number} jm
 * @param {string[]} [starts] the marked days
 * @returns {{ from: string, to: string, days: number }}
 */
export function salaryMonthRange(jy, jm, starts = []) {
  if (!starts.length) return shamsiMonthRange(jy, jm);
  const from = startOf({ jy, jm }, starts);
  const next = startOf(shiftShamsiMonth({ jy, jm }, 1), starts);
  const to = next > from ? shiftDay(next, -1) : from;
  return { from, to, days: Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1 };
}

/**
 * Which month each day falls in when months start at the salary, for grouping many records: a
 * function of an ISO day that works out each month's range once. Without marks: the calendar's.
 * @param {string[]} [starts] the marked days
 * @returns {(isoDay: string) => { jy: number, jm: number }}
 */
export function salaryMonthLocator(starts = []) {
  if (!starts.length) return shamsiMonthOf;
  const ranges = new Map();
  const rangeOf = (month) => {
    const key = month.jy * 12 + month.jm;
    if (!ranges.has(key)) ranges.set(key, salaryMonthRange(month.jy, month.jm, starts));
    return ranges.get(key);
  };
  return (isoDay) => {
    const calendar = shamsiMonthOf(isoDay);
    // A day belongs to its calendar month, the next (a salary after the 15th) or the one before
    for (const delta of [0, 1, -1]) {
      const month = shiftShamsiMonth(calendar, delta);
      const { from, to } = rangeOf(month);
      if (isoDay >= from && isoDay <= to) return month;
    }
    return calendar;
  };
}

/** The month `today` falls in when months start at the salary */
export function currentSalaryMonth(today, starts = []) {
  return salaryMonthLocator(starts)(today);
}

/**
 * The days of a year (inclusive) when its months start at the salary: from Farvardin's first day
 * to Esfand's last
 */
export function salaryYearRange(jy, starts = []) {
  return { from: salaryMonthRange(jy, 1, starts).from, to: salaryMonthRange(jy, 12, starts).to };
}

/**
 * The stored record: the marked days, newest first, one per day
 * @returns {{ value?: { starts: string[] }, error?: string }}
 */
export function validateSalaryMonths(body = {}) {
  const raw = Array.isArray(body?.starts) ? body.starts : [];
  const starts = [...new Set(raw.filter((d) => typeof d === 'string' && isValidIsoDate(d)))].sort().reverse();
  if (starts.length > MAX_STARTS) return { error: 'too many salary days' };
  return { value: { starts } };
}
