/**
 * creditAccount.js — A bank credit line as one of the user's accounts («اعتبار بانکی»): its terms,
 * and what is owed on it, worked out from what was spent from it and paid into it
 *
 * Nothing is stored beyond the account's terms: spending from the credit is an ordinary expense
 * paid from the account (`accountId`), counted as an expense on the day of the purchase; paying it
 * back is a transfer from another of the user's accounts into it (transferDocument.js) — never a
 * second expense. Only the settlement fee or the installments' profit is an expense of its own
 * (category CREDIT_COST_CATEGORY, with `creditAccountId`), paid from the account that paid.
 *
 * Terms (`account.credit`):
 *   limit               the credit line (tomans)
 *   closingDay          the Shamsi day of the month a statement closes: purchases after the
 *                       previous closing day, up to this one, are one statement
 *   graceDays           days after closing to settle the statement (0 = on the closing day)
 *   payMode             'anytime': paid back any day, the credit free again at once;
 *                       'due_day': paid only on the due day
 *   settleFeePct        the fee for settling a statement (% of it; 0 = free)
 *   installmentCount    a statement not settled by its due day becomes this many monthly
 *   installmentRatePct  installments, at this annual profit rate (0 = none)
 *   openingDebt         what was already owed when the account was added (a charge on startDate)
 *   startDate           from when its purchases and payments count (YYYY-MM-DD)
 *
 * Payments go to the earliest due first (an overdue installment, then the next statement); a
 * payment beyond everything owed is kept as prepaid and covers the next purchases. A statement
 * still owed after its due day becomes installments the next day. Shared by the browser and the
 * API, like the other domain modules.
 */

import { gregorianToJalali, jalaliToGregorian, getJalaliMonthLength, calculateFixedInstallmentAmount } from './loanCalculator.js';
import { expensePaidInToman } from './expenseDocument.js';

export const CREDIT_PAY_MODES = [
  { value: 'anytime', label: 'هر زمان تا سررسید' },
  { value: 'due_day', label: 'فقط در روز سررسید' },
];

/** The expense category of a credit's fee and installment profit (categoryDocument.js) */
export const CREDIT_COST_CATEGORY = 'credit_fees';

export const CREDIT_LIMITS = {
  maxAmount: 1e13,
  maxGraceDays: 60,
  maxInstallments: 60,
  maxFeePct: 50,
  maxRatePct: 100,
};

export const CREDIT_DEFAULTS = {
  closingDay: 1,
  graceDays: 0,
  payMode: 'anytime',
  settleFeePct: 0,
  installmentCount: 6,
  installmentRatePct: 0,
  openingDebt: 0,
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, '0');
const num = (v) => Number(String(v ?? '').replace(/[,\s]/g, ''));
const fa = (n) => Number(n).toLocaleString('fa-IR');

/** YYYY-MM-DD of a Gregorian { year, month, day } */
const isoOf = ({ year, month, day }) => `${year}-${pad(month)}-${pad(day)}`;

/** `iso` plus `days` days */
export function addDaysIso(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return isoOf({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() });
}

const jalaliOf = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return gregorianToJalali(y, m, d);
};

/** The Gregorian day of Shamsi `day` in month (jy, jm), `day` clamped to the month's length */
const isoOfJalali = (jy, jm, day) => isoOf(jalaliToGregorian(jy, jm, Math.min(day, getJalaliMonthLength(jy, jm))));

const shiftMonth = (jy, jm, k) => {
  const index = jy * 12 + (jm - 1) + k;
  return { jy: Math.floor(index / 12), jm: (index % 12) + 1 };
};

/**
 * Validate & normalize a credit's terms
 * @param {object} body
 * @param {string} today - YYYY-MM-DD, the start date when none is given
 * @returns {{ value?: object, error?: string }}
 */
export function validateCreditTerms(body = {}, today = '') {
  const limit = Math.round(num(body.limit));
  if (!Number.isFinite(limit) || limit <= 0 || limit > CREDIT_LIMITS.maxAmount) return { error: 'سقف اعتبار را وارد کنید.' };

  const closingDay = parseInt(body.closingDay ?? CREDIT_DEFAULTS.closingDay, 10);
  if (!(closingDay >= 1 && closingDay <= 31)) return { error: 'روز بستن صورت‌حساب باید بین ۱ تا ۳۱ باشد.' };

  const graceDays = parseInt(body.graceDays ?? CREDIT_DEFAULTS.graceDays, 10) || 0;
  if (graceDays < 0 || graceDays > CREDIT_LIMITS.maxGraceDays) return { error: `مهلت پرداخت باید بین ۰ تا ${CREDIT_LIMITS.maxGraceDays} روز باشد.` };

  const payMode = CREDIT_PAY_MODES.some((m) => m.value === body.payMode) ? body.payMode : CREDIT_DEFAULTS.payMode;

  const settleFeePct = Math.round((num(body.settleFeePct) || 0) * 100) / 100;
  if (settleFeePct < 0 || settleFeePct > CREDIT_LIMITS.maxFeePct) return { error: `کارمزد تسویه باید بین ۰ تا ${CREDIT_LIMITS.maxFeePct} درصد باشد.` };

  const installmentCount = parseInt(body.installmentCount ?? CREDIT_DEFAULTS.installmentCount, 10);
  if (!(installmentCount >= 1 && installmentCount <= CREDIT_LIMITS.maxInstallments)) return { error: `تعداد اقساط باید بین ۱ تا ${CREDIT_LIMITS.maxInstallments} باشد.` };

  const installmentRatePct = Math.round((num(body.installmentRatePct) || 0) * 100) / 100;
  if (installmentRatePct < 0 || installmentRatePct > CREDIT_LIMITS.maxRatePct) return { error: `سود اقساط باید بین ۰ تا ${CREDIT_LIMITS.maxRatePct} درصد باشد.` };

  const openingDebt = Math.round(num(body.openingDebt) || 0);
  if (openingDebt < 0 || openingDebt > CREDIT_LIMITS.maxAmount) return { error: 'بدهی فعلی نامعتبر است.' };

  const startDate = DATE_RE.test(String(body.startDate || '')) ? body.startDate : today;
  if (!DATE_RE.test(startDate)) return { error: 'تاریخ شروع نامعتبر است.' };

  return { value: { limit, closingDay, graceDays, payMode, settleFeePct, installmentCount, installmentRatePct, openingDebt, startDate } };
}

/** The closing day of the statement a purchase on `iso` belongs to: the first on or after it */
export function closingDateOf(iso, closingDay) {
  const { jy, jm, jd } = jalaliOf(iso);
  if (jd <= Math.min(closingDay, getJalaliMonthLength(jy, jm))) return isoOfJalali(jy, jm, closingDay);
  const next = shiftMonth(jy, jm, 1);
  return isoOfJalali(next.jy, next.jm, closingDay);
}

/**
 * A statement not settled by its due day, as monthly installments (on the due day's Shamsi day
 * of each following month), each with its principal and profit
 * @param {number} principal
 * @param {{ installmentCount: number, installmentRatePct: number }} terms
 * @param {string} dueDate - the statement's due day
 * @returns {{ n: number, dueDate: string, principal: number, interest: number }[]}
 */
export function installmentPlanOf(principal, terms, dueDate) {
  const count = terms.installmentCount;
  const rate = terms.installmentRatePct || 0;
  const payment = calculateFixedInstallmentAmount({ principal, annualRatePct: rate, installmentCount: count });
  const { jy, jm, jd } = jalaliOf(dueDate);
  let balance = principal;
  const items = [];
  for (let n = 1; n <= count; n++) {
    const interest = Math.round(balance * (rate / 100 / 12));
    const part = n === count ? balance : Math.max(0, Math.min(balance, payment - interest));
    balance -= part;
    const month = shiftMonth(jy, jm, n);
    items.push({ n, dueDate: isoOfJalali(month.jy, month.jm, jd), principal: part, interest });
  }
  return items;
}

/** What was charged to the credit, and paid into it, from its expenses and transfers */
function movementsOf(account, expenses, transfers, today) {
  const terms = account.credit;
  const since = terms.startDate || '';
  const charges = [];
  const payments = [];
  if (terms.openingDebt > 0) charges.push({ date: since || today, amount: terms.openingDebt });
  for (const e of expenses) {
    if (e.accountId !== account.id || !DATE_RE.test(e.date || '') || e.date < since) continue;
    const amount = Math.round(expensePaidInToman(e) || 0);
    if (amount > 0) charges.push({ date: e.date, amount });
  }
  for (const t of transfers) {
    if (!DATE_RE.test(t.date || '') || t.date < since) continue;
    // Paid into the credit; taken out of it as cash (with what the bank kept)
    if (t.toAccountId === account.id) payments.push({ date: t.date, amount: Math.round(Number(t.amount) || 0) });
    else if (t.fromAccountId === account.id) charges.push({ date: t.date, amount: Math.round((Number(t.amount) || 0) + (Number(t.fee) || 0)) });
  }
  return { charges: charges.filter((c) => c.date <= today), payments: payments.filter((p) => p.amount > 0 && p.date <= today) };
}

/**
 * Where a credit stands today
 * @param {{ id: string, credit: object }} account - a credit account (type 'credit')
 * @param {{ expenses?: object[], transfers?: object[] }} records - its expenses and transfers
 *   (any others are ignored), from its start date
 * @param {string} today - YYYY-MM-DD
 * @returns {{
 *   limit: number, debt: number, available: number, prepaid: number,
 *   statements: { closeDate: string, dueDate: string, charged: number, paid: number, remaining: number, fee: number, open: boolean }[],
 *   plans: { closeDate: string, dueDate: string, principal: number, remaining: number,
 *     installments: { n: number, dueDate: string, principal: number, interest: number, remaining: number, status: 'paid'|'overdue'|'due'|'upcoming' }[] }[],
 *   next: { kind: 'statement'|'installment', dueDate: string, principal: number, cost: number, amount: number, label: string }|null,
 *   overdue: { count: number, amount: number }, // amount: with the installments' profit
 * }|null}
 */
export function creditStatus(account, { expenses = [], transfers = [] } = {}, today) {
  const terms = account?.credit;
  if (!terms) return null;
  const { charges, payments } = movementsOf(account, expenses, transfers, today);

  // Each statement: by its closing day
  const statements = new Map();
  const statementOf = (date) => {
    const closeDate = closingDateOf(date, terms.closingDay);
    if (!statements.has(closeDate)) {
      statements.set(closeDate, { closeDate, dueDate: addDaysIso(closeDate, terms.graceDays), charged: 0, paid: 0, converted: false });
    }
    return statements.get(closeDate);
  };
  charges.forEach((c) => statementOf(c.date));

  // In time order; on one day purchases, then payments, then the end of a due day
  const events = [
    ...charges.map((c) => ({ date: c.date, order: 0, apply: () => charge(c) })),
    ...payments.map((p) => ({ date: p.date, order: 1, apply: () => pay(p.amount) })),
    ...[...statements.values()].filter((s) => s.dueDate < today).map((s) => ({ date: s.dueDate, order: 2, apply: () => close(s) })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);

  const plans = [];
  let prepaid = 0;
  const statementLeft = (s) => s.charged - s.paid;

  function charge(c) {
    const s = statementOf(c.date);
    s.charged += c.amount;
    const covered = Math.min(prepaid, c.amount);
    s.paid += covered;
    prepaid -= covered;
  }

  function pay(amount) {
    let left = amount;
    const owed = [
      ...[...statements.values()].filter((s) => !s.converted && statementLeft(s) > 0).map((s) => ({ dueDate: s.dueDate, rank: 1, left: () => statementLeft(s), take: (v) => { s.paid += v; } })),
      ...plans.flatMap((p) => p.installments).filter((i) => i.remaining > 0).map((i) => ({ dueDate: i.dueDate, rank: 0, left: () => i.remaining, take: (v) => { i.remaining -= v; } })),
    ].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.rank - b.rank);
    for (const o of owed) {
      if (left <= 0) break;
      const v = Math.min(left, o.left());
      o.take(v);
      left -= v;
    }
    prepaid += left;
  }

  function close(s) {
    const remaining = statementLeft(s);
    if (remaining <= 0) return;
    s.converted = true;
    plans.push({
      closeDate: s.closeDate,
      dueDate: s.dueDate,
      principal: remaining,
      installments: installmentPlanOf(remaining, terms, s.dueDate).map((i) => ({ ...i, remaining: i.principal })),
    });
  }

  events.forEach((e) => e.apply());

  const feeOf = (amount) => Math.round((amount * (terms.settleFeePct || 0)) / 100);
  const openStatements = [...statements.values()]
    .filter((s) => !s.converted && (statementLeft(s) > 0 || s.closeDate >= today))
    .sort((a, b) => a.closeDate.localeCompare(b.closeDate))
    .map((s) => ({
      closeDate: s.closeDate,
      dueDate: s.dueDate,
      charged: s.charged,
      paid: s.paid,
      remaining: statementLeft(s),
      fee: feeOf(statementLeft(s)),
      open: s.closeDate >= today,
    }));

  const statusOf = (i) => (i.remaining <= 0 ? 'paid' : i.dueDate < today ? 'overdue' : i.dueDate === today ? 'due' : 'upcoming');
  const planViews = plans
    .map((p) => ({
      ...p,
      remaining: p.installments.reduce((sum, i) => sum + i.remaining, 0),
      installments: p.installments.map((i) => ({ ...i, status: statusOf(i) })),
    }))
    .filter((p) => p.remaining > 0);

  const installmentsOwed = planViews.flatMap((p) => p.installments.filter((i) => i.remaining > 0).map((i) => ({ ...i, plan: p })));
  const debt = openStatements.reduce((sum, s) => sum + s.remaining, 0) + installmentsOwed.reduce((sum, i) => sum + i.remaining, 0);

  // The next payment: the earliest due, with its fee or profit (the profit in proportion when part was paid)
  const candidates = [
    ...installmentsOwed.map((i) => {
      const cost = i.principal > 0 ? Math.round((i.interest * i.remaining) / i.principal) : 0;
      return { kind: 'installment', dueDate: i.dueDate, principal: i.remaining, cost, amount: i.remaining + cost, rank: 0, n: i.n, count: i.plan.installments.length };
    }),
    ...openStatements.filter((s) => s.remaining > 0).map((s) => ({ kind: 'statement', dueDate: s.dueDate, principal: s.remaining, cost: s.fee, amount: s.remaining + s.fee, rank: 1 })),
  ].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.rank - b.rank);
  const first = candidates[0] || null;
  const next = first && {
    kind: first.kind,
    dueDate: first.dueDate,
    principal: first.principal,
    cost: first.cost,
    amount: first.amount,
    label: first.kind === 'installment' ? `قسط ${fa(first.n)} از ${fa(first.count)}` : 'تسویه‌ی صورت‌حساب',
  };

  // What is overdue, with each installment's profit (as the installments are shown)
  const owedWithCost = (i) => i.remaining + (i.principal > 0 ? Math.round((i.interest * i.remaining) / i.principal) : 0);
  const overdueItems = installmentsOwed.filter((i) => i.dueDate < today);
  return {
    limit: terms.limit,
    debt,
    available: Math.max(0, terms.limit - debt),
    prepaid,
    statements: openStatements,
    plans: planViews,
    next,
    overdue: { count: overdueItems.length, amount: overdueItems.reduce((sum, i) => sum + owedWithCost(i), 0) },
  };
}

/** The fee and profit already paid for a credit (expenses marked with its id) */
export function creditCostsPaid(accountId, expenses = []) {
  return expenses
    .filter((e) => e.creditAccountId === accountId)
    .reduce((sum, e) => sum + (Math.round(expensePaidInToman(e) || 0)), 0);
}
