/**
 * statementLinks.js — Which of the app's own records an imported bank row is the payment of
 *
 * A row of a bank statement is often money the app already knows about: a received cheque that
 * cleared (the cheque's number is in the row), a loan's installment taken from the account, a
 * subscription's renewal. Recording it as a plain expense or income would leave that record
 * waiting, so the import links the row to it — the same links the forms make by hand
 * (categoryLinks.js: `chequeId`, `loanInstallment`, `subscriptionId`), after which saving the
 * record clears the cheque, marks the installment paid and renews the subscription
 * (web/src/shared/vault/recordLinks.js).
 *
 * Only a sure match is suggested, and the user can switch each one off before saving:
 *  - cheque: its number equals the number the row names, and its direction fits (received → a
 *    deposit, issued → a withdrawal); still open
 *  - installment: an expense in «پرداخت قسط» whose amount equals an unpaid installment's (within
 *    half a percent) due within LINK_DAYS of the row's day — the nearest one
 *  - subscription: an expense in «اینترنت و اشتراک‌ها» whose amount equals one active subscription's
 *    in tomans (within half a percent) and that has no other payment linked in the same month
 * One record is suggested for one row only.
 * Shared by the browser and the tests, like the other domain modules.
 */

/** How far (days) an installment's due day may be from the row's day */
export const LINK_DAYS = 45;
/** Amounts closer than this (a fraction) are the same */
const AMOUNT_TOLERANCE = 0.005;

const DAY_MS = 86_400_000;
const dayNumber = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const digits = (value) => String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
const closeAmounts = (a, b) => Math.abs(a - b) <= Math.max(1, Math.max(a, b) * AMOUNT_TOLERANCE);

/**
 * @typedef {object} LinkCandidates
 * @property {Array<{ id: string, direction: 'received'|'issued', status: string, chequeNumber?: string, counterparty?: string }>} [cheques]
 * @property {Array<{ loanId: string, loanTitle?: string, installmentId: string, number: number, dueDate: string, amount: number }>} [installments] unpaid ones
 * @property {Array<{ id: string, name: string, amount: number, currency?: string, status?: string, endDate?: string }>} [subscriptions]
 */

/**
 * Suggest links for the rows that are going to be saved
 * @param {object[]} plan resolvePlan's rows
 * @param {LinkCandidates} candidates
 * @returns {Record<string, { kind: 'cheque'|'installment'|'subscription', field: string, value: string|object, label: string, category?: string }>}
 *   by row id
 */
export function suggestLinks(plan, { cheques = [], installments = [], subscriptions = [] } = {}) {
  const out = {};
  const usedCheques = new Set();
  const usedInstallments = new Set();
  const usedSubscriptionMonths = new Set();
  const rows = plan.filter((r) => r.included && (r.decision.action === 'expense' || r.decision.action === 'income'));

  // Oldest first: when two rows could take one record, the earlier one does
  for (const row of [...rows].sort((a, b) => `${a.tx.date}${a.tx.time}`.localeCompare(`${b.tx.date}${b.tx.time}`))) {
    const { tx, decision } = row;
    const number = digits(tx.fields?.chequeNo);
    if (number) {
      const wanted = decision.action === 'income' ? 'received' : 'issued';
      const cheque = cheques.find((c) => !usedCheques.has(c.id) && c.direction === wanted && ['pending', 'deposited'].includes(c.status) && digits(c.chequeNumber) === number);
      if (cheque) {
        usedCheques.add(cheque.id);
        out[tx.id] = { kind: 'cheque', field: 'chequeId', value: cheque.id, label: `چک شماره ${tx.fields.chequeNo}${cheque.counterparty ? ` (${cheque.counterparty})` : ''}` };
        continue;
      }
    }
    if (decision.action !== 'expense') continue;
    if (decision.category === 'installments') {
      const day = dayNumber(tx.date);
      const match = installments
        .filter((i) => !usedInstallments.has(`${i.loanId}|${i.installmentId}`) && closeAmounts(i.amount, tx.amount) && Math.abs(dayNumber(i.dueDate) - day) <= LINK_DAYS)
        .sort((a, b) => Math.abs(dayNumber(a.dueDate) - day) - Math.abs(dayNumber(b.dueDate) - day))[0];
      if (match) {
        usedInstallments.add(`${match.loanId}|${match.installmentId}`);
        out[tx.id] = {
          kind: 'installment',
          field: 'loanInstallment',
          value: { loanId: match.loanId, installmentId: match.installmentId },
          label: `قسط ${match.number} ${match.loanTitle ? `وام «${match.loanTitle}»` : 'وام'}`,
        };
      }
    } else if (decision.category === 'subscriptions') {
      const month = tx.date.slice(0, 7);
      const matches = subscriptions.filter((s) => (!s.currency || s.currency === 'IRT') && s.status !== 'cancelled' && closeAmounts(s.amount, tx.amount));
      if (matches.length === 1 && !usedSubscriptionMonths.has(`${matches[0].id}|${month}`)) {
        usedSubscriptionMonths.add(`${matches[0].id}|${month}`);
        out[tx.id] = { kind: 'subscription', field: 'subscriptionId', value: matches[0].id, label: `اشتراک «${matches[0].name}»` };
      }
    }
  }
  return out;
}

/**
 * The link fields a record input gets from a suggestion the user kept
 * @param {{ field: string, value: unknown }|null|undefined} link
 */
export const linkFieldsOf = (link) => (link ? { [link.field]: link.value } : {});
