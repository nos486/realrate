/**
 * creditAccount.js — A bank credit line as one of the user's accounts («اعتبار بانکی»): its limit
 * and what is owed on it — and nothing the app assumes about the bank's rules
 *
 * Credits differ (a fixed pay day, a period from the first purchase, a fee or none), so the app
 * keeps no rules: the user records what happened, and the fee of each step is worked out on the
 * spot from the amounts they enter and kept with that record.
 *
 *   - Spending from the credit: an ordinary expense paid from it (`accountId`), counted as an
 *     expense on the day of the purchase. Cash taken out of it: a transfer from it.
 *   - «تسویه بدهی»: a transfer from another account into the credit of what was actually paid,
 *     its `fee` the part beyond the debt settled (settlementOf) — and that fee as an expense of
 *     its own (category CREDIT_COST_CATEGORY, `creditAccountId`), paid from the same account.
 *   - «تبدیل به قسط»: the user turns an amount of the debt into installments, each with its own
 *     day and amount, as the bank set them (`credit.conversions`). What they add up to beyond
 *     the amount is the installments' fee (conversionCost), recorded then as an expense charged
 *     to the credit itself (so the credit owes the installments' total). Each installment is
 *     paid by hand: a transfer into the credit, and the installment marked paid.
 *
 * Terms (`account.credit`): { limit, openingDebt, startDate, conversions }. What is owed is the
 * opening debt, plus what was spent or taken from the credit since `startDate`, less what was
 * paid into it (creditStatus). Shared by the browser and the API, like the other domain modules.
 */

import { gregorianToJalali, jalaliToGregorian, getJalaliMonthLength } from './loanCalculator.js';
import { expensePaidInToman } from './expenseDocument.js';

/** The expense category of a credit's fees (categoryDocument.js) */
export const CREDIT_COST_CATEGORY = 'credit_fees';

export const CREDIT_LIMITS = {
  maxAmount: 1e13,
  maxInstallments: 120,
  maxConversions: 240,
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const pad = (n) => String(n).padStart(2, '0');
const num = (v) => Number(String(v ?? '').replace(/[,\s]/g, ''));
const amountOf = (v) => Math.round(num(v));

/** YYYY-MM-DD of a Gregorian { year, month, day } */
const isoOf = ({ year, month, day }) => `${year}-${pad(month)}-${pad(day)}`;

/** `iso` plus `days` days */
export function addDaysIso(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return isoOf({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() });
}

/**
 * `count` days a month apart from `firstDueDate`, on its Shamsi day (clamped to each month's
 * length) — to fill the installments' rows, which the user then edits
 */
export function monthlyDates(firstDueDate, count) {
  const [y, m, d] = firstDueDate.split('-').map(Number);
  const { jy, jm, jd } = gregorianToJalali(y, m, d);
  return Array.from({ length: Math.max(0, count) }, (_, k) => {
    const index = jy * 12 + (jm - 1) + k;
    const ty = Math.floor(index / 12);
    const tm = (index % 12) + 1;
    return isoOf(jalaliToGregorian(ty, tm, Math.min(jd, getJalaliMonthLength(ty, tm))));
  });
}

/** A fee as a percent of `base`, two decimals */
const pctOf = (fee, base) => (base > 0 ? Math.round((fee / base) * 10000) / 100 : 0);

/**
 * «تسویه بدهی»: the debt settled and what was actually paid for it → the fee
 * @returns {{ fee?: number, pct?: number, error?: string }}
 */
export function settlementOf(settled, paid) {
  const s = amountOf(settled);
  const p = amountOf(paid);
  if (!(s > 0)) return { error: 'مبلغ بدهی تسویه‌شده را وارد کنید.' };
  if (!(p >= s)) return { error: 'مبلغ پرداختی نمی‌تواند کمتر از بدهی تسویه‌شده باشد.' };
  return { fee: p - s, pct: pctOf(p - s, s) };
}

/**
 * «تبدیل به قسط»: what the installments add up to, and their fee beyond the amount turned
 * @param {{ principal: number, installments: { amount: number }[] }} conversion
 * @returns {{ total: number, cost: number, pct: number }}
 */
export function conversionCost({ principal, installments = [] }) {
  const total = installments.reduce((sum, i) => sum + (amountOf(i.amount) || 0), 0);
  const cost = Math.max(0, total - (amountOf(principal) || 0));
  return { total, cost, pct: pctOf(cost, amountOf(principal)) };
}

/**
 * Validate & normalize one installment plan. A plan saved by the earlier version (a count, one
 * installment amount and the first due day) becomes its rows.
 * @returns {{ value?: object, error?: string }}
 */
export function validateConversion(body = {}) {
  const id = String(body.id || '');
  if (!ID_RE.test(id)) return { error: 'شناسه‌ی قسط‌بندی نامعتبر است.' };
  if (!DATE_RE.test(String(body.date || ''))) return { error: 'تاریخ قسط‌بندی نامعتبر است.' };
  const principal = amountOf(body.principal);
  if (!(principal > 0) || principal > CREDIT_LIMITS.maxAmount) return { error: 'مبلغی که قسط‌بندی می‌شود را وارد کنید.' };

  let rows = Array.isArray(body.installments) ? body.installments : null;
  if (!rows && DATE_RE.test(String(body.firstDueDate || '')) && body.count > 0) {
    rows = monthlyDates(body.firstDueDate, parseInt(body.count, 10)).map((dueDate) => ({ dueDate, amount: body.payment }));
  }
  if (!rows?.length) return { error: 'دست‌کم یک قسط وارد کنید.' };
  if (rows.length > CREDIT_LIMITS.maxInstallments) return { error: `حداکثر ${CREDIT_LIMITS.maxInstallments} قسط.` };

  const installments = [];
  for (const row of rows) {
    const amount = amountOf(row.amount);
    if (!DATE_RE.test(String(row.dueDate || ''))) return { error: 'تاریخ هر قسط را وارد کنید.' };
    if (!(amount > 0) || amount > CREDIT_LIMITS.maxAmount) return { error: 'مبلغ هر قسط را وارد کنید.' };
    installments.push({
      dueDate: row.dueDate,
      amount,
      ...(DATE_RE.test(String(row.paidOn || '')) ? { paidOn: row.paidOn } : {}),
      ...(ID_RE.test(String(row.transferId || '')) ? { transferId: row.transferId } : {}),
    });
  }
  installments.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (conversionCost({ principal, installments }).total < principal) return { error: 'جمع اقساط نمی‌تواند کمتر از مبلغ قسط‌بندی باشد.' };

  return {
    value: {
      id,
      date: body.date,
      principal,
      installments,
      ...(ID_RE.test(String(body.feeExpenseId || '')) ? { feeExpenseId: body.feeExpenseId } : {}),
    },
  };
}

/**
 * Validate & normalize a credit's terms: its limit, the debt already owed when it was added and
 * from when its records count, and its installment plans
 * @param {object} body
 * @param {string} today - YYYY-MM-DD, the start date when none is given
 * @returns {{ value?: object, error?: string }}
 */
export function validateCreditTerms(body = {}, today = '') {
  const limit = amountOf(body.limit);
  if (!Number.isFinite(limit) || limit <= 0 || limit > CREDIT_LIMITS.maxAmount) return { error: 'سقف اعتبار را وارد کنید.' };

  const openingDebt = amountOf(body.openingDebt) || 0;
  if (openingDebt < 0 || openingDebt > CREDIT_LIMITS.maxAmount) return { error: 'بدهی فعلی نامعتبر است.' };

  const startDate = DATE_RE.test(String(body.startDate || '')) ? body.startDate : today;
  if (!DATE_RE.test(startDate)) return { error: 'تاریخ شروع نامعتبر است.' };

  const conversions = [];
  for (const raw of Array.isArray(body.conversions) ? body.conversions.slice(0, CREDIT_LIMITS.maxConversions) : []) {
    const c = validateConversion(raw);
    if (c.error) return { error: c.error };
    conversions.push(c.value);
  }

  return { value: { limit, openingDebt, startDate, ...(conversions.length ? { conversions } : {}) } };
}

/** What was charged to the credit and paid into it, from its expenses and transfers */
function movementsOf(account, expenses, transfers, today) {
  const since = account.credit.startDate || '';
  const inRange = (date) => DATE_RE.test(date || '') && date >= since && date <= today;
  let charged = account.credit.openingDebt || 0;
  let paid = 0;
  for (const e of expenses) {
    if (e.accountId === account.id && inRange(e.date)) charged += Math.round(expensePaidInToman(e) || 0);
  }
  for (const t of transfers) {
    if (!inRange(t.date)) continue;
    // A transfer's `amount` left its source and `fee` of it never reached the destination
    // (transferDocument.js): into the credit, what reached it pays the debt; out of it (cash), the
    // whole amount is owed
    if (t.toAccountId === account.id) paid += Math.round((Number(t.amount) || 0) - (Number(t.fee) || 0));
    else if (t.fromAccountId === account.id) charged += Math.round(Number(t.amount) || 0);
  }
  return { charged, paid };
}

/**
 * Where a credit stands today
 * @param {{ id: string, credit: object }} account - a credit account (type 'credit')
 * @param {{ expenses?: object[], transfers?: object[] }} records - its expenses and transfers
 *   (any others are ignored), from its start date
 * @param {string} today - YYYY-MM-DD
 * @returns {{
 *   limit: number, debt: number, available: number, prepaid: number,
 *   installmentDebt: number, freeDebt: number,
 *   plans: { id: string, date: string, principal: number, total: number, cost: number, pct: number, remaining: number,
 *     feeExpenseId?: string,
 *     installments: { n: number, dueDate: string, amount: number, paidOn?: string, status: 'paid'|'overdue'|'due'|'upcoming' }[] }[],
 *   next: { n: number, count: number, planId: string, dueDate: string, amount: number }|null,
 *   overdue: { count: number, amount: number },
 * }|null}
 */
export function creditStatus(account, { expenses = [], transfers = [] } = {}, today) {
  const terms = account?.credit;
  if (!terms) return null;
  const { charged, paid } = movementsOf(account, expenses, transfers, today);
  const balance = charged - paid;
  const debt = Math.max(0, balance);

  const statusOf = (i) => (i.paidOn ? 'paid' : i.dueDate < today ? 'overdue' : i.dueDate === today ? 'due' : 'upcoming');
  const plans = (terms.conversions || []).map((c) => {
    const installments = c.installments.map((i, k) => ({ ...i, n: k + 1, status: statusOf(i) }));
    return {
      ...c,
      ...conversionCost(c),
      remaining: installments.filter((i) => !i.paidOn).reduce((sum, i) => sum + i.amount, 0),
      installments,
    };
  });
  const unpaid = plans.flatMap((p) => p.installments.filter((i) => !i.paidOn).map((i) => ({ ...i, planId: p.id, count: p.installments.length })))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const installmentDebt = unpaid.reduce((sum, i) => sum + i.amount, 0);
  const overdue = unpaid.filter((i) => i.dueDate < today);
  const first = unpaid[0] || null;

  return {
    limit: terms.limit,
    debt,
    available: Math.max(0, terms.limit - debt),
    prepaid: Math.max(0, -balance),
    installmentDebt,
    // What is owed outside the installments: to settle, or to turn into installments
    freeDebt: Math.max(0, debt - installmentDebt),
    plans,
    next: first && { n: first.n, count: first.count, planId: first.planId, dueDate: first.dueDate, amount: first.amount },
    overdue: { count: overdue.length, amount: overdue.reduce((sum, i) => sum + i.amount, 0) },
  };
}

/** The fees already paid for a credit (expenses marked with its id) */
export function creditCostsPaid(accountId, expenses = []) {
  return expenses
    .filter((e) => e.creditAccountId === accountId)
    .reduce((sum, e) => sum + (Math.round(expensePaidInToman(e) || 0)), 0);
}
