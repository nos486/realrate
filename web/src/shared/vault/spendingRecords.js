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
 * nothing yet is taken as this payment recorded by hand: it is linked instead of a second one
 * being made (its category becomes the payment's only when the link is a category's — a
 * subscription, an installment; paid with a cheque, it keeps its own). Otherwise the expense gets an id made from what
 * it records (spendingExpenseId), so recording it again — another device, a second look at the
 * same subscription — writes the same expense, never a second one. The record it names was
 * already changed by its own page, so saving the expense doesn't change it again
 * (`syncLinks: false`). Nothing is recorded without the expenses feature, or in the read-only demo.
 *
 * What is recorded here belongs to the feature that recorded it (`recordedBy`, recordOwners.js):
 * the expenses and incomes don't edit or delete it — only its own page does, through here.
 */

import { intlLocale, t } from '../../utils/i18n.js';
import { SUBSCRIPTION_EXPENSE_CATEGORY, duePayments } from '../../utils/subscriptionDocument.js';
import { categoryLinkOf, linkFieldsOf, sameLinkValue } from '../../utils/categoryLinks.js';
import { BASE_CURRENCY, normalizeCurrency } from '../../utils/currencies.js';
import { SPENDING_ID_PREFIX, recordOwnerOf } from '../../utils/recordOwners.js';

/** The expense category of a loan's payments (categoryLinks.js: links the installment) */
export const INSTALLMENT_EXPENSE_CATEGORY = 'installments';

const store = () => import('./vaultExpenses.js');

/** The fields an expense or income names a record in (a recorded payment already linked has one) */
const LINK_FIELDS = {
  expense: [...linkFieldsOf('expense'), 'paidFrom'],
  income: linkFieldsOf('income'),
};
const sameAmount = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.005;

/** How far (as a share of the payment) a hand-recorded amount may be from an installment's: bank fees */
export const INSTALLMENT_AMOUNT_TOLERANCE = 0.05;

/**
 * Of a day's records, the one this payment was already recorded as by hand: the same amount and
 * currency, naming nothing yet (not one recorded here)
 * @param {'expense'|'income'} side
 * @param {object[]} records that day's
 * @param {{ amount: number, currency?: string }} payment
 * @param {number} [tolerance] a share of the amount the record may differ by (a bank fee on top
 *   of an installment); the closest amount wins. 0: exactly the same.
 */
export function matchingRecord(side, records, { amount, currency = BASE_CURRENCY }, tolerance = 0) {
  const target = Number(amount) || 0;
  const limit = Math.max(0.005, Math.abs(target) * tolerance);
  const candidates = records.filter((r) => !String(r.id).startsWith(SPENDING_ID_PREFIX)
    && normalizeCurrency(r.currency) === normalizeCurrency(currency)
    && Math.abs((Number(r.amount) || 0) - target) <= limit
    && !LINK_FIELDS[side].some((f) => r[f]));
  candidates.sort((a, b) => Math.abs(a.amount - target) - Math.abs(b.amount - target));
  return candidates[0] || null;
}

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
 * Record one outflow as an expense: the one already recording it (its own id, or a matching one
 * of that day recorded by hand, now linked), else a new everyday expense under its own id
 * @param {string} key what it records (spendingExpenseId)
 * @param {object} expense its fields: title, amount, currency, date, category, the link, account
 * @param {{ owner: string, syncLinks?: boolean }} options the feature recording it
 *   (recordOwners.js: it is that feature's from now on); whether saving it updates the record it
 *   names; `tolerance`: see matchingRecord; `installmentNumber`: of the installment it pays. An expense of that day already naming the same
 *   installment (the user's own, e.g. from a bank SMS) is this payment: nothing is recorded again.
 */
export async function recordSpending(key, expense, { owner, syncLinks = false, tolerance = 0, installmentNumber = 0 } = {}) {
  const { ensureDailyGroup, getExpenseGroups, getExpenses, saveExpense } = await store();
  const id = spendingExpenseId(key);
  const currency = normalizeCurrency(expense.currency);
  const { expenses: sameDay = [] } = await getExpenses({ from: expense.date, to: expense.date });
  const own = sameDay.find((e) => e.id === id) || null;
  const namesIt = own || !expense.loanInstallment ? null
    : sameDay.find((e) => e.id !== id && sameInstallment(e.loanInstallment, expense.loanInstallment, installmentNumber));
  if (namesIt) return namesIt;
  const match = own ? null : matchingRecord('expense', sameDay, { amount: expense.amount, currency }, tolerance);
  if (match) {
    // Recorded by hand already: linked, keeping what the user wrote (a category link needs its category)
    const { expense: saved } = await saveExpense({
      ...(categoryLinkOf('expense', expense.category) ? { category: expense.category } : {}),
      ...Object.fromEntries(LINK_FIELDS.expense.filter((f) => expense[f]).map((f) => [f, expense[f]])),
      ...(match.accountId || !expense.accountId ? {} : { accountId: expense.accountId }),
      // Now this payment's: changed from its feature's page only
      recordedBy: owner,
    }, match, { syncLinks, asOwner: true });
    return saved;
  }
  const group = await ensureDailyGroup((await getExpenseGroups()).groups || []);
  const { expense: saved } = await saveExpense(
    { notes: '', ...expense, currency, groupId: own?.groupId || group.id, recordedBy: owner },
    own,
    { id, syncLinks, asOwner: true },
  );
  return saved;
}

/**
 * Record one inflow as an income: a matching one of that day recorded by hand (linked now), else
 * a new one (a received cheque's money)
 * @param {object} income its fields: title, amount, incomeDate, category, the link
 * @param {{ owner: string }} options the feature recording it (recordOwners.js)
 */
export async function recordIncome(income, { owner } = {}) {
  const { getIncomes, createIncome, updateIncome } = await import('../../features/incomes/api/incomeApi.js');
  const { incomes: sameDay = [] } = await getIncomes({ from: income.incomeDate, to: income.incomeDate });
  const match = matchingRecord('income', sameDay.filter((i) => i.incomeDate === income.incomeDate), { amount: income.amount });
  if (match) {
    const { id: _id, createdAt: _c, updatedAt: _u, ...fields } = match;
    // Its own category stays unless the link is a category's
    const category = categoryLinkOf('income', income.category) ? income.category : fields.category;
    return (await updateIncome(match.id, { ...fields, category, chequeId: income.chequeId || '', recordedBy: owner }, { asOwner: true })).income;
  }
  return (await createIncome({ notes: '', ...income, recordedBy: owner })).income;
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
    }, { owner: 'loan', tolerance: INSTALLMENT_AMOUNT_TOLERANCE, installmentNumber: installmentNumberOf(inst) });
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
