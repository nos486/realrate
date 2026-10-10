/**
 * recordedCheck.js — Is a waiting bank message already recorded?
 *
 * - recorded from an SMS (here or on another device): the expense or income keeps the
 *   transaction's key (`smsKey`) → the message is dropped from the inbox
 * - recorded by hand: nothing ties it to the message; one on the same day with the same amount
 *   (and the same kind: expense for a withdrawal, income for a deposit) counts as recorded, and
 *   the message is dropped too
 * - a deposit that was someone's share of an expense («دنگ»): kept in that expense's
 *   reimbursements (with `smsKey` when from an SMS, else the same day and amount)
 * - a transfer between the user's own accounts: kept in the transfer (`smsKeys` when from an SMS,
 *   else the same day and amount — both the withdrawal and the deposit)
 * Only the days the waiting messages cover are fetched (and decrypted) — for deposits, the year
 * before them too, since a share comes back after the expense's own day.
 */

import * as expensesApi from '../../shared/vault/vaultExpenses.js';
import { getIncomes } from '../incomes/api/incomeApi.js';
import { getTransfers } from '../../shared/vault/vaultTransfers.js';
import { expensePaidInToman } from '../../utils/expenseDocument.js';
import { isForeignCurrency } from '../../utils/currencies.js';

/** How far back a share coming back may point (the expense's own day) */
const SHARE_LOOKBACK_DAYS = 365;
const daysBefore = (iso, days) => new Date(Date.parse(iso) - days * 86_400_000).toISOString().slice(0, 10);

/** Same day, same amount, same kind: what a hand-recorded twin looks like */
export const sameDayKey = (direction, date, amount) => `${direction}|${date}|${Math.round(Number(amount) || 0)}`;

/**
 * @param {Array<{ tx: object }>} pending
 * @returns {Promise<{ recordedKeys: Set<string>, sameDay: Set<string> }>}
 */
export async function findRecorded(pending) {
  const dates = pending.map((p) => p.tx?.date).filter(Boolean).sort();
  const recordedKeys = new Set();
  const sameDay = new Set();
  if (!dates.length) return { recordedKeys, sameDay };
  const range = { from: dates[0], to: dates[dates.length - 1] };
  const creditDates = pending.filter((p) => p.tx?.direction === 'credit' && p.tx?.date).map((p) => p.tx.date).sort();
  const expenseFrom = creditDates.length ? daysBefore(creditDates[0], SHARE_LOOKBACK_DAYS) : range.from;

  const [{ expenses = [] }, { incomes = [] }, { transfers = [] }] = await Promise.all([
    expensesApi.getExpenses({ from: expenseFrom < range.from ? expenseFrom : range.from, to: range.to }),
    getIncomes(range),
    // Without the accounts feature there are none
    getTransfers(range).catch(() => ({ transfers: [] })),
  ]);
  for (const e of expenses) {
    // What was paid (a shared expense's whole amount), as the bank's message says
    if (e.date >= range.from) {
      if (e.smsKey) recordedKeys.add(e.smsKey);
      else sameDay.add(sameDayKey('debit', e.date, expensePaidInToman(e) || 0));
    }
    for (const r of e.reimbursements || []) {
      if (r.smsKey) recordedKeys.add(r.smsKey);
      else if (!isForeignCurrency(e.currency)) sameDay.add(sameDayKey('credit', r.date, r.amount));
    }
  }
  for (const i of incomes) {
    if (i.smsKey) recordedKeys.add(i.smsKey);
    else sameDay.add(sameDayKey('credit', i.incomeDate, i.amount));
  }
  for (const t of transfers) {
    if (t.smsKeys?.length) for (const key of t.smsKeys) recordedKeys.add(key);
    else {
      sameDay.add(sameDayKey('debit', t.date, t.amount));
      sameDay.add(sameDayKey('credit', t.date, t.amount));
    }
  }
  return { recordedKeys, sameDay };
}
