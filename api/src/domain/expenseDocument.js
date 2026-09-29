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
 * Section `type`: 'project' (a project, a trip, ...) or 'daily' — the one section per user that
 * holds everyday spending, each expense in a category (DAILY_EXPENSE_CATEGORIES) and shown
 * month by month.
 *
 * An expense may say which account paid it (`accountId`, an accountDocument.js account).
 * Budgets: a project section may carry a total `budget` (tomans); the daily section carries
 * `budgets`, a monthly budget per category plus `total` for the whole month.
 *
 * An expense read from a bank SMS (bankSms.js) has `source: 'sms'`, the bank's `bankId`, the
 * message's `smsFingerprint` and the transaction's `smsKey` (so it is not recorded twice).
 */

import { isValidIsoDate } from './isoDate.js';
import { jalaliToGregorian, getJalaliMonthLength, gregorianToJalali } from './loanCalculator.js';

export const EXPENSE_CURRENCIES = [
  { value: 'IRT', label: 'تومان', symbol: 'تومان' },
  { value: 'USD', label: 'دلار', symbol: '$' },
];

export const EXPENSE_GROUP_TYPES = ['project', 'daily'];

/** Name of the daily section, created the first time an everyday expense is recorded */
export const DAILY_GROUP_NAME = 'هزینه‌های روزمره';

/** Categories of everyday expenses (display icons and colors live in the web app) */
export const DAILY_EXPENSE_CATEGORIES = [
  { value: 'groceries', label: 'خوراک و خواربار' },
  { value: 'dining', label: 'رستوران و کافه' },
  { value: 'transport', label: 'رفت‌وآمد و سوخت' },
  { value: 'bills', label: 'قبوض و شارژ' },
  { value: 'housing', label: 'مسکن و اجاره' },
  { value: 'shopping', label: 'خرید و پوشاک' },
  { value: 'health', label: 'سلامت و درمان' },
  { value: 'education', label: 'آموزش' },
  { value: 'entertainment', label: 'تفریح و سفر' },
  { value: 'subscriptions', label: 'اینترنت و اشتراک‌ها' },
  { value: 'gifts', label: 'هدیه و خیریه' },
  { value: 'other', label: 'سایر' },
];

const CATEGORY_VALUES = new Set(DAILY_EXPENSE_CATEGORIES.map((c) => c.value));
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

  // A project's total budget (tomans), or none
  const budget = parseBudget(body.budget);
  if (budget === undefined) return { error: 'بودجه باید عددی مثبت باشد.' };

  // The daily section's monthly budgets: per category and `total`
  const budgets = {};
  if (type === 'daily' && body.budgets && typeof body.budgets === 'object') {
    for (const [key, raw] of Object.entries(body.budgets)) {
      if (key !== 'total' && !CATEGORY_VALUES.has(key)) continue;
      const amount = parseBudget(raw);
      if (amount === undefined) return { error: 'بودجه باید عددی مثبت باشد.' };
      if (amount !== null) budgets[key] = amount;
    }
  }

  return {
    value: {
      name,
      type,
      notes,
      archived: Boolean(body.archived),
      budget: type === 'project' ? budget : null,
      budgets,
    },
  };
}

/** A budget amount: a positive number, null for none, undefined when invalid */
function parseBudget(raw) {
  if (raw === null || raw === undefined || raw === '' || raw === 0) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= EXPENSE_LIMITS.maxAmount ? n : undefined;
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
  // A known category, or none (project expenses)
  const category = CATEGORY_VALUES.has(body.category) ? body.category : '';
  const source = EXPENSE_SOURCES.includes(body.source) ? body.source : 'manual';
  const bankId = text(body.bankId).slice(0, 64);
  const accountId = ID_RE.test(text(body.accountId)) ? text(body.accountId) : '';
  const smsFingerprint = source === 'sms' && /^[0-9a-f]{8}$/.test(text(body.smsFingerprint)) ? text(body.smsFingerprint) : '';
  const smsKey = source === 'sms' ? text(body.smsKey).slice(0, 120) : '';

  return { value: { groupId, title, amount, currency, date, usdRate, notes, category, source, bankId, accountId, smsFingerprint, smsKey } };
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

/**
 * Per-category totals in tomans, largest first (expenses without a category count as 'other')
 * @returns {Array<{ category: string, totalToman: number, count: number }>}
 */
export function summarizeByCategory(expenses = [], { usdToman = 0 } = {}) {
  const byCategory = new Map();
  for (const e of expenses) {
    const key = e.category || 'other';
    const entry = byCategory.get(key) || { category: key, totalToman: 0, count: 0 };
    entry.totalToman += expenseInToman(e, usdToman) || 0;
    entry.count++;
    byCategory.set(key, entry);
  }
  return [...byCategory.values()].sort((a, b) => b.totalToman - a.totalToman);
}

const pad = (n) => String(n).padStart(2, '0');
const isoOf = ({ year, month, day }) => `${year}-${pad(month)}-${pad(day)}`;

/**
 * The Gregorian days of a Shamsi month (inclusive), for filtering expenses by their date
 * @returns {{ from: string, to: string, days: number }}
 */
export function shamsiMonthRange(jy, jm) {
  const days = getJalaliMonthLength(jy, jm);
  return { from: isoOf(jalaliToGregorian(jy, jm, 1)), to: isoOf(jalaliToGregorian(jy, jm, days)), days };
}

/** The Shamsi month `delta` months away */
export function shiftShamsiMonth({ jy, jm }, delta) {
  const index = jy * 12 + (jm - 1) + delta;
  return { jy: Math.floor(index / 12), jm: (index % 12) + 1 };
}

/** The Shamsi month of a Gregorian YYYY-MM-DD day */
export function shamsiMonthOf(isoDay) {
  const [y, m, d] = String(isoDay).split('-').map(Number);
  const { jy, jm } = gregorianToJalali(y, m, d);
  return { jy, jm };
}

/**
 * Per-account totals in tomans, largest first (expenses without an account under '')
 * @returns {Array<{ accountId: string, totalToman: number, count: number }>}
 */
export function summarizeByAccount(expenses = [], { usdToman = 0 } = {}) {
  const byAccount = new Map();
  for (const e of expenses) {
    const key = e.accountId || '';
    const entry = byAccount.get(key) || { accountId: key, totalToman: 0, count: 0 };
    entry.totalToman += expenseInToman(e, usdToman) || 0;
    entry.count++;
    byAccount.set(key, entry);
  }
  return [...byAccount.values()].sort((a, b) => b.totalToman - a.totalToman);
}
