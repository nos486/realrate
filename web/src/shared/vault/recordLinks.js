/**
 * recordLinks.js — What linking an income or an expense to a record by its category does to that
 * record (utils/categoryLinks.js says which category links to what, through which field)
 *
 * The encrypted store runs it after every save (syncRecordLinks: the record and its copy before)
 * and every delete (releaseRecordLinks), so each path that saves a record — a form, a bank SMS,
 * the subscriptions or cheques page — keeps both sides in step:
 *  - cheque: linked → the cheque is cleared on the record's day and points back at the record
 *    (`settlement`); unlinked or deleted → the pointer goes, and a cheque cleared through that
 *    record goes back to the status it had before
 *  - loan_installment: linked → that installment is paid on the record's day, at its amount (an
 *    expense an older loans page had recorded for it is dropped: this one is the payment); one
 *    record may name several installments (a deduction covering more than one loan), each paid at
 *    its own amount; unlinked or deleted → unpaid again
 *  - subscription: linked → it moves on a cycle (renewedAfter) — unless it was already paid
 *    through that day (its first payment, or an older one recorded late); unlinking leaves it
 * Portfolio links are written by vaultExpenses / vaultIncomes themselves (portfolioFunds.js), and
 * a credit settlement changes nothing on the credit (its figures are read from the incomes).
 *
 * The other way round, a cheque cleared on the cheques page records its money here
 * (settleCheque: an income for a received cheque, an expense for an issued one — or links the one
 * already recorded by hand that day, spendingRecords.js), and taking the clearing back removes
 * that record (unsettleCheque).
 * An effect that fails never undoes the saved record: it is logged, and the screens read again.
 */

import { CHEQUE_DIRECTION_OF, installmentLinksOf, recordLinksOf, sameLinkValue } from '../../utils/categoryLinks.js';
import { CHEQUE_CLEARED, applyChequeStatus } from '../../utils/chequeDocument.js';
import { renewedAfter } from '../../utils/subscriptionDocument.js';
import { todayIso } from '../utils/dates.js';
import { t } from '../../utils/i18n.js';

/** The day a record moved money */
const dayOf = (side, record) => (side === 'income' ? record.incomeDate : record.date);

// Loaded when first needed (they load this module too)
const cheques = () => import('../../features/cheques/api/chequeApi.js');
const loans = () => import('../../features/loans/api/loanApi.js');
const subscriptions = () => import('./vaultSubscriptions.js');

/** The editable fields of a stored cheque (what its store accepts back) */
function chequeInput(cheque) {
  const { id: _id, userId: _userId, createdAt: _c, updatedAt: _u, ...input } = cheque;
  return input;
}

async function findCheque(id) {
  const { cheques: list = [] } = await (await cheques()).getCheques();
  return list.find((c) => c.id === id) || null;
}

/** The status a cheque had before it was cleared (its log's last other entry) */
function statusBeforeClearing(cheque) {
  const before = [...(cheque.history || [])].reverse().find((h) => h.status !== CHEQUE_CLEARED);
  return before?.status || 'pending';
}

/**
 * Pay one installment with a record: on the record's day, at the record's amount when it paid
 * that installment alone (otherwise the installment's own amount), dropping the expense an older
 * version of the loans page had recorded for it
 */
async function attachInstallment({ loanId, installmentId }, record, side, alone) {
  const api = await loans();
  const before = (await Promise.resolve().then(() => api.getLoanDetail(loanId)).catch(() => null))?.loan?.installments
    ?.find((i) => String(i.id) === String(installmentId));
  await api.markInstallmentPaid(loanId, installmentId, { paidDate: dayOf(side, record), paidAmount: alone ? Number(record.amount) || undefined : undefined });
  const spending = await import('./spendingRecords.js');
  // Best effort: the installment is paid either way
  await spending.dropDuplicateInstallmentPayments(
    { loanId, installmentId },
    record.id,
    [before?.isPaid && before.paidDate, dayOf(side, record)],
    spending.installmentNumberOf(before || { id: installmentId }),
  ).catch((err) => console.warn('[recordLinks] duplicate installment expense not dropped:', err?.message || err));
}

/** Each target: what linking (`attach`) and unlinking (`detach`) a record does, and the screen it changes */
const EFFECTS = {
  cheque: {
    scope: 'cheques',
    async attach(chequeId, record, side) {
      const cheque = await findCheque(chequeId);
      if (!cheque || cheque.direction !== CHEQUE_DIRECTION_OF[side]) return;
      if (cheque.settlement?.id === record.id && cheque.status === CHEQUE_CLEARED) return;
      const cleared = cheque.status === CHEQUE_CLEARED
        ? cheque
        : applyChequeStatus(cheque, CHEQUE_CLEARED, dayOf(side, record), side === 'income' ? t('وصول با ثبت درآمد') : t('پرداخت با ثبت هزینه'));
      await (await cheques()).updateCheque(cheque.id, chequeInput({ ...cleared, settlement: { side, id: record.id } }));
    },
    async detach(chequeId, record) {
      const cheque = await findCheque(chequeId);
      if (!cheque || cheque.settlement?.id !== record.id) return;
      // Cleared through this record: back to where it was
      const next = cheque.status === CHEQUE_CLEARED
        ? applyChequeStatus(cheque, statusBeforeClearing(cheque), todayIso(), t('ثبت وصول یا پرداختش حذف شد'))
        : cheque;
      await (await cheques()).updateCheque(cheque.id, chequeInput({ ...next, settlement: null }));
    },
  },
  loan_installment: {
    scope: 'loans',
    async attach(value, record, side) {
      const links = installmentLinksOf(value);
      // One payment covering several installments: each is paid at its own amount, not the payment's
      for (const link of links) await attachInstallment(link, record, side, links.length === 1);
    },
    async detach(value) {
      for (const { loanId, installmentId } of installmentLinksOf(value)) {
        await (await loans()).unmarkInstallmentPaid(loanId, installmentId);
      }
    },
  },
  subscription: {
    scope: 'subscriptions',
    async attach(subscriptionId, record, side) {
      const store = await subscriptions();
      const sub = (await store.getSubscriptions()).subscriptions.find((s) => s.id === subscriptionId);
      const day = dayOf(side, record);
      // Already paid through this day: its first payment, or an older one recorded late
      if (!sub || (sub.lastPaidOn && day <= sub.lastPaidOn)) return;
      await store.saveSubscription(renewedAfter(sub, day), sub);
    },
    async detach() {
      // A payment taken away doesn't move a subscription back: its renewal is edited by hand
    },
  },
};

/** The id-style links of a side (the portfolio ones are the store's own) */
const linksOf = (side) => recordLinksOf(side).filter((l) => EFFECTS[l.target]);

async function run(effects) {
  const scopes = new Set();
  for (const { target, step } of effects) {
    try {
      await step();
    } catch (err) {
      console.warn(`[recordLinks] ${target} could not be updated:`, err?.message || err);
    }
    scopes.add(EFFECTS[target].scope);
  }
  // The screens showing those records read them again
  if (scopes.size) {
    import('../refresh/pageRefresh.js')
      .then(({ refreshScopes }) => refreshScopes({ scopes: [...scopes] }))
      .catch(() => {});
  }
}

/**
 * After a record is saved: link what it now names, unlink what it no longer does
 * @param {'expense'|'income'} side
 * @param {object} record the saved record
 * @param {object|null} before its stored copy before the save (null: new)
 */
export async function syncRecordLinks(side, record, before = null) {
  const effects = [];
  for (const { target, field } of linksOf(side)) {
    const now = record?.[field] || null;
    const was = before?.[field] || null;
    if (sameLinkValue(now, was)) continue;
    if (was) effects.push({ target, step: () => EFFECTS[target].detach(was, before, side) });
    if (now) effects.push({ target, step: () => EFFECTS[target].attach(now, record, side) });
  }
  await run(effects);
}

/**
 * After a record is deleted: unlink everything it named
 * @param {'expense'|'income'} side
 * @param {object|null} record its stored copy
 */
export async function releaseRecordLinks(side, record) {
  if (!record) return;
  const effects = linksOf(side)
    .filter(({ field }) => record[field])
    .map(({ target, field }) => ({ target, step: () => EFFECTS[target].detach(record[field], record, side) }));
  await run(effects);
}

/**
 * A cheque just cleared on the cheques page: record its money — an income for a received cheque,
 * an expense for an issued one (of the cheque's own category, from its account, paid with it —
 * `chequeId`; saving it links the cheque
 * back). Nothing when it already has one, or for an issued cheque without the expenses feature.
 * @param {object} cheque the cleared cheque
 * @param {{ date: string, expenses?: boolean }} options the day it cleared; whether expenses are on
 * @returns {Promise<'income'|'expense'|null>} what was recorded
 */
export async function settleCheque(cheque, { date, expenses = true }) {
  if (!cheque || cheque.status !== CHEQUE_CLEARED || cheque.settlement) return null;
  const title = chequeRecordTitle(cheque);
  // Already recorded by hand that day (same amount)? That one is linked instead (spendingRecords.js)
  const spending = await import('./spendingRecords.js');
  if (cheque.direction === 'received') {
    await spending.recordIncome({ title, amount: cheque.amount, incomeDate: date, category: cheque.category || 'other', chequeId: cheque.id }, { owner: 'cheque' });
    return 'income';
  }
  if (!expenses) return null;
  await spending.recordSpending(`cheque:${cheque.id}`, {
    title, amount: cheque.amount, currency: 'IRT', date, category: cheque.category || 'other', chequeId: cheque.id, accountId: cheque.accountId || '',
  }, { owner: 'cheque', syncLinks: true });
  return 'expense';
}

/** The title of the record that holds a cheque's money */
const chequeRecordTitle = (cheque) => `${t('چک {name}', { name: cheque.counterparty })}${cheque.chequeNumber ? ` (${cheque.chequeNumber})` : ''}`.slice(0, 120);

/**
 * A cheque edited on the cheques page (already saved): the income or expense that holds its money
 * follows its title, amount, category («بابت») and account. Nothing when it has no record.
 * @param {object} cheque the cheque as saved, pointing at its record
 */
export async function resyncChequeRecord(cheque) {
  const link = cheque?.settlement;
  if (!link) return;
  const cleared = [...(cheque.history || [])].reverse().find((h) => h.status === CHEQUE_CLEARED)?.date;
  const range = cleared ? { from: cleared, to: cleared } : {};
  const category = cheque.category || 'other';
  if (link.side === 'income') {
    const { getIncomes, updateIncome } = await import('../../features/incomes/api/incomeApi.js');
    const record = ((await getIncomes(range)).incomes || []).find((i) => i.id === link.id);
    if (!record) return;
    const { id: _id, createdAt: _c, updatedAt: _u, ...fields } = record;
    await updateIncome(record.id, { ...fields, title: chequeRecordTitle(cheque), amount: cheque.amount, category }, { asOwner: true });
    return;
  }
  const store = await import('./vaultExpenses.js');
  const record = ((await store.getExpenses(range)).expenses || []).find((e) => e.id === link.id);
  if (!record) return;
  await store.saveExpense(
    { title: chequeRecordTitle(cheque), amount: cheque.amount, category, accountId: cheque.accountId || '' },
    record,
    { syncLinks: false, asOwner: true },
  );
}

/**
 * A cleared cheque taken back on the cheques page (already saved with its new status): the
 * record of its money is removed, which drops the cheque's pointer to it
 * @param {object} cheque the cheque as saved, still pointing at its record
 */
export async function unsettleCheque(cheque) {
  const link = cheque?.settlement;
  if (!link) return;
  if (link.side === 'income') {
    const { deleteIncome } = await import('../../features/incomes/api/incomeApi.js');
    await deleteIncome(link.id, { asOwner: true });
  } else {
    const store = await import('./vaultExpenses.js');
    await store.deleteExpense(link.id, { id: link.id, chequeId: cheque.id }, { asOwner: true });
  }
}
