/**
 * spendingRecords.js — All spending is in the expenses: money that leaves through another feature
 * is recorded as an everyday expense here, so the expenses (and the projects) are the one place
 * every outflow is
 *
 * - A subscription: each payment it is due (subscriptionDocument.js duePayments) — a new one's
 *   first payment as soon as it is saved, one that renews by itself every renewal as its day
 *   comes («اینترنت و اشتراک‌ها», in its currency, from its account, naming it)
 * - A loan installment marked paid on the loans page (and the earlier ones paid with it), and an
 *   extra payment («پرداخت قسط», naming the installment); marking it unpaid removes its expense
 * - A cleared cheque: its expense (issued) or income (received) — recordLinks.js settleCheque
 *
 * Already in the expenses? An expense of that day with the same amount and currency that names
 * nothing yet is taken as this payment recorded by hand: it is linked (its category becomes the
 * payment's) instead of a second one being made. Otherwise the expense gets an id made from what
 * it records (spendingExpenseId), so recording it again — another device, a second look at the
 * same subscription — writes the same expense, never a second one. The record it names was
 * already changed by its own page, so saving the expense doesn't change it again
 * (`syncLinks: false`). Nothing is recorded without the expenses feature, or in the read-only demo.
 */

import { SUBSCRIPTION_EXPENSE_CATEGORY, duePayments } from '../../utils/subscriptionDocument.js';
import { CATEGORY_LINKS, sameLinkValue } from '../../utils/categoryLinks.js';

/** The expense category of a loan's payments (categoryLinks.js: links the installment) */
export const INSTALLMENT_EXPENSE_CATEGORY = 'installments';

const store = () => import('./vaultExpenses.js');

/** The fields an expense or income names a record in (a recorded payment already linked has one) */
const LINK_FIELDS = {
  expense: [...CATEGORY_LINKS.expense.map((l) => l.field), 'paidFrom'],
  income: CATEGORY_LINKS.income.map((l) => l.field),
};
const sameAmount = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.005;

/**
 * Of a day's records, the one this payment was already recorded as by hand: the same amount and
 * currency, naming nothing yet (not one recorded here)
 * @param {'expense'|'income'} side
 * @param {object[]} records that day's
 * @param {{ amount: number, currency?: string }} payment
 */
export function matchingRecord(side, records, { amount, currency = 'IRT' }) {
  return records.find((r) => !String(r.id).startsWith('exp_s')
    && (r.currency || 'IRT') === currency
    && sameAmount(r.amount, amount)
    && !LINK_FIELDS[side].some((f) => r[f])) || null;
}

/** Two 32-bit FNV-1a hashes of a key, as 16 hex characters */
function hash(key) {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/**
 * The id of the expense that records one outflow (always the same for the same key)
 * @param {string} key e.g. `sub:<id>:<day>`, `loan:<id>:<installment>`
 */
export function spendingExpenseId(key) {
  return `exp_s${hash(String(key))}`;
}

/**
 * Record one outflow as an expense: the one already recording it (its own id, or a matching one
 * of that day recorded by hand, now linked), else a new everyday expense under its own id
 * @param {string} key what it records (spendingExpenseId)
 * @param {object} expense its fields: title, amount, currency, date, category, the link, account
 * @param {{ syncLinks?: boolean }} [options] whether saving it updates the record it names
 */
export async function recordSpending(key, expense, { syncLinks = false } = {}) {
  const { ensureDailyGroup, getExpenseGroups, getExpenses, saveExpense } = await store();
  const id = spendingExpenseId(key);
  const currency = expense.currency || 'IRT';
  const { expenses: sameDay = [] } = await getExpenses({ from: expense.date, to: expense.date });
  const own = sameDay.find((e) => e.id === id) || null;
  const match = own ? null : matchingRecord('expense', sameDay, { amount: expense.amount, currency });
  if (match) {
    // Recorded by hand already: linked, keeping what the user wrote
    const { expense: saved } = await saveExpense({
      category: expense.category,
      ...Object.fromEntries(LINK_FIELDS.expense.filter((f) => expense[f]).map((f) => [f, expense[f]])),
      ...(match.accountId || !expense.accountId ? {} : { accountId: expense.accountId }),
    }, match, { syncLinks });
    return saved;
  }
  const group = await ensureDailyGroup((await getExpenseGroups()).groups || []);
  const { expense: saved } = await saveExpense({ notes: '', ...expense, currency, groupId: own?.groupId || group.id }, own, { id, syncLinks });
  return saved;
}

/**
 * Record one inflow as an income: a matching one of that day recorded by hand (linked now), else
 * a new one (a received cheque's money)
 * @param {object} income its fields: title, amount, incomeDate, category, the link
 */
export async function recordIncome(income) {
  const { getIncomes, createIncome, updateIncome } = await import('../../features/incomes/api/incomeApi.js');
  const { incomes: sameDay = [] } = await getIncomes({ from: income.incomeDate, to: income.incomeDate });
  const match = matchingRecord('income', sameDay.filter((i) => i.incomeDate === income.incomeDate), { amount: income.amount });
  if (match) {
    const { id: _id, createdAt: _c, updatedAt: _u, ...fields } = match;
    return (await updateIncome(match.id, { ...fields, category: income.category, chequeId: income.chequeId || '' })).income;
  }
  return (await createIncome({ notes: '', ...income })).income;
}

/**
 * Record the payments a subscription is due (none when it has them all)
 * @param {object} sub
 * @param {string} today
 * @param {{ saveSubscription: (input: object, existing: object) => Promise<object> }} subscriptions
 *   how the subscription is saved (its `lastPaidOn` moves to the last one recorded)
 * @returns {Promise<object|null>} the subscription saved with its new `lastPaidOn`, or null
 */
export async function recordSubscriptionPayments(sub, today, { saveSubscription }) {
  const days = duePayments(sub, today);
  if (days.length === 0) return null;
  for (const day of days) {
    await recordSpending(`sub:${sub.id}:${day}`, {
      title: sub.name,
      amount: sub.amount,
      currency: sub.currency === 'USD' ? 'USD' : 'IRT',
      date: day,
      category: SUBSCRIPTION_EXPENSE_CATEGORY,
      subscriptionId: sub.id,
      accountId: sub.accountId || '',
    });
  }
  return saveSubscription({ lastPaidOn: days[days.length - 1] }, sub);
}

/**
 * A loan's installments just marked paid on the loans page: each one's expense
 * @param {object} loan the loan (its title)
 * @param {Array<{ id: string, paidDate: string, paidAmount: number }>} installments
 */
export async function recordInstallmentPayments(loan, installments) {
  for (const inst of installments) {
    const amount = Number(inst.paidAmount) || 0;
    if (!inst?.id || !inst.paidDate || !(amount > 0)) continue;
    await recordSpending(`loan:${loan.id}:${inst.id}`, {
      title: `قسط ${loan.title || 'وام'}`,
      amount,
      currency: 'IRT',
      date: inst.paidDate,
      category: INSTALLMENT_EXPENSE_CATEGORY,
      loanInstallment: { loanId: loan.id, installmentId: String(inst.id) },
    });
  }
}

/**
 * An installment marked unpaid on the loans page: the expense that paid it goes — the one
 * recorded here, or one the user recorded in the expenses naming it (found on its paid day)
 * @param {string} loanId
 * @param {string} installmentId
 * @param {string} paidDate the day it had been paid
 */
export async function removeInstallmentPayment(loanId, installmentId, paidDate) {
  const { getExpenses, deleteExpense } = await store();
  const link = { loanId, installmentId: String(installmentId) };
  const ids = new Set([spendingExpenseId(`loan:${loanId}:${installmentId}`)]);
  if (paidDate) {
    const { expenses = [] } = await getExpenses({ from: paidDate, to: paidDate });
    for (const e of expenses) if (e.loanInstallment && sameLinkValue(e.loanInstallment, link)) ids.add(e.id);
  }
  for (const id of ids) await deleteExpense(id, null, { syncLinks: false }).catch(() => {});
}

/**
 * An extra payment on a loan («پرداخت اضافه»): its expense
 * @param {object} loan
 * @param {{ id?: string, amount: number, paymentDate?: string, date?: string }} payment
 */
export async function recordExtraPayment(loan, payment) {
  const amount = Number(payment?.amount) || 0;
  const date = payment?.paymentDate || payment?.date || '';
  if (!(amount > 0) || !date) return;
  await recordSpending(`loanx:${loan.id}:${payment.id || date}`, {
    title: `پرداخت اضافه ${loan.title || 'وام'}`,
    amount,
    currency: 'IRT',
    date,
    category: INSTALLMENT_EXPENSE_CATEGORY,
  });
}
