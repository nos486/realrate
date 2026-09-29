/**
 * recordedCheck.js — Is a waiting bank message already recorded?
 *
 * - recorded from an SMS (here or on another device): the expense or income keeps the
 *   transaction's key (`smsKey`) → the message is dropped from the inbox
 * - recorded by hand: nothing ties it to the message; one on the same day with the same amount
 *   (and the same kind: expense for a withdrawal, income for a deposit) is flagged "possibly
 *   recorded", for the user to dismiss
 * Only the days the waiting messages cover are fetched (and decrypted).
 */

import * as expensesApi from '../../shared/vault/vaultExpenses.js';
import { getIncomes } from '../incomes/api/incomeApi.js';
import { expenseInToman } from '../../utils/expenseDocument.js';

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

  const [{ expenses = [] }, { incomes = [] }] = await Promise.all([
    expensesApi.getExpenses(range),
    getIncomes(range),
  ]);
  for (const e of expenses) {
    if (e.smsKey) recordedKeys.add(e.smsKey);
    else sameDay.add(sameDayKey('debit', e.date, expenseInToman(e) || 0));
  }
  for (const i of incomes) {
    if (i.smsKey) recordedKeys.add(i.smsKey);
    else sameDay.add(sameDayKey('credit', i.incomeDate, i.amount));
  }
  return { recordedKeys, sameDay };
}
