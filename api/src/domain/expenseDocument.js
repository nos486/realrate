/**
 * expenseDocument.js — Expenses: sections (a project, ...) and the expenses recorded in them
 *
 * Both are end-to-end encrypted vault records ("expense_group" and "expense", the expense's
 * parent being its section), so validation runs in the browser; it lives here, shared, because the
 * planned server-side intake (bank SMS read by the Android app) will produce the same expense
 * shape.
 *
 * An expense is in tomans or in US dollars. A dollar expense may carry the toman rate of its day
 * (`usdRate`); totals in tomans use that rate, or today's rate when it is missing.
 *
 * Fields kept for what comes next, unused by the first version's screens:
 *  - section `type`: 'project' now; a 'daily' section will hold everyday spending
 *  - expense `category`: the daily expenses' categories
 *  - expense `source` ('manual' | 'sms') and `bankId`: expenses read from bank SMS
 */

import { isValidIsoDate } from './isoDate.js';

export const EXPENSE_CURRENCIES = [
  { value: 'IRT', label: 'تومان', symbol: 'تومان' },
  { value: 'USD', label: 'دلار', symbol: '$' },
];

export const EXPENSE_GROUP_TYPES = ['project'];
export const EXPENSE_SOURCES = ['manual', 'sms'];

export const EXPENSE_LIMITS = {
  nameLength: 80,
  titleLength: 120,
  notesLength: 500,
  categoryLength: 40,
  maxAmount: 1e15,
};

const CURRENCY_VALUES = new Set(EXPENSE_CURRENCIES.map((c) => c.value));
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const text = (v) => String(v ?? '').trim();

export function currencyLabel(currency) {
  return EXPENSE_CURRENCIES.find((c) => c.value === currency)?.label || 'تومان';
}

/**
 * Validate & normalize an expense section
 * @returns {{ value?: object, error?: string }}
 */
export function validateExpenseGroup(body = {}) {
  const name = text(body.name);
  if (!name) return { error: 'نام بخش الزامی است.' };
  if (name.length > EXPENSE_LIMITS.nameLength) return { error: `نام بخش نباید بیشتر از ${EXPENSE_LIMITS.nameLength} کاراکتر باشد.` };
  const notes = text(body.notes);
  if (notes.length > EXPENSE_LIMITS.notesLength) return { error: `توضیحات نباید بیشتر از ${EXPENSE_LIMITS.notesLength} کاراکتر باشد.` };
  const type = EXPENSE_GROUP_TYPES.includes(body.type) ? body.type : 'project';
  return { value: { name, type, notes, archived: Boolean(body.archived) } };
}

/**
 * Validate & normalize an expense
 * @returns {{ value?: object, error?: string }}
 */
export function validateExpense(body = {}) {
  const groupId = text(body.groupId);
  if (!ID_RE.test(groupId)) return { error: 'بخش این هزینه مشخص نشده است.' };

  const title = text(body.title);
  if (!title) return { error: 'عنوان هزینه الزامی است.' };
  if (title.length > EXPENSE_LIMITS.titleLength) return { error: `عنوان نباید بیشتر از ${EXPENSE_LIMITS.titleLength} کاراکتر باشد.` };

  const currency = CURRENCY_VALUES.has(body.currency) ? body.currency : 'IRT';
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > EXPENSE_LIMITS.maxAmount) {
    return { error: 'مبلغ هزینه باید عددی مثبت باشد.' };
  }

  const date = text(body.date);
  if (!isValidIsoDate(date)) return { error: 'تاریخ هزینه نامعتبر است.' };

  // The toman rate of the day, for dollar expenses only (optional)
  let usdRate = null;
  if (currency === 'USD' && body.usdRate !== null && body.usdRate !== undefined && body.usdRate !== '') {
    usdRate = Number(body.usdRate);
    if (!Number.isFinite(usdRate) || usdRate <= 0 || usdRate > EXPENSE_LIMITS.maxAmount) {
      return { error: 'نرخ دلار باید عددی مثبت باشد.' };
    }
  }

  const notes = text(body.notes);
  if (notes.length > EXPENSE_LIMITS.notesLength) return { error: `یادداشت نباید بیشتر از ${EXPENSE_LIMITS.notesLength} کاراکتر باشد.` };
  const category = text(body.category).slice(0, EXPENSE_LIMITS.categoryLength);
  const source = EXPENSE_SOURCES.includes(body.source) ? body.source : 'manual';
  const bankId = text(body.bankId).slice(0, 64);

  return { value: { groupId, title, amount, currency, date, usdRate, notes, category, source, bankId } };
}

/** Newest first; the same day by the time it was recorded */
export function compareExpensesByDate(a, b) {
  return String(b.date).localeCompare(String(a.date)) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
}

/**
 * An expense in tomans: as recorded, or a dollar amount at its own rate, else today's rate
 * @returns {number|null} null for a dollar expense with no rate at all
 */
export function expenseInToman(expense, usdToman = 0) {
  if (expense.currency !== 'USD') return expense.amount;
  const rate = expense.usdRate || usdToman;
  return rate > 0 ? expense.amount * rate : null;
}

/**
 * Totals of a list of expenses
 * @param {object[]} expenses
 * @param {{ usdToman?: number }} [options] today's dollar rate, for dollar expenses without one
 * @returns {{ count: number, toman: number, usd: number, totalToman: number,
 *   usesTodayRate: boolean, unpricedUsd: number, firstDate: string, lastDate: string }}
 *   `toman` / `usd`: the sums per currency as recorded; `totalToman`: everything in tomans;
 *   `usesTodayRate`: some dollar expense was converted at today's rate; `unpricedUsd`: dollars
 *   left out of `totalToman` because no rate is known
 */
export function summarizeExpenses(expenses = [], { usdToman = 0 } = {}) {
  const summary = { count: 0, toman: 0, usd: 0, totalToman: 0, usesTodayRate: false, unpricedUsd: 0, firstDate: '', lastDate: '' };
  for (const e of expenses) {
    summary.count++;
    if (e.currency === 'USD') {
      summary.usd += e.amount;
      if (!e.usdRate && usdToman > 0) summary.usesTodayRate = true;
    } else {
      summary.toman += e.amount;
    }
    const inToman = expenseInToman(e, usdToman);
    if (inToman === null) summary.unpricedUsd += e.amount;
    else summary.totalToman += inToman;
    if (!summary.firstDate || e.date < summary.firstDate) summary.firstDate = e.date;
    if (!summary.lastDate || e.date > summary.lastDate) summary.lastDate = e.date;
  }
  return summary;
}
