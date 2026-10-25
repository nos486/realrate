/**
 * spendingRecords.js — All spending is in the expenses: money that leaves through another feature
 * is recorded as an everyday expense here, so the expenses (and the projects) are the one place
 * every outflow is
 *
 * - A subscription: each payment it is due (subscriptionDocument.js duePayments) — a new one's
 *   first payment as soon as it is saved, one that renews by itself every renewal as its day
 *   comes («اینترنت و اشتراک‌ها», in its currency, from its account, naming it). A payment some
 *   expense naming it already pays (paysPayment: recorded under another day, before its start
 *   date was edited) is not recorded again; an edit moves its payments with it
 *   (followSubscriptionEdit)
 * - A loan installment marked paid on the loans page (and the earlier ones paid with it), and an
 *   extra payment («پرداخت قسط», naming the installment); marking it unpaid removes its expense
 * - A cleared cheque: its expense (issued) or income (received) — recordLinks.js settleCheque
 *
 * Already in the expenses? Only an expense that names the payment itself counts (an installment
 * the user linked, e.g. from a bank SMS) — the amount is never a reason to take another record as
 * this payment: each payment always gets its own expense, under an id made from what it records
 * (spendingExpenseId), so recording it again — another device, a second look at the
 * same subscription — writes the same expense, never a second one. The record it names was
 * already changed by its own page, so saving the expense doesn't change it again
 * (`syncLinks: false`). Nothing is recorded without the expenses feature, or in the read-only demo.
 *
 * What is recorded here belongs to the feature that recorded it (`recordedBy`, recordOwners.js):
 * the expenses and incomes don't edit or delete it — only its own page does, through here.
 */

import { intlLocale, t } from '../../utils/i18n.js';
import {
  SUBSCRIPTION_EXPENSE_CATEGORY, duePayments, paysPayment, paymentSearchRange, rescheduledDay,
} from '../../utils/subscriptionDocument.js';
import { sameLinkValue } from '../../utils/categoryLinks.js';
import { BASE_CURRENCY, normalizeCurrency } from '../../utils/currencies.js';
import { SPENDING_ID_PREFIX, recordOwnerOf } from '../../utils/recordOwners.js';

/** The expense category of a loan's payments (categoryLinks.js: links the installment) */
export const INSTALLMENT_EXPENSE_CATEGORY = 'installments';

const store = () => import('./vaultExpenses.js');

/**
 * Whether two installment links name the same installment: its id is not stable (see
 * installmentNumberOf), so the same loan and the same place in the schedule count too
 * @param {{ loanId: string, installmentId: string }|null} a
 * @param {{ loanId: string, installmentId: string }|null} b
 * @param {number} [number] b's place in the schedule when its id doesn't tell
 */
export function sameInstallment(a, b, number = 0) {
  if (!a || !b || a.loanId !== b.loanId) return false;
  if (String(a.installmentId) === String(b.installmentId)) return true;
  const n = number || installmentNumberOf({ id: b.installmentId });
  return n > 0 && n === installmentNumberOf({ id: a.installmentId });
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
  return `${SPENDING_ID_PREFIX}${hash(String(key))}`;
}

/**
 * Record one outflow as an expense: the one already recording it (its own id, or one naming the
 * installment), else a new everyday expense under its own id; never another record taken by its amount
 * @param {string} key what it records (spendingExpenseId)
 * @param {object} expense its fields: title, amount, currency, date, category, the link, account
 * @param {{ owner: string, syncLinks?: boolean }} options the feature recording it
 *   (recordOwners.js: it is that feature's from now on); whether saving it updates the record it
 *   names; `installmentNumber`: of the installment it pays. An expense of that day already naming
 *   the same installment (the user's own, e.g. from a bank SMS) is this payment: nothing is
 *   recorded again.
 */
export async function recordSpending(key, expense, { owner, syncLinks = false, installmentNumber = 0 } = {}) {
  const { ensureDailyGroup, getExpenseGroups, getExpenses, saveExpense } = await store();
  const id = spendingExpenseId(key);
  const currency = normalizeCurrency(expense.currency);
  const { expenses: sameDay = [] } = await getExpenses({ from: expense.date, to: expense.date });
  const own = sameDay.find((e) => e.id === id) || null;
  const namesIt = own || !expense.loanInstallment ? null
    : sameDay.find((e) => e.id !== id && sameInstallment(e.loanInstallment, expense.loanInstallment, installmentNumber));
  if (namesIt) return namesIt;
  const group = await ensureDailyGroup((await getExpenseGroups()).groups || []);
  const { expense: saved } = await saveExpense(
    { notes: '', ...expense, currency, groupId: own?.groupId || group.id, recordedBy: owner },
    own,
    { id, syncLinks, asOwner: true },
  );
  return saved;
}

/**
 * Record one inflow as an income (a received cheque's money): always a new one, never another
 * income taken by its amount
 * @param {object} income its fields: title, amount, incomeDate, category, the link
 * @param {{ owner: string }} options the feature recording it (recordOwners.js)
 */
export async function recordIncome(income, { owner } = {}) {
  const { createIncome } = await import('../../features/incomes/api/incomeApi.js');
  return (await createIncome({ notes: '', ...income, recordedBy: owner })).income;
}

/** The expenses naming a subscription in [from, to] */
async function subscriptionExpenses(subId, range = {}) {
  const { getExpenses } = await store();
  const { expenses = [] } = await getExpenses(range);
  return expenses.filter((e) => e.subscriptionId === subId);
}

/**
 * Record the payments a subscription is due (none when it has them all). A payment an expense
 * naming it already pays — the subscription's own, recorded under another day, or the user's —
 * is not recorded again, whatever its `lastPaidOn` says (a stale copy, another device).
 * @param {object} sub
 * @param {string} today
 * @param {{ saveSubscription: (input: object, existing: object) => Promise<object> }} subscriptions
 *   how the subscription is saved (its `lastPaidOn` moves to the last one due)
 * @returns {Promise<object|null>} the subscription saved with its new `lastPaidOn`, or null
 */
export async function recordSubscriptionPayments(sub, today, { saveSubscription }) {
  const days = duePayments(sub, today);
  if (days.length === 0) return null;
  const recorded = await subscriptionExpenses(sub.id, paymentSearchRange(sub, days));
  for (const day of days) {
    if (recorded.some((e) => paysPayment(sub, day, e.date))) continue;
    await recordSpending(`sub:${sub.id}:${day}`, {
      title: sub.name,
      amount: sub.amount,
      currency: normalizeCurrency(sub.currency),
      date: day,
      category: SUBSCRIPTION_EXPENSE_CATEGORY,
      subscriptionId: sub.id,
      accountId: sub.accountId || '',
    }, { owner: 'subscription' });
  }
  return saveSubscription({ lastPaidOn: days[days.length - 1] }, sub);
}

/**
 * A subscription just edited: the payments it recorded follow it — its name, the renewal day of
 * each (rescheduledDay: a start date moved moves them; never past `today`), and the latest one
 * its amount, currency and account (older payments were made at what they were then). The
 * user's own payments naming it are theirs and stay.
 * @param {object} sub the subscription as saved
 * @param {object} before its stored copy before the edit
 * @param {string} today
 * @returns {Promise<number>} how many payments changed
 */
export async function followSubscriptionEdit(sub, before, today) {
  if (!sub || !before) return 0;
  const scheduleMoved = sub.startDate !== before.startDate || sub.cycleMonths !== before.cycleMonths;
  const priced = sub.amount !== before.amount || normalizeCurrency(sub.currency) !== normalizeCurrency(before.currency)
    || (sub.accountId || '') !== (before.accountId || '');
  if (!scheduleMoved && !priced && sub.name === before.name) return 0;
  const { saveExpense } = await store();
  const from = [sub.startDate, before.startDate].sort()[0];
  const own = (await subscriptionExpenses(sub.id, { from })).filter((e) => recordOwnerOf(e) === 'subscription');
  const latest = own.reduce((last, e) => (!last || e.date > last.date ? e : last), null);
  let changed = 0;
  for (const e of own) {
    const patch = {};
    if (sub.name !== before.name && e.title === before.name) patch.title = sub.name;
    const day = rescheduledDay(before, sub, e.date);
    if (day !== e.date && day <= today) patch.date = day;
    if (e === latest && priced) {
      Object.assign(patch, { amount: sub.amount, currency: normalizeCurrency(sub.currency), accountId: sub.accountId || '' });
    }
    if (Object.keys(patch).length === 0) continue;
    await saveExpense(patch, e, { syncLinks: false, asOwner: true });
    changed++;
  }
  return changed;
}

/**
 * The number of an installment (its place in the schedule). Its id is not stable: the same
 * installment is `inst_<loan>_N` while computed, a generated id once a payment row exists, and a
 * new one after being unpaid and paid again — so what it records is keyed by this number.
 * @param {{ installmentNumber?: number, id?: string|number }} inst
 * @returns {number} 0 when unknown
 */
export function installmentNumberOf(inst) {
  const n = Number(inst?.installmentNumber);
  if (n > 0) return n;
  const id = String(inst?.id ?? '');
  return Number(id.match(/^(\d+)$|_(\d+)$/)?.slice(1).find(Boolean)) || 0;
}

/** The key of the expense that records a loan's installment (spendingExpenseId) */
export const installmentSpendingKey = (loanId, inst) => {
  const n = installmentNumberOf(inst);
  return `loan:${loanId}:${n ? `n${n}` : inst.id}`;
};

/**
 * A loan's installments just marked paid on the loans page: each one's expense
 * @param {object} loan the loan (its title)
 * @param {Array<{ id: string, paidDate: string, paidAmount: number }>} installments
 * @param {{ accountId?: string }} [options] `accountId`: the account they were paid from
 */
export async function recordInstallmentPayments(loan, installments, { accountId = '' } = {}) {
  for (const inst of installments) {
    const amount = Number(inst.paidAmount) || 0;
    if (!inst?.id || !inst.paidDate || !(amount > 0)) continue;
    await recordSpending(installmentSpendingKey(loan.id, inst), {
      title: installmentNumberOf(inst) ? t('قسط {n} {title}', { n: installmentNumberOf(inst).toLocaleString(intlLocale()), title: loan.title || t('وام') }) : t('قسط {title}', { title: loan.title || t('وام') }),
      amount,
      currency: BASE_CURRENCY,
      date: inst.paidDate,
      category: INSTALLMENT_EXPENSE_CATEGORY,
      ...(accountId ? { accountId } : {}),
      loanInstallment: { loanId: loan.id, installmentId: String(inst.id) },
    }, { owner: 'loan', installmentNumber: installmentNumberOf(inst) });
  }
}

/**
 * An installment was just paid by an expense the user recorded (a bank SMS, the form) naming it:
 * the expense the loans page had recorded for it earlier is a duplicate and goes — the user's
 * own, with the real amount and account, is the one kept
 * @param {{ loanId: string, installmentId: string }} link
 * @param {string} keepId the user's expense
 * @param {string[]} [days] the days the installment had been paid on before
 * @param {number} [installmentNumber]
 */
export async function dropDuplicateInstallmentPayments(link, keepId, days = [], installmentNumber = 0) {
  const { getExpenses, deleteExpense } = await store();
  const ids = new Set([
    spendingExpenseId(installmentSpendingKey(link.loanId, { id: link.installmentId, installmentNumber })),
    spendingExpenseId(`loan:${link.loanId}:${link.installmentId}`),
  ]);
  for (const day of new Set(days.filter(Boolean))) {
    const { expenses = [] } = await getExpenses({ from: day, to: day });
    for (const e of expenses) {
      if (e.loanInstallment && sameInstallment(e.loanInstallment, link, installmentNumber) && recordOwnerOf(e) === 'loan') ids.add(e.id);
    }
  }
  ids.delete(keepId);
  for (const id of ids) await deleteExpense(id, null, { syncLinks: false, asOwner: true }).catch(() => {});
}

/**
 * An installment marked unpaid on the loans page: the expense that paid it goes — the one
 * recorded here, or one the user recorded in the expenses naming it (found on its paid day)
 * @param {string} loanId
 * @param {string} installmentId
 * @param {string} paidDate the day it had been paid
 * @param {number} [installmentNumber] its place in the schedule (installmentNumberOf)
 */
export async function removeInstallmentPayment(loanId, installmentId, paidDate, installmentNumber = 0) {
  const { getExpenses, deleteExpense } = await store();
  const link = { loanId, installmentId: String(installmentId) };
  const ids = new Set([
    spendingExpenseId(installmentSpendingKey(loanId, { id: installmentId, installmentNumber })),
    // Recorded under the id it had then, before expenses were keyed by number
    spendingExpenseId(`loan:${loanId}:${installmentId}`),
  ]);
  if (paidDate) {
    const { expenses = [] } = await getExpenses({ from: paidDate, to: paidDate });
    for (const e of expenses) if (e.loanInstallment && sameLinkValue(e.loanInstallment, link)) ids.add(e.id);
  }
  for (const id of ids) await deleteExpense(id, null, { syncLinks: false, asOwner: true }).catch(() => {});
}

/**
 * A loan deleted: every expense it recorded goes with it — its installments' and its extra
 * payments' (the ones the user made by hand stay, even when the loan took them over)
 * @param {string} loanId
 * @param {string[]} [extraPaymentIds] the ids of the loan's extra payments (read before it was deleted)
 */
export async function removeLoanPayments(loanId, extraPaymentIds = []) {
  const { getExpenses, deleteExpense } = await store();
  const { expenses = [] } = await getExpenses();
  const extraIds = new Set(extraPaymentIds.map((id) => spendingExpenseId(`loanx:${loanId}:${id}`)));
  for (const e of expenses) {
    const installment = e.loanInstallment?.loanId === loanId && recordOwnerOf(e) === 'loan' && e.id.startsWith(SPENDING_ID_PREFIX);
    if (installment || extraIds.has(e.id)) await deleteExpense(e.id, e, { syncLinks: false, asOwner: true });
  }
}

/**
 * A loan renamed: the title of every expense it recorded (installments and extra payments) ends
 * with the new name; the ones the user made by hand keep their own
 * @param {string} loanId
 * @param {string} oldTitle the loan's title before
 * @param {string} newTitle
 * @param {string[]} [extraPaymentIds] the ids of the loan's extra payments
 */
export async function renameLoanPayments(loanId, oldTitle, newTitle, extraPaymentIds = []) {
  const from = oldTitle || t('وام');
  const to = newTitle || t('وام');
  if (from === to) return;
  const { getExpenses, saveExpense } = await store();
  const { expenses = [] } = await getExpenses();
  const extraIds = new Set(extraPaymentIds.map((id) => spendingExpenseId(`loanx:${loanId}:${id}`)));
  for (const e of expenses) {
    const ours = recordOwnerOf(e) === 'loan' && e.id.startsWith(SPENDING_ID_PREFIX)
      && (e.loanInstallment?.loanId === loanId || extraIds.has(e.id));
    if (!ours || !String(e.title).endsWith(` ${from}`)) continue;
    await saveExpense({ title: `${e.title.slice(0, -from.length)}${to}`.slice(0, 120) }, e, { syncLinks: false, asOwner: true });
  }
}

/**
 * An extra payment on a loan («پرداخت اضافه»): its expense
 * @param {object} loan
 * @param {{ id?: string, amount: number, paymentDate?: string, date?: string }} payment
 * @param {{ accountId?: string }} [options] `accountId`: the account it was paid from
 */
export async function recordExtraPayment(loan, payment, { accountId = '' } = {}) {
  const amount = Number(payment?.amount) || 0;
  const date = payment?.paymentDate || payment?.date || '';
  if (!(amount > 0) || !date) return;
  await recordSpending(`loanx:${loan.id}:${payment.id || date}`, {
    title: t('پرداخت اضافه {title}', { title: loan.title || t('وام') }),
    amount,
    currency: BASE_CURRENCY,
    date,
    category: INSTALLMENT_EXPENSE_CATEGORY,
    ...(accountId ? { accountId } : {}),
  }, { owner: 'loan' });
}
