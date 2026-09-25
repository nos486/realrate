/**
 * recurringIncome.js — Fixed (recurring) incomes: validation and due occurrences
 *
 * A rule says "this income arrives on day D of every N Shamsi months, starting at a date". The
 * browser turns due occurrences into ordinary income entries (so it works the same for
 * encrypted accounts) and records the last date it generated in `generatedThrough`, so an entry
 * the user deletes is never re-created. Shared by the API and the browser.
 */

import { INCOME_CATEGORIES } from '../config/constants.js';
import { isValidIsoDate } from './isoDate.js';
import { gregorianToJalali, jalaliToGregorian, getJalaliMonthLength } from './loanCalculator.js';

export const RECURRING_INTERVALS = [
  { months: 1, label: 'هر ماه' },
  { months: 2, label: 'هر ۲ ماه' },
  { months: 3, label: 'هر ۳ ماه' },
  { months: 6, label: 'هر ۶ ماه' },
  { months: 12, label: 'هر سال' },
];

export const RECURRING_LIMITS = {
  titleLength: 120,
  notesLength: 500,
  /** At most this many entries are created in one catch-up (a long-unused account) */
  maxCatchUp: 36,
};

const INTERVAL_VALUES = new Set(RECURRING_INTERVALS.map((i) => i.months));
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const text = (v) => String(v ?? '').trim();

/** Shamsi day of month of an ISO date */
export function shamsiDayOf(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return gregorianToJalali(y, m, d).jd;
}

export function intervalLabel(months) {
  return RECURRING_INTERVALS.find((i) => i.months === Number(months))?.label || `هر ${months} ماه`;
}

/** Whether `value` is usable as a recurring-rule id on an income entry ('' = not recurring) */
export function isRecurringId(value) {
  return value === '' || ID_RE.test(String(value));
}

/**
 * Validate & normalize a recurring income rule.
 * @returns {{ value?: object, error?: string }}
 */
export function validateRecurringIncome(body = {}) {
  const title = text(body.title);
  if (!title) return { error: 'عنوان درآمد ثابت الزامی است.' };
  if (title.length > RECURRING_LIMITS.titleLength) return { error: `عنوان نباید بیشتر از ${RECURRING_LIMITS.titleLength} کاراکتر باشد.` };

  const category = INCOME_CATEGORIES.includes(body.category) ? body.category : 'other';

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'مبلغ درآمد ثابت باید عددی بزرگتر از صفر باشد.' };

  const startDate = text(body.startDate);
  if (!isValidIsoDate(startDate)) return { error: 'تاریخ اولین دریافت نامعتبر است.' };

  const endDate = text(body.endDate);
  if (endDate && (!isValidIsoDate(endDate) || endDate < startDate)) return { error: 'تاریخ پایان باید بعد از تاریخ شروع باشد.' };

  const intervalMonths = Number(body.intervalMonths ?? 1);
  if (!INTERVAL_VALUES.has(intervalMonths)) return { error: 'دوره تکرار نامعتبر است.' };

  const dayOfMonth = body.dayOfMonth === undefined || body.dayOfMonth === '' ? shamsiDayOf(startDate) : Number(body.dayOfMonth);
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) return { error: 'روز دریافت باید بین ۱ تا ۳۱ باشد.' };

  const notes = text(body.notes);
  if (notes.length > RECURRING_LIMITS.notesLength) return { error: `یادداشت نباید بیشتر از ${RECURRING_LIMITS.notesLength} کاراکتر باشد.` };

  const generatedThrough = text(body.generatedThrough);
  if (generatedThrough && !isValidIsoDate(generatedThrough)) return { error: 'وضعیت تولید خودکار نامعتبر است.' };

  return {
    value: {
      title,
      category,
      amount,
      startDate,
      endDate,
      intervalMonths,
      dayOfMonth,
      notes,
      active: body.active === undefined ? true : Boolean(body.active),
      generatedThrough,
    },
  };
}

const pad = (n) => String(n).padStart(2, '0');

/** Occurrence `index` (0 = the start's month) as an ISO date; the day is clamped to the month */
function occurrenceDate(rule, index) {
  const [y, m, d] = rule.startDate.split('-').map(Number);
  const start = gregorianToJalali(y, m, d);
  const monthIndex = start.jm - 1 + index * rule.intervalMonths;
  const jy = start.jy + Math.floor(monthIndex / 12);
  const jm = (monthIndex % 12) + 1;
  const jd = Math.min(rule.dayOfMonth, getJalaliMonthLength(jy, jm));
  const g = jalaliToGregorian(jy, jm, jd);
  return `${g.year}-${pad(g.month)}-${pad(g.day)}`;
}

/**
 * Dates this rule should have produced by `today` and has not produced yet (oldest first,
 * capped at RECURRING_LIMITS.maxCatchUp). Paused rules produce nothing.
 * @param {object} rule validated rule
 * @param {string} today ISO date
 * @returns {string[]}
 */
export function dueOccurrences(rule, today) {
  if (!rule?.active || !isValidIsoDate(rule.startDate) || !isValidIsoDate(today)) return [];
  const dates = [];
  for (let i = 0; i < 1200 && dates.length < RECURRING_LIMITS.maxCatchUp; i++) {
    const date = occurrenceDate(rule, i);
    if (date > today || (rule.endDate && date > rule.endDate)) break;
    // The start's own month can fall before the start date (e.g. start on the 20th, day 5)
    if (date < rule.startDate) continue;
    if (rule.generatedThrough && date <= rule.generatedThrough) continue;
    dates.push(date);
  }
  return dates;
}

/** The next date this rule will produce after `today`, or null (paused / ended) */
export function nextOccurrence(rule, today) {
  if (!rule?.active || !isValidIsoDate(rule.startDate)) return null;
  for (let i = 0; i < 1200; i++) {
    const date = occurrenceDate(rule, i);
    if (rule.endDate && date > rule.endDate) return null;
    if (date > today && date >= rule.startDate) return date;
  }
  return null;
}
