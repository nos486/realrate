/**
 * spendingBackfill.js — ONE-TIME: puts the payments made before «همه‌ی خرج‌ها در هزینه‌ها» into
 * the expenses and incomes, once per device after the vault opens (SpendingBackfill in App.jsx)
 *
 * - every loan installment already paid, and every extra payment → its expense
 * - every cleared cheque without its record → its income (received) or expense (issued)
 * - every subscription that renews by itself → each renewal from its start through today
 * - (v2) records saved in the retired «پرداخت چک» / «وصول چک» categories → their cheque's own
 *   category (a cheque is a way of paying, not a category), still paid with it
 * - (v3) the rates older expenses stored are dropped (every rate is the price history's)
 * - (v4) an installment recorded more than once (its id changed between payments) keeps one expense
 * - (v5) the installment expenses of a loan that was deleted are removed
 * Each goes through spendingRecords.js: a payment already recorded by hand that day (same amount)
 * is linked instead of recorded twice, and its own id makes a second run (another device, a run
 * cut short) rewrite the same records — so it is safe to run more than once.
 *
 * Temporary: once the release with it has been out long enough for every device to have run it,
 * delete this file and its mount in App.jsx.
 */

import { CHEQUE_CLEARED } from '../../utils/chequeDocument.js';
import { todayIso } from '../utils/dates.js';
import { recordInstallmentPayments, recordExtraPayment, recordSubscriptionPayments, spendingExpenseId, installmentSpendingKey } from './spendingRecords.js';
import { recordOwnerOf } from '../../utils/recordOwners.js';
import { settleCheque } from './recordLinks.js';

const DONE_KEY = 'realrate_spending_backfill_v1';
const CHEQUE_CATEGORY_KEY = 'realrate_cheque_category_v1';
const STORED_RATES_KEY = 'realrate_stored_rates_v1';
const LOAN_DUPLICATES_KEY = 'realrate_loan_duplicates_v2';
const ORPHAN_LOAN_KEY = 'realrate_orphan_loan_expenses_v1';
/** The categories a cheque's record had before cheques became a way of paying */
const RETIRED_CHEQUE_CATEGORY = 'cheques';

function done(userId, key = DONE_KEY) {
  try {
    return localStorage.getItem(`${key}:${userId}`) === '1';
  } catch {
    return false;
  }
}

function markDone(userId, key = DONE_KEY) {
  try {
    localStorage.setItem(`${key}:${userId}`, '1');
  } catch {
    // Blocked storage: it runs again next time, harmlessly
  }
}

/** The day before an ISO day */
function dayBefore(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** The day a cheque cleared: its log's last clearing, else its due day */
const clearedOn = (cheque) => [...(cheque.history || [])].reverse().find((h) => h.status === CHEQUE_CLEARED)?.date || cheque.dueDate;

/** Each step on its own: one that fails doesn't stop the others */
async function step(name, fn) {
  try {
    await fn();
    return true;
  } catch (err) {
    console.warn(`[spendingBackfill] ${name}:`, err?.message || err);
    return false;
  }
}

let running = null;

/**
 * Run it (once per user on this device)
 * @param {{ userId: string, expenses: boolean }} options whether the expenses feature is on
 * @returns {Promise<boolean>} whether it ran to the end
 */
export function runSpendingBackfill({ userId, expenses }) {
  if (!userId || done(userId)) return Promise.resolve(false);
  if (running) return running;
  running = (async () => {
    let ok = true;
    const today = todayIso();

    // Cheques cleared before: their income or expense
    ok = await step('cheques', async () => {
      const { getCheques } = await import('../../features/cheques/api/chequeApi.js');
      const { cheques = [] } = await getCheques();
      for (const cheque of cheques.filter((c) => c.status === CHEQUE_CLEARED && !c.settlement)) {
        await settleCheque(cheque, { date: clearedOn(cheque), expenses });
      }
    }) && ok;

    if (expenses) {
      // Loans: every installment paid, every extra payment
      ok = await step('loans', async () => {
        const api = await import('../../features/loans/api/loanApi.js');
        const { loans = [] } = await api.getLoans();
        for (const summary of loans) {
          const { loan } = await api.getLoanDetail(summary.id);
          const paid = (loan?.installments || [])
            .filter((i) => i.isPaid && i.paidDate)
            .map((i) => ({ id: i.id, paidDate: i.paidDate, paidAmount: i.paidAmount ?? i.totalAmount }));
          await recordInstallmentPayments(loan, paid);
          const { extraPayments = [] } = await api.getLoanExtraPayments(summary.id);
          for (const payment of extraPayments) await recordExtraPayment(loan, payment);
        }
      }) && ok;

      // Subscriptions that renew by themselves: every renewal since they started
      ok = await step('subscriptions', async () => {
        const store = await import('./vaultSubscriptions.js');
        const saveSubscription = async (input, existing) => (await store.saveSubscription(input, existing)).subscription;
        const { subscriptions = [] } = await store.getSubscriptions();
        for (const sub of subscriptions.filter((s) => s.autoRenew && s.startDate)) {
          await recordSubscriptionPayments({ ...sub, lastPaidOn: dayBefore(sub.startDate) }, today, {
            saveSubscription: (input) => saveSubscription(input, sub),
          });
        }
      }) && ok;
    }

    if (ok) markDone(userId);
    // The open tab reads what it shows again
    import('../refresh/pageRefresh.js').then(({ refreshScopes }) => refreshScopes()).catch(() => {});
    return ok;
  })().finally(() => {
    running = null;
  });
  return running;
}

/**
 * (v2) Records saved in the retired cheque categories take their cheque's own category ('other'
 * when it has none), still paid with it — once per user on this device
 * @param {{ userId: string, expenses: boolean }} options
 * @returns {Promise<boolean>} whether it ran to the end
 */
export async function runChequeCategoryMigration({ userId, expenses }) {
  if (!userId || done(userId, CHEQUE_CATEGORY_KEY)) return false;
  const { getCheques } = await import('../../features/cheques/api/chequeApi.js');
  const { cheques = [] } = await getCheques().catch(() => ({ cheques: [] }));
  const categoryOf = (chequeId) => cheques.find((c) => c.id === chequeId)?.category || 'other';
  let ok = await step('cheque incomes', async () => {
    const api = await import('../../features/incomes/api/incomeApi.js');
    const { incomes = [] } = await api.getIncomes();
    for (const income of incomes.filter((i) => i.category === RETIRED_CHEQUE_CATEGORY)) {
      const { id, createdAt: _c, updatedAt: _u, ...fields } = income;
      await api.updateIncome(id, { ...fields, category: categoryOf(income.chequeId) }, { asOwner: true });
    }
  });
  if (expenses) {
    ok = await step('cheque expenses', async () => {
      const store = await import('./vaultExpenses.js');
      const { expenses: all = [] } = await store.getExpenses();
      for (const expense of all.filter((e) => e.category === RETIRED_CHEQUE_CATEGORY)) {
        await store.saveExpense({ category: categoryOf(expense.chequeId) }, expense, { syncLinks: false, asOwner: true });
      }
    }) && ok;
  }
  if (ok) markDone(userId, CHEQUE_CATEGORY_KEY);
  return ok;
}

/**
 * (v3) The rates older expenses stored go (every rate is the price history's by the record's
 * day): one rewrite of those that still have one — once per user on this device
 * @param {{ userId: string, expenses: boolean }} options
 * @returns {Promise<boolean>} whether it ran to the end
 */
export async function runStoredRateCleanup({ userId, expenses }) {
  if (!userId || !expenses || done(userId, STORED_RATES_KEY)) return false;
  const ok = await step('stored rates', async () => {
    const { dropStoredRates } = await import('./vaultExpenses.js');
    await dropStoredRates();
  });
  if (ok) markDone(userId, STORED_RATES_KEY);
  return ok;
}

/**
 * Of the expenses a loan's installments recorded, those that are surely extra copies: each
 * installment that is paid now accounts for one expense (its amount), so the loan's expenses
 * beyond that count for an amount are copies — whatever id their link names (an installment's id
 * changes when it is unpaid and paid again, and the old one no longer resolves). Only expenses
 * recorded by the loan itself count; the ones kept are on the paid days, then the canonical one.
 * Nothing is removed for an amount no installment is paid at now, or when the loan can't be read.
 * @param {object[]} expenses all the expenses
 * @param {Map<string, object>} loans loan id → loan (with its installments)
 * @returns {object[]} the expenses to delete
 */
export function findDuplicateInstallmentExpenses(expenses, loans) {
  const groups = new Map();
  for (const e of expenses) {
    const link = e.loanInstallment;
    if (!link || recordOwnerOf(e) !== 'loan' || !loans.has(link.loanId)) continue;
    const key = `${link.loanId}|${Math.round(Number(e.amount) * 100)}|${e.currency || ''}`;
    if (!groups.has(key)) groups.set(key, { loanId: link.loanId, amount: Number(e.amount), copies: [] });
    groups.get(key).copies.push(e);
  }
  const doomed = [];
  for (const { loanId, amount, copies } of groups.values()) {
    const paid = (loans.get(loanId).installments || [])
      .filter((i) => i.isPaid && i.paidDate && Math.abs((Number(i.paidAmount) || 0) - amount) < 0.5);
    if (paid.length === 0 || copies.length <= paid.length) continue;
    const left = [...copies];
    const take = (match) => {
      const at = left.findIndex(match);
      return at === -1 ? null : left.splice(at, 1)[0];
    };
    const kept = new Set();
    for (const inst of paid) {
      const canonical = spendingExpenseId(installmentSpendingKey(loanId, inst));
      const one = take((e) => e.id === canonical) || take((e) => e.date === inst.paidDate);
      if (one) kept.add(one);
    }
    // An installment whose own day has no copy still keeps one
    for (const e of left.slice(0, Math.max(0, paid.length - kept.size))) kept.add(e);
    for (const e of copies) if (!kept.has(e)) doomed.push(e);
  }
  return doomed;
}

/**
 * (v4) An installment recorded as an expense more than once keeps one — once per user on this
 * device (findDuplicateInstallmentExpenses says which are removed)
 * @param {{ userId: string, expenses: boolean }} options
 * @returns {Promise<boolean>} whether it ran to the end
 */
export async function runLoanDuplicateCleanup({ userId, expenses }) {
  if (!userId || !expenses || done(userId, LOAN_DUPLICATES_KEY)) return false;
  const ok = await step('loan duplicates', async () => {
    const store = await import('./vaultExpenses.js');
    const api = await import('../../features/loans/api/loanApi.js');
    const { expenses: all = [] } = await store.getExpenses();
    const loanIds = [...new Set(all.filter((e) => e.loanInstallment && recordOwnerOf(e) === 'loan').map((e) => e.loanInstallment.loanId))];
    const loans = new Map();
    for (const id of loanIds) {
      const { loan } = await api.getLoanDetail(id).catch(() => ({}));
      if (loan) loans.set(id, loan);
    }
    for (const e of findDuplicateInstallmentExpenses(all, loans)) {
      await store.deleteExpense(e.id, e, { syncLinks: false, asOwner: true });
    }
  });
  if (ok) markDone(userId, LOAN_DUPLICATES_KEY);
  return ok;
}

/**
 * The installment expenses recorded by a loan that no longer exists (its deletion used to leave
 * them behind). Only ones the loan recorded and that name the missing loan.
 * @param {object[]} expenses all the expenses
 * @param {Set<string>} loanIds the loans that exist
 * @returns {object[]} the expenses to delete
 */
export function findOrphanLoanExpenses(expenses, loanIds) {
  return expenses.filter((e) => e.loanInstallment && recordOwnerOf(e) === 'loan' && !loanIds.has(e.loanInstallment.loanId));
}

/**
 * (v5) The installment expenses of deleted loans go — once per user on this device
 * @param {{ userId: string, expenses: boolean }} options
 * @returns {Promise<boolean>} whether it ran to the end
 */
export async function runOrphanLoanExpenseCleanup({ userId, expenses }) {
  if (!userId || !expenses || done(userId, ORPHAN_LOAN_KEY)) return false;
  const ok = await step('orphan loan expenses', async () => {
    const store = await import('./vaultExpenses.js');
    const api = await import('../../features/loans/api/loanApi.js');
    // A loans list that could not be read must not look like "no loans"
    const { loans, success } = await api.getLoans();
    if (success === false || !Array.isArray(loans)) throw new Error('loans not readable');
    const { expenses: all = [] } = await store.getExpenses();
    for (const e of findOrphanLoanExpenses(all, new Set(loans.map((l) => l.id)))) {
      await store.deleteExpense(e.id, e, { syncLinks: false, asOwner: true });
    }
  });
  if (ok) markDone(userId, ORPHAN_LOAN_KEY);
  return ok;
}
