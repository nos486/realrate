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
 *     Each settlement is listed with its fee's percent of the debt and roughly what that comes to
 *     a year, from how much was owed for how long before it (creditStatus `settlements`).
 *   - A deposit that pays the debt («تسویه بدهی اعتباری»): an income in CREDIT_SETTLEMENT_CATEGORY
 *     naming the credit (`creditAccountId`) — paid into it, like a transfer (left out of the
 *     income totals by default, categoryDocument.js).
 *   - «تبدیل به قسط»: the user turns an amount of the debt into installments, each with its own
 *     day and amount, as the bank set them (`credit.conversions`). What they add up to beyond
 *     the amount is the installments' fee (conversionCost), recorded then as an expense charged
 *     to the credit itself (so the credit owes the installments' total). Each installment is
 *     paid by hand: a transfer into the credit, and the installment marked paid.
 *
 * Terms (`account.credit`): { limit, openingDebt, startDate, cycleDay, conversions }: `cycleDay` is the Shamsi
 * day of the month its period starts on (the card's «this period» figures); `startDate` is the day its
 * records began to count (the debt before it is `openingDebt`). What is owed is the
 * opening debt, plus what was spent or taken from the credit since `startDate`, less what was
 * paid into it — transfers and settlement deposits (creditStatus). Shared by the browser and the API, like the other domain modules.
 */

import { gregorianToJalali, jalaliToGregorian, getJalaliMonthLength } from './loanCalculator.js';
import { expensePaidInToman } from './expenseDocument.js';
import { incomeInToman } from './incomeDocument.js';
import { t } from './i18n.js';

/** The expense category of a credit's fees (categoryDocument.js) */
export const CREDIT_COST_CATEGORY = 'credit_fees';

/** The income category of a deposit that pays a credit's debt (categoryDocument.js) */
export const CREDIT_SETTLEMENT_CATEGORY = 'credit_settlement';

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

/**
 * The first day of the credit's current period: the latest day, up to `today`, that falls on its
 * Shamsi `cycleDay` (clamped to short months)
 * @param {number} cycleDay - 1..31
 * @param {string} today - YYYY-MM-DD
 */
export function cycleStartOf(cycleDay, today) {
  const [y, m, d] = today.split('-').map(Number);
  const { jy, jm, jd } = gregorianToJalali(y, m, d);
  const dayIn = (ty, tm) => Math.min(cycleDay, getJalaliMonthLength(ty, tm));
  if (jd >= dayIn(jy, jm)) return isoOf(jalaliToGregorian(jy, jm, dayIn(jy, jm)));
  const py = jm === 1 ? jy - 1 : jy;
  const pm = jm === 1 ? 12 : jm - 1;
  return isoOf(jalaliToGregorian(py, pm, dayIn(py, pm)));
}

/** The Shamsi day of month of a Gregorian YYYY-MM-DD */
const shamsiDayOf = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return gregorianToJalali(y, m, d).jd;
};

/** A fee as a percent of `base`, two decimals */
const pctOf = (fee, base) => (base > 0 ? Math.round((fee / base) * 10000) / 100 : 0);

/**
 * «تسویه بدهی»: the debt settled and what was actually paid for it → the fee
 * @returns {{ fee?: number, pct?: number, error?: string }}
 */
export function settlementOf(settled, paid) {
  const s = amountOf(settled);
  const p = amountOf(paid);
  if (!(s > 0)) return { error: t('مبلغ بدهی تسویه‌شده را وارد کنید.') };
  if (!(p >= s)) return { error: t('مبلغ پرداختی نمی‌تواند کمتر از بدهی تسویه‌شده باشد.') };
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
  if (!ID_RE.test(id)) return { error: t('شناسه‌ی قسط‌بندی نامعتبر است.') };
  if (!DATE_RE.test(String(body.date || ''))) return { error: t('تاریخ قسط‌بندی نامعتبر است.') };
  const principal = amountOf(body.principal);
  if (!(principal > 0) || principal > CREDIT_LIMITS.maxAmount) return { error: t('مبلغی که قسط‌بندی می‌شود را وارد کنید.') };

  let rows = Array.isArray(body.installments) ? body.installments : null;
  if (!rows && DATE_RE.test(String(body.firstDueDate || '')) && body.count > 0) {
    rows = monthlyDates(body.firstDueDate, parseInt(body.count, 10)).map((dueDate) => ({ dueDate, amount: body.payment }));
  }
  if (!rows?.length) return { error: t('دست‌کم یک قسط وارد کنید.') };
  if (rows.length > CREDIT_LIMITS.maxInstallments) return { error: t('حداکثر {maxInstallments} قسط.', { maxInstallments: CREDIT_LIMITS.maxInstallments }) };

  const installments = [];
  for (const row of rows) {
    const amount = amountOf(row.amount);
    if (!DATE_RE.test(String(row.dueDate || ''))) return { error: t('تاریخ هر قسط را وارد کنید.') };
    if (!(amount > 0) || amount > CREDIT_LIMITS.maxAmount) return { error: t('مبلغ هر قسط را وارد کنید.') };
    installments.push({
      dueDate: row.dueDate,
      amount,
      ...(DATE_RE.test(String(row.paidOn || '')) ? { paidOn: row.paidOn } : {}),
      ...(ID_RE.test(String(row.transferId || '')) ? { transferId: row.transferId } : {}),
    });
  }
  installments.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (conversionCost({ principal, installments }).total < principal) return { error: t('جمع اقساط نمی‌تواند کمتر از مبلغ قسط‌بندی باشد.') };

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
  if (!Number.isFinite(limit) || limit <= 0 || limit > CREDIT_LIMITS.maxAmount) return { error: t('سقف اعتبار را وارد کنید.') };

  const openingDebt = amountOf(body.openingDebt) || 0;
  if (openingDebt < 0 || openingDebt > CREDIT_LIMITS.maxAmount) return { error: t('بدهی فعلی نامعتبر است.') };

  const cycleGiven = parseInt(body.cycleDay, 10);
  if (body.cycleDay != null && body.cycleDay !== '' && !(cycleGiven >= 1 && cycleGiven <= 31)) return { error: t('روز شروع دوره باید بین ۱ تا ۳۱ باشد.') };
  // Counting starts on the start of the period the credit was added in, unless a day is given
  const cycleDay = cycleGiven >= 1 ? cycleGiven : null;
  const given = DATE_RE.test(String(body.startDate || '')) ? body.startDate : '';
  const startDate = given || (cycleDay && DATE_RE.test(today) ? cycleStartOf(cycleDay, today) : today);
  if (!DATE_RE.test(startDate)) return { error: t('تاریخ شروع نامعتبر است.') };

  const conversions = [];
  for (const raw of Array.isArray(body.conversions) ? body.conversions.slice(0, CREDIT_LIMITS.maxConversions) : []) {
    const c = validateConversion(raw);
    if (c.error) return { error: c.error };
    conversions.push(c.value);
  }

  return { value: { limit, openingDebt, startDate, cycleDay: cycleDay || shamsiDayOf(startDate), ...(conversions.length ? { conversions } : {}) } };
}

/**
 * What was charged to the credit and paid into it, one entry per record and day: its expenses,
 * the transfers into and out of it and the deposits that pay its debt, from its start date
 */
function eventsOf(account, expenses, transfers, incomes, today, rates) {
  const since = account.credit.startDate || '';
  const inRange = (date) => DATE_RE.test(date || '') && date >= since && date <= today;
  const events = [];
  for (const e of expenses) {
    if (e.accountId !== account.id || !inRange(e.date)) continue;
    events.push({ date: e.date, charge: Math.round(expensePaidInToman(e, rates) || 0), pay: 0 });
  }
  for (const t of transfers) {
    if (!inRange(t.date)) continue;
    // A transfer's `amount` left its source and `fee` of it never reached the destination
    // (transferDocument.js): into the credit, what reached it pays the debt; out of it (cash), the
    // whole amount is owed
    if (t.toAccountId === account.id) {
      events.push({ date: t.date, charge: 0, pay: Math.round((Number(t.amount) || 0) - (Number(t.fee) || 0)) });
    } else if (t.fromAccountId === account.id) {
      events.push({ date: t.date, charge: Math.round(Number(t.amount) || 0), pay: 0 });
    }
  }
  // Deposits that pay its debt («تسویه بدهی اعتباری»)
  for (const i of incomes) {
    if (i.creditAccountId === account.id && i.category === CREDIT_SETTLEMENT_CATEGORY && inRange(i.incomeDate)) {
      events.push({ date: i.incomeDate, charge: 0, pay: Math.round(incomeInToman(i, rates) || 0) });
    }
  }
  return events;
}

/** What was charged to the credit and paid into it, in all */
function movementsOf(account, events) {
  let charged = 0;
  let paid = 0;
  for (const e of events) {
    charged += e.charge;
    paid += e.pay;
  }
  return { opening: account.credit.openingDebt || 0, charged, paid };
}

const DAY_MS = 86_400_000;
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/**
 * How much was owed for how long before `date`: the sum of each day's debt (at the end of the
 * day) from when the debt last started — the start date, or the day after it was last paid off —
 * to the day before `date`. A settlement's fee over this, times 365, is its simple yearly rate.
 * @returns {number} toman-days
 */
function debtDaysBefore(account, events, date) {
  const byDay = new Map();
  for (const e of events) {
    if (e.date >= date) continue;
    byDay.set(e.date, (byDay.get(e.date) || 0) + e.charge - e.pay);
  }
  const start = account.credit.startDate || [...byDay.keys()].sort()[0] || date;
  let balance = account.credit.openingDebt || 0;
  let since = start;
  let total = 0;
  for (const day of [...byDay.keys()].sort()) {
    if (day < start) continue;
    total += Math.max(0, balance) * daysBetween(since, day);
    balance += byDay.get(day);
    since = day;
    // Paid off: what was owed before does not cost this settlement
    if (balance <= 0) total = 0;
  }
  return total + Math.max(0, balance) * daysBetween(since, date);
}

/**
 * The credit's settlements («تسویه بدهی»): each transfer into it whose fee was also recorded as
 * the credit's own fee expense that day (CreditPaymentForm) — the debt settled, the fee, its
 * percent of the debt and roughly what that comes to a year, from how much was owed for how long
 * (debtDaysBefore). A debt from before the start date counts from the start date only, so the
 * yearly rate of a first settlement can read high. Newest first.
 */
function settlementsOf(account, events, expenses, transfers, today) {
  const since = account.credit.startDate || '';
  const fees = expenses.filter((e) => e.creditAccountId === account.id && e.category === CREDIT_COST_CATEGORY);
  const list = [];
  for (const t of transfers) {
    const fee = Math.round(Number(t.fee) || 0);
    if (t.toAccountId !== account.id || !(fee > 0) || !DATE_RE.test(t.date || '') || t.date < since || t.date > today) continue;
    if (!fees.some((e) => e.date === t.date && Math.round(Number(e.amount) || 0) === fee)) continue;
    const settled = Math.round((Number(t.amount) || 0) - fee);
    const debtDays = debtDaysBefore(account, events, t.date);
    list.push({
      id: t.id,
      date: t.date,
      settled,
      fee,
      pct: pctOf(fee, settled),
      // A simple yearly rate; none when the debt was settled the day it was made
      yearlyPct: debtDays > 0 ? Math.round((fee / debtDays) * 365 * 10000) / 100 : null,
    });
  }
  return list.sort((a, b) => b.date.localeCompare(a.date));
}

/** This period's spending from the credit and what moved through it (from the period's first day) */
function periodOf(account, expenses, transfers, today, rates) {
  const terms = account.credit;
  const periodStart = cycleStartOf(terms.cycleDay || shamsiDayOf(terms.startDate || today), today);
  const from = terms.startDate && terms.startDate > periodStart ? terms.startDate : periodStart;
  const inRange = (date) => DATE_RE.test(date || '') && date >= from && date <= today;
  let spent = 0;
  let paidIn = 0;
  let takenOut = 0;
  for (const e of expenses) {
    if (e.accountId === account.id && inRange(e.date)) spent += Math.round(expensePaidInToman(e, rates) || 0);
  }
  for (const t of transfers) {
    if (!inRange(t.date)) continue;
    if (t.toAccountId === account.id) paidIn += Math.round((Number(t.amount) || 0) - (Number(t.fee) || 0));
    else if (t.fromAccountId === account.id) takenOut += Math.round(Number(t.amount) || 0);
  }
  return { from, spent, paidIn, takenOut };
}

/**
 * Where a credit stands today
 * @param {{ id: string, credit: object }} account - a credit account (type 'credit')
 * @param {{ expenses?: object[], transfers?: object[], incomes?: object[] }} records - its expenses,
 *   transfers and settlement deposits (any others are ignored), from its start date
 * @param {string} today - YYYY-MM-DD
 * @param {object} [rates] - the rates bag (currencies.js): a foreign expense or deposit counts at
 *   its day's rate, else today's — without rates it would count as nothing
 * @returns {{
 *   limit: number, debt: number, available: number, prepaid: number,
 *   installmentDebt: number, freeDebt: number,
 *   plans: { id: string, date: string, principal: number, total: number, cost: number, pct: number, remaining: number,
 *     feeExpenseId?: string,
 *     installments: { n: number, dueDate: string, amount: number, paidOn?: string, status: 'paid'|'overdue'|'due'|'upcoming' }[] }[],
 *   next: { n: number, count: number, planId: string, dueDate: string, amount: number }|null,
 *   overdue: { count: number, amount: number },
 *   settlements: { id: string, date: string, settled: number, fee: number, pct: number, yearlyPct: number|null }[],
 * }|null}
 */
export function creditStatus(account, { expenses = [], transfers = [], incomes = [] } = {}, today, rates = {}) {
  const terms = account?.credit;
  if (!terms) return null;
  const events = eventsOf(account, expenses, transfers, incomes, today, rates);
  const { opening, charged, paid } = movementsOf(account, events);
  const balance = opening + charged - paid;
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
    // How the debt adds up: the opening debt, plus what was charged since the start date, less what was paid
    breakdown: { opening, charged, paid },
    period: periodOf(account, expenses, transfers, today, rates),
    debt,
    available: Math.max(0, terms.limit - debt),
    prepaid: Math.max(0, -balance),
    installmentDebt,
    // What is owed outside the installments: to settle, or to turn into installments
    freeDebt: Math.max(0, debt - installmentDebt),
    plans,
    next: first && { n: first.n, count: first.count, planId: first.planId, dueDate: first.dueDate, amount: first.amount },
    overdue: { count: overdue.length, amount: overdue.reduce((sum, i) => sum + i.amount, 0) },
    settlements: settlementsOf(account, events, expenses, transfers, today),
  };
}

/**
 * A payment into a credit that is already recorded the other way — a transfer into it and a
 * «تسویه بدهی اعتباری» deposit for the same amount on the same day are most likely one payment
 * recorded twice, and the debt would drop by both
 * @param {{ creditId: string, amount: number, date: string }} payment - what is about to be saved
 * @param {{ transfers?: object[], incomes?: object[] }} existing - records on that day
 * @returns {{ kind: 'transfer'|'deposit', record: object }|null}
 */
export function findDuplicatePayment({ creditId, amount, date }, { transfers = [], incomes = [] } = {}) {
  const same = (a) => Math.round(Number(a) || 0) === Math.round(Number(amount) || 0);
  const transfer = transfers.find((t) => t.toAccountId === creditId && t.date === date && same((Number(t.amount) || 0) - (Number(t.fee) || 0)));
  if (transfer) return { kind: 'transfer', record: transfer };
  const deposit = incomes.find((i) => i.creditAccountId === creditId && i.category === CREDIT_SETTLEMENT_CATEGORY && i.incomeDate === date && same(i.amount));
  return deposit ? { kind: 'deposit', record: deposit } : null;
}

/** The fees already paid for a credit (expenses marked with its id) */
export function creditCostsPaid(accountId, expenses = [], rates = {}) {
  return expenses
    .filter((e) => e.creditAccountId === accountId)
    .reduce((sum, e) => sum + (Math.round(expensePaidInToman(e, rates) || 0)), 0);
}
