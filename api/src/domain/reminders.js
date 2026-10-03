/**
 * reminders.js — Plaintext reminder index metadata and occurrence schedule calculation
 *
 * RealRate financial records (loans, cheques, fixed incomes) are client-side encrypted in the
 * vault. To deliver due-date reminders (via server email cron, local notifications, or Web Push)
 * without ever decrypting or leaking financial values, each due record maintains a minimal,
 * plaintext reminder row:
 *
 *   {
 *     kind: 'loan' | 'cheque' | 'recurring_income',
 *     recordId: string,
 *     dueDate: 'YYYY-MM-DD',  // next unpaid date (Gregorian)
 *     intervalMonths: 0..12,  // 0 = one-off (cheques); >0 = repeats (loan installments, fixed incomes)
 *     remaining: 0..600 | null, // occurrences left including dueDate; null for open-ended
 *     direction: 'issued' | 'received' | '', // cheques only, and only if explicitly opted-in
 *     muted: boolean,         // per-record reminder disable flag
 *   }
 *
 * This module provides pure functions shared between the server and the web app:
 * - validateReminder: strict normalization and schema validation
 * - reminderOf: derives the reminder row from a decrypted record
 * - occurrencesBetween: rolls occurrences forward across any date window using Jalali month clamping
 */

import { isValidIsoDate } from './isoDate.js';
import {
  gregorianToJalali,
  jalaliToGregorian,
  getJalaliMonthLength,
  parseDateParts,
} from './loanCalculator.js';
import { buildLoanView } from './loanDocument.js';
import { isChequeOpen } from './chequeDocument.js';
import { dueOccurrences, nextOccurrence } from './recurringIncome.js';

export const REMINDER_KINDS = ['loan', 'cheque', 'recurring_income'];
const RECORD_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n) => String(n).padStart(2, '0');

/**
 * Validate and normalize a reminder object.
 * @param {object} input
 * @returns {{ value?: object, error?: string }}
 */
export function validateReminder(input) {
  if (!input || typeof input !== 'object') {
    return { error: 'داده‌های یادآوری نامعتبر است.' };
  }

  const kind = String(input.kind || '').trim();
  if (!REMINDER_KINDS.includes(kind)) {
    return { error: 'نوع یادآوری نامعتبر است.' };
  }

  const recordId = String(input.recordId || input.record_id || '').trim();
  if (!RECORD_ID_RE.test(recordId)) {
    return { error: 'شناسه رکورد یادآوری نامعتبر است.' };
  }

  const dueDate = String(input.dueDate || input.due_date || '').trim();
  if (!ISO_DATE_RE.test(dueDate) || !isValidIsoDate(dueDate)) {
    return { error: 'تاریخ سررسید یادآوری نامعتبر است.' };
  }

  const intervalRaw = input.intervalMonths ?? input.interval_months ?? 0;
  const intervalMonths = Number(intervalRaw);
  if (!Number.isInteger(intervalMonths) || intervalMonths < 0 || intervalMonths > 12) {
    return { error: 'فاصله تکرار یادآوری باید بین ۰ تا ۱۲ ماه باشد.' };
  }

  let remaining = null;
  const rawRemaining = input.remaining;
  if (rawRemaining !== null && rawRemaining !== undefined && rawRemaining !== '') {
    const num = Number(rawRemaining);
    if (!Number.isInteger(num) || num < 0 || num > 600) {
      return { error: 'تعداد دفعات باقی‌مانده باید بین ۰ تا ۶۰۰ باشد.' };
    }
    remaining = num;
  }

  let direction = '';
  if (kind === 'cheque') {
    const dir = String(input.direction || '').trim();
    if (dir === 'issued' || dir === 'received') {
      direction = dir;
    } else if (dir !== '') {
      return { error: 'جهت چک در یادآوری نامعتبر است.' };
    }
  }

  const muted = Boolean(input.muted);

  return {
    value: {
      kind,
      recordId,
      dueDate,
      intervalMonths,
      remaining,
      direction,
      muted,
    },
  };
}

/**
 * Derives a minimal plaintext reminder row from a decrypted record. Pure.
 * Returns null if no reminder is needed (loan fully paid, cheque closed, inactive rule).
 *
 * @param {'loan'|'cheque'|'recurring_income'} kind
 * @param {object} plainRecord
 * @param {{ includeDirection?: boolean }} [options]
 * @returns {object|null}
 */
export function reminderOf(kind, plainRecord, { includeDirection = false } = {}) {
  if (!plainRecord || typeof plainRecord !== 'object') return null;

  if (kind === 'loan') {
    const view = plainRecord.loan ? buildLoanView(plainRecord) : plainRecord;
    const unpaid = (view.installments || []).filter((i) => !i.isPaid);
    if (unpaid.length === 0) return null;

    const nextInst = unpaid[0];
    const dueDate = nextInst.dueDate;
    if (!dueDate || !ISO_DATE_RE.test(dueDate)) return null;

    const interval = Math.max(0, parseInt(view.intervalMonths ?? view.interval_months, 10) || 1);
    const muted = Boolean(plainRecord.loan?.remindersMuted ?? plainRecord.remindersMuted ?? false);
    const recordId = String(view.id || plainRecord.loan?.id || plainRecord.id || '');

    return {
      kind: 'loan',
      recordId,
      dueDate,
      intervalMonths: interval,
      remaining: unpaid.length,
      direction: '',
      muted,
    };
  }

  if (kind === 'cheque') {
    if (!isChequeOpen(plainRecord)) return null;

    const dueDate = String(plainRecord.dueDate || '').trim();
    if (!ISO_DATE_RE.test(dueDate) || !isValidIsoDate(dueDate)) return null;

    const direction = includeDirection ? (plainRecord.direction === 'issued' || plainRecord.direction === 'received' ? plainRecord.direction : '') : '';
    const muted = Boolean(plainRecord.remindersMuted);
    const recordId = String(plainRecord.id || '');

    return {
      kind: 'cheque',
      recordId,
      dueDate,
      intervalMonths: 0,
      remaining: 1,
      direction,
      muted,
    };
  }

  if (kind === 'recurring_income') {
    if (plainRecord.active === false) return null;

    // Find the next occurrence date after generatedThrough or startDate
    let nextDate = null;
    const startDate = plainRecord.startDate;
    if (!startDate || !isValidIsoDate(startDate)) return null;

    if (plainRecord.generatedThrough) {
      // Find the first occurrence after generatedThrough
      nextDate = nextOccurrence(plainRecord, plainRecord.generatedThrough);
    } else {
      // Find the earliest occurrence >= startDate
      const dates = dueOccurrences(plainRecord, '9999-12-31');
      if (dates && dates.length > 0) {
        nextDate = dates[0];
      } else {
        nextDate = nextOccurrence(plainRecord, startDate);
      }
    }

    if (!nextDate) return null;
    if (plainRecord.endDate && nextDate > plainRecord.endDate) return null;

    const interval = Math.max(1, parseInt(plainRecord.intervalMonths, 10) || 1);
    const muted = Boolean(plainRecord.remindersMuted);
    const recordId = String(plainRecord.id || '');

    return {
      kind: 'recurring_income',
      recordId,
      dueDate: nextDate,
      intervalMonths: interval,
      remaining: null,
      direction: '',
      muted,
    };
  }

  return null;
}

/**
 * Step k intervals (in Jalali calendar) forward from a Gregorian ISO date, clamping to month end.
 * @param {string} baseIsoDate
 * @param {number} k
 * @param {number} intervalMonths
 * @returns {string} Gregorian YYYY-MM-DD
 */
function stepJalaliMonths(baseIsoDate, k, intervalMonths) {
  if (k === 0 || intervalMonths === 0) return baseIsoDate;

  const parsed = parseDateParts(baseIsoDate);
  const startJ = gregorianToJalali(parsed.year, parsed.month, parsed.day);

  const totalMonths = (startJ.jm - 1) + (k * intervalMonths);
  const targetJy = startJ.jy + Math.floor(totalMonths / 12);
  const targetJm = ((totalMonths % 12) + 12) % 12 + 1;

  const maxDay = getJalaliMonthLength(targetJy, targetJm);
  const targetJd = Math.min(startJ.jd, maxDay);

  const g = jalaliToGregorian(targetJy, targetJm, targetJd);
  return `${String(g.year).padStart(4, '0')}-${pad(g.month)}-${pad(g.day)}`;
}

/**
 * Returns all due dates in [from, to], rolling forward by intervalMonths while remaining allows.
 * Month arithmetic clamps to the month's last day in the Jalali calendar (matches loan calculator).
 *
 * @param {{ dueDate: string, intervalMonths: number, remaining?: number|null }} reminder
 * @param {string} from 'YYYY-MM-DD'
 * @param {string} to 'YYYY-MM-DD'
 * @returns {string[]}
 */
export function occurrencesBetween(reminder, from, to) {
  if (!reminder || !reminder.dueDate || !from || !to || from > to) return [];

  const { dueDate, intervalMonths = 0, remaining = null } = reminder;
  if (!ISO_DATE_RE.test(dueDate) || !isValidIsoDate(dueDate)) return [];

  const maxSteps = remaining !== null && remaining !== undefined ? remaining : 1200;
  if (maxSteps <= 0) return [];

  const results = [];

  if (intervalMonths === 0) {
    if (dueDate >= from && dueDate <= to) {
      results.push(dueDate);
    }
    return results;
  }

  for (let k = 0; k < maxSteps; k++) {
    const occ = stepJalaliMonths(dueDate, k, intervalMonths);
    if (occ > to) break;
    if (occ >= from && occ <= to) {
      results.push(occ);
    }
  }

  return results;
}
