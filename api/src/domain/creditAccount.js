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
 *   settleFeePct        the fee for settling a statement (% of it; 0 = free) — or worked out
 *                       from `feeSample: { used, repaid }` («۱۰ میلیون استفاده، ۱۰٫۲ میلیون برگشت»)
 *   installmentCount    what the bank usually makes of a statement not settled in time: this many
 *   installmentRatePct  monthly installments at this annual profit (0 = none) — or worked out,
 *                       like a loan's, from `installmentSample: { principal, payment }`: the
 *                       monthly installment the bank quotes for an amount. Only the starting
 *                       point of «تبدیل به اقساط».
 *   openingDebt         what was already owed when the account was added (a charge on startDate)
 *   startDate           from when its purchases and payments count (YYYY-MM-DD)
 *   conversions         the statements the user turned into installments, as the bank set them
 *                       (validateConversion): the count, the first due day, each installment
 *
 * Payments go to the earliest due first (an overdue installment or statement, then the next); a
 * payment beyond everything owed is kept as prepaid and covers the next purchases. A statement
 * still owed after its due day stays owed (overdue) until it is paid or the user turns it into
 * installments — never by itself, since the bank may move the dates. Shared by the browser and
 * the API, like the other domain modules.
 */

import { gregorianToJalali, jalaliToGregorian, getJalaliMonthLength, calculateFixedInstallmentAmount, solveAnnualRateFromTotalRepayment } from './loanCalculator.js';
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
  maxConversions: 240,
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

/** Percents derived from amounts keep four decimals, so the amounts they came from come back exactly */
const RATE_DECIMALS = 4;
const roundRate = (v) => Math.round(v * 10 ** RATE_DECIMALS) / 10 ** RATE_DECIMALS;

/**
 * The settlement fee from two amounts: what was used and what was paid back for it
 * @returns {{ pct?: number, error?: string }}
 */
export function feePctFromAmounts(used, repaid) {
  const u = Math.round(num(used));
  const r = Math.round(num(repaid));
  if (!(u > 0) || !(r > 0)) return { error: 'مبلغ استفاده‌شده و مبلغ برگشتی را وارد کنید.' };
  if (r < u) return { error: 'مبلغ برگشتی نمی‌تواند کمتر از مبلغ استفاده‌شده باشد.' };
  return { pct: roundRate(((r - u) / u) * 100) };
}

/**
 * The installments' annual profit from what the bank quotes: `payment` a month, `count` times,
 * for `principal` — solved like a loan's (loanCalculator.js)
 * @returns {{ ratePct?: number, total?: number, error?: string }}
 */
export function installmentRateFromAmounts(principal, payment, count) {
  const p = Math.round(num(principal));
  const pay = Math.round(num(payment));
  const n = parseInt(count, 10) || 0;
  if (!(p > 0) || !(pay > 0) || !(n > 0)) return { error: 'مبلغ و مبلغ هر قسط را وارد کنید.' };
  const total = pay * n;
  if (total < p) return { error: 'جمع اقساط نمی‌تواند کمتر از مبلغ باشد.' };
  try {
    const { annualRatePct } = solveAnnualRateFromTotalRepayment({ principal: p, installmentCount: n, totalRepayment: total, decimals: RATE_DECIMALS });
    return { ratePct: annualRatePct, total };
  } catch (err) {
    return { error: err.message };
  }
}

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

  // The fee: from the two amounts when given, else the percent
  let settleFeePct = roundRate(num(body.settleFeePct) || 0);
  let feeSample = null;
  if (body.feeSample) {
    const fee = feePctFromAmounts(body.feeSample.used, body.feeSample.repaid);
    if (fee.error) return { error: fee.error };
    settleFeePct = fee.pct;
    feeSample = { used: Math.round(num(body.feeSample.used)), repaid: Math.round(num(body.feeSample.repaid)) };
  }
  if (settleFeePct < 0 || settleFeePct > CREDIT_LIMITS.maxFeePct) return { error: `کارمزد تسویه باید بین ۰ تا ${CREDIT_LIMITS.maxFeePct} درصد باشد.` };

  const installmentCount = parseInt(body.installmentCount ?? CREDIT_DEFAULTS.installmentCount, 10);
  if (!(installmentCount >= 1 && installmentCount <= CREDIT_LIMITS.maxInstallments)) return { error: `تعداد اقساط باید بین ۱ تا ${CREDIT_LIMITS.maxInstallments} باشد.` };

  // The installments' profit: solved from the quoted installment when given, else the rate
  let installmentRatePct = roundRate(num(body.installmentRatePct) || 0);
  let installmentSample = null;
  if (body.installmentSample) {
    const solved = installmentRateFromAmounts(body.installmentSample.principal, body.installmentSample.payment, installmentCount);
    if (solved.error) return { error: solved.error };
    installmentRatePct = solved.ratePct;
    installmentSample = { principal: Math.round(num(body.installmentSample.principal)), payment: Math.round(num(body.installmentSample.payment)) };
  }
  if (installmentRatePct < 0 || installmentRatePct > CREDIT_LIMITS.maxRatePct) return { error: `سود اقساط باید بین ۰ تا ${CREDIT_LIMITS.maxRatePct} درصد باشد.` };

  const openingDebt = Math.round(num(body.openingDebt) || 0);
  if (openingDebt < 0 || openingDebt > CREDIT_LIMITS.maxAmount) return { error: 'بدهی فعلی نامعتبر است.' };

  const startDate = DATE_RE.test(String(body.startDate || '')) ? body.startDate : today;
  if (!DATE_RE.test(startDate)) return { error: 'تاریخ شروع نامعتبر است.' };

  // The statements the user turned into installments
  const conversions = [];
  for (const raw of Array.isArray(body.conversions) ? body.conversions.slice(0, CREDIT_LIMITS.maxConversions) : []) {
    const c = validateConversion(raw);
    if (c.error) return { error: c.error };
    conversions.push(c.value);
  }

  return {
    value: {
      limit, closingDay, graceDays, payMode, settleFeePct, installmentCount, installmentRatePct, openingDebt, startDate,
      ...(conversions.length ? { conversions } : {}),
      ...(feeSample ? { feeSample } : {}),
      ...(installmentSample ? { installmentSample } : {}),
    },
  };
}

/** The closing day of the statement a purchase on `iso` belongs to: the first on or after it */
export function closingDateOf(iso, closingDay) {
  const { jy, jm, jd } = jalaliOf(iso);
  if (jd <= Math.min(closingDay, getJalaliMonthLength(jy, jm))) return isoOfJalali(jy, jm, closingDay);
  const next = shiftMonth(jy, jm, 1);
  return isoOfJalali(next.jy, next.jm, closingDay);
}

/**
 * Installments: `count` monthly payments of `payment` from `firstDueDate` (on its Shamsi day of
 * each month), each split into principal and profit at the annual rate those amounts imply (a
 * loan's formula, loanCalculator.js); the last takes what is left, so they add up to the
 * principal and to `payment × count`
 * @param {number} principal
 * @param {{ count: number, payment: number }} plan
 * @param {string} firstDueDate
 * @returns {{ n: number, dueDate: string, principal: number, interest: number }[]}
 */
export function installmentPlanOf(principal, { count, payment }, firstDueDate) {
  const rate = installmentRateFromAmounts(principal, payment, count).ratePct || 0;
  const { jy, jm, jd } = jalaliOf(firstDueDate);
  let balance = principal;
  const items = [];
  for (let n = 1; n <= count; n++) {
    const last = n === count;
    const interest = Math.round(balance * (rate / 100 / 12));
    const part = last ? balance : Math.max(0, Math.min(balance, payment - interest));
    balance -= part;
    const month = shiftMonth(jy, jm, n - 1);
    items.push({ n, dueDate: isoOfJalali(month.jy, month.jm, jd), principal: part, interest: last ? Math.max(0, payment - part) : interest });
  }
  return items;
}

/**
 * A statement turned into installments by the user (stored in `credit.conversions`): what of
 * statement `closeDate` was turned, on which day, and the installments the bank set — their count,
 * the first one's day (the bank may move it) and the amount of each
 * @returns {{ value?: object, error?: string }}
 */
export function validateConversion(body = {}) {
  const id = String(body.id || '');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return { error: 'شناسه‌ی قسط‌بندی نامعتبر است.' };
  for (const key of ['date', 'closeDate', 'firstDueDate']) {
    if (!DATE_RE.test(String(body[key] || ''))) return { error: 'تاریخ‌های قسط‌بندی نامعتبر است.' };
  }
  const principal = Math.round(num(body.principal));
  if (!(principal > 0) || principal > CREDIT_LIMITS.maxAmount) return { error: 'مبلغ قسط‌بندی را وارد کنید.' };
  const count = parseInt(body.count, 10);
  if (!(count >= 1 && count <= CREDIT_LIMITS.maxInstallments)) return { error: `تعداد اقساط باید بین ۱ تا ${CREDIT_LIMITS.maxInstallments} باشد.` };
  const payment = Math.round(num(body.payment));
  if (!(payment > 0)) return { error: 'مبلغ هر قسط را وارد کنید.' };
  if (payment * count < principal) return { error: 'جمع اقساط نمی‌تواند کمتر از مبلغ قسط‌بندی باشد.' };
  if (body.firstDueDate < body.date) return { error: 'سررسید اولین قسط نمی‌تواند قبل از روز قسط‌بندی باشد.' };
  return { value: { id, date: body.date, closeDate: body.closeDate, principal, count, firstDueDate: body.firstDueDate, payment } };
}

/**
 * What the «تبدیل به اقساط» form starts with for a statement: what is left of it, the terms'
 * count, each installment from the terms (the quoted installment scaled to this amount, or the
 * rate), the first due a month after the statement's
 * @param {{ credit: object }} account
 * @param {{ closeDate: string, dueDate: string, remaining: number }} statement
 * @param {string} today
 */
export function conversionDraft(account, statement, today) {
  const terms = account.credit;
  const principal = statement.remaining;
  const count = terms.installmentCount;
  const sample = terms.installmentSample;
  const payment = sample?.principal > 0
    ? Math.round((sample.payment * principal) / sample.principal)
    : calculateFixedInstallmentAmount({ principal, annualRatePct: terms.installmentRatePct || 0, installmentCount: count });
  const { jy, jm, jd } = jalaliOf(statement.dueDate);
  const month = shiftMonth(jy, jm, 1);
  let firstDueDate = isoOfJalali(month.jy, month.jm, jd);
  if (firstDueDate < today) firstDueDate = today;
  return { closeDate: statement.closeDate, date: today, principal, count, payment, firstDueDate };
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
 *   statements: { closeDate: string, dueDate: string, charged: number, paid: number, converted: number,
 *     remaining: number, fee: number, open: boolean, overdue: boolean }[],
 *   plans: { id: string, closeDate: string, date: string, firstDueDate: string, principal: number, count: number,
 *     payment: number, ratePct: number, remaining: number,
 *     installments: { n: number, dueDate: string, principal: number, interest: number, remaining: number, status: 'paid'|'overdue'|'due'|'upcoming' }[] }[],
 *   next: { kind: 'statement'|'installment', dueDate: string, principal: number, cost: number, amount: number, label: string }|null,
 *   overdue: { count: number, amount: number }, // statements past due and installments, with their fee or profit
 * }|null}
 */
export function creditStatus(account, { expenses = [], transfers = [] } = {}, today) {
  const terms = account?.credit;
  if (!terms) return null;
  const { charges, payments } = movementsOf(account, expenses, transfers, today);
  const conversions = (terms.conversions || []).filter((c) => c.date <= today);

  // Each statement: by its closing day
  const statements = new Map();
  const statementOf = (closeDate) => {
    if (!statements.has(closeDate)) {
      statements.set(closeDate, { closeDate, dueDate: addDaysIso(closeDate, terms.graceDays), charged: 0, paid: 0, converted: 0 });
    }
    return statements.get(closeDate);
  };
  charges.forEach((c) => statementOf(closingDateOf(c.date, terms.closingDay)));
  const statementLeft = (s) => s.charged - s.paid - s.converted;

  const plans = [];
  let prepaid = 0;

  function charge(c) {
    const s = statementOf(closingDateOf(c.date, terms.closingDay));
    s.charged += c.amount;
    const covered = Math.min(prepaid, c.amount);
    s.paid += covered;
    prepaid -= covered;
  }

  // To the earliest due first (an installment before a statement due the same day)
  function pay(amount) {
    let left = amount;
    const owed = [
      ...[...statements.values()].filter((s) => statementLeft(s) > 0).map((s) => ({ dueDate: s.dueDate, rank: 1, left: () => statementLeft(s), take: (v) => { s.paid += v; } })),
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

  // The user turned (part of) a statement into the installments the bank set
  function convert(c) {
    const s = statementOf(c.closeDate);
    s.converted += Math.min(c.principal, Math.max(0, statementLeft(s)));
    plans.push({
      ...c,
      ratePct: installmentRateFromAmounts(c.principal, c.payment, c.count).ratePct || 0,
      installments: installmentPlanOf(c.principal, c, c.firstDueDate).map((i) => ({ ...i, remaining: i.principal })),
    });
  }

  // In time order; on one day purchases, then payments, then conversions
  [
    ...charges.map((c) => ({ date: c.date, order: 0, apply: () => charge(c) })),
    ...payments.map((p) => ({ date: p.date, order: 1, apply: () => pay(p.amount) })),
    ...conversions.map((c) => ({ date: c.date, order: 2, apply: () => convert(c) })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order)
    .forEach((e) => e.apply());

  const feeOf = (amount) => Math.round((amount * (terms.settleFeePct || 0)) / 100);
  const openStatements = [...statements.values()]
    .filter((s) => statementLeft(s) > 0 || s.closeDate >= today)
    .sort((a, b) => a.closeDate.localeCompare(b.closeDate))
    .map((s) => ({
      closeDate: s.closeDate,
      dueDate: s.dueDate,
      charged: s.charged,
      paid: s.paid,
      converted: s.converted,
      remaining: Math.max(0, statementLeft(s)),
      fee: feeOf(Math.max(0, statementLeft(s))),
      open: s.closeDate >= today,
      overdue: s.dueDate < today && statementLeft(s) > 0,
    }));

  const statusOf = (i) => (i.remaining <= 0 ? 'paid' : i.dueDate < today ? 'overdue' : i.dueDate === today ? 'due' : 'upcoming');
  const planViews = plans
    .map((p) => ({
      ...p,
      remaining: p.installments.reduce((sum, i) => sum + i.remaining, 0),
      installments: p.installments.map((i) => ({ ...i, status: statusOf(i) })),
    }))
    .filter((p) => p.remaining > 0);

  // An installment's profit in proportion to what is left of it
  const costOf = (i) => (i.principal > 0 ? Math.round((i.interest * i.remaining) / i.principal) : 0);
  const installmentsOwed = planViews.flatMap((p) => p.installments.filter((i) => i.remaining > 0).map((i) => ({ ...i, count: p.count })));
  const statementsOwed = openStatements.filter((s) => s.remaining > 0);
  const debt = statementsOwed.reduce((sum, s) => sum + s.remaining, 0) + installmentsOwed.reduce((sum, i) => sum + i.remaining, 0);

  const owed = [
    ...installmentsOwed.map((i) => ({ kind: 'installment', dueDate: i.dueDate, principal: i.remaining, cost: costOf(i), rank: 0, label: `قسط ${fa(i.n)} از ${fa(i.count)}` })),
    ...statementsOwed.map((s) => ({ kind: 'statement', dueDate: s.dueDate, principal: s.remaining, cost: s.fee, rank: 1, label: 'تسویه‌ی صورت‌حساب' })),
  ]
    .map((o) => ({ ...o, amount: o.principal + o.cost }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.rank - b.rank);
  const first = owed[0] || null;
  const overdueItems = owed.filter((o) => o.dueDate < today);

  return {
    limit: terms.limit,
    debt,
    available: Math.max(0, terms.limit - debt),
    prepaid,
    statements: openStatements,
    plans: planViews,
    next: first && { kind: first.kind, dueDate: first.dueDate, principal: first.principal, cost: first.cost, amount: first.amount, label: first.label },
    overdue: { count: overdueItems.length, amount: overdueItems.reduce((sum, o) => sum + o.amount, 0) },
  };
}

/** The fee and profit already paid for a credit (expenses marked with its id) */
export function creditCostsPaid(accountId, expenses = []) {
  return expenses
    .filter((e) => e.creditAccountId === accountId)
    .reduce((sum, e) => sum + (Math.round(expensePaidInToman(e) || 0)), 0);
}
