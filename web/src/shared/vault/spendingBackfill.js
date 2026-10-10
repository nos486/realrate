/**
 * spendingBackfill.js — ONE-TIME: puts the payments made before «همه‌ی خرج‌ها در هزینه‌ها» into
 * the expenses and incomes, once per device after the vault opens (SpendingBackfill in App.jsx)
 *
 * - every loan installment already paid, and every extra payment → its expense
 * - every cleared cheque without its record → its income (received) or expense (issued)
 * - every subscription that renews by itself → each renewal from its start through today
 * - (v2) records saved in the retired «پرداخت چک» / «وصول چک» categories → their cheque's own
 *   category (a cheque is a way of paying, not a category), still paid with it
 * Each goes through spendingRecords.js: a payment already recorded by hand that day (same amount)
 * is linked instead of recorded twice, and its own id makes a second run (another device, a run
 * cut short) rewrite the same records — so it is safe to run more than once.
 *
 * Temporary: once the release with it has been out long enough for every device to have run it,
 * delete this file and its mount in App.jsx.
 */

import { CHEQUE_CLEARED } from '../../utils/chequeDocument.js';
import { todayIso } from '../utils/dates.js';
import { recordInstallmentPayments, recordExtraPayment, recordSubscriptionPayments } from './spendingRecords.js';
import { settleCheque } from './recordLinks.js';

const DONE_KEY = 'realrate_spending_backfill_v1';
const CHEQUE_CATEGORY_KEY = 'realrate_cheque_category_v1';
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
      await api.updateIncome(id, { ...fields, category: categoryOf(income.chequeId) });
    }
  });
  if (expenses) {
    ok = await step('cheque expenses', async () => {
      const store = await import('./vaultExpenses.js');
      const { expenses: all = [] } = await store.getExpenses();
      for (const expense of all.filter((e) => e.category === RETIRED_CHEQUE_CATEGORY)) {
        await store.saveExpense({ category: categoryOf(expense.chequeId) }, expense, { syncLinks: false });
      }
    }) && ok;
  }
  if (ok) markDone(userId, CHEQUE_CATEGORY_KEY);
  return ok;
}
