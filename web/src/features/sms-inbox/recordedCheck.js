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
 *   else the same day and amount — the withdrawal its amount, the deposit its amount less the fee)
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

/** Note a hand-recorded twin by its record id: each record accounts for one message, not every one alike */
const addTwin = (twins, key, id) => twins.set(key, [...(twins.get(key) || []), String(id)]);

/**
 * @param {Array<{ tx: object }>} pending
 * @returns {Promise<{ recordedKeys: Set<string>, sameDay: Map<string, string[]> }>} `sameDay` lists the ids of the
 *   hand-recorded twins per `sameDayKey`
 */
export async function findRecorded(pending) {
  const dates = pending.map((p) => p.tx?.date).filter(Boolean).sort();
  const recordedKeys = new Set();
  const sameDay = new Map();
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
      else addTwin(sameDay, sameDayKey('debit', e.date, expensePaidInToman(e) || 0), e.id);
    }
    for (const [n, r] of (e.reimbursements || []).entries()) {
      if (r.smsKey) recordedKeys.add(r.smsKey);
      else if (!isForeignCurrency(e.currency)) addTwin(sameDay, sameDayKey('credit', r.date, r.amount), `${e.id}/${r.id ?? n}`);
    }
  }
  for (const i of incomes) {
    if (i.smsKey) recordedKeys.add(i.smsKey);
    // A bank's message is in tomans: a foreign income is never one
    else if (!isForeignCurrency(i.currency)) addTwin(sameDay, sameDayKey('credit', i.incomeDate, i.amount), i.id);
  }
  for (const t of transfers) {
    if (t.smsKeys?.length) for (const key of t.smsKeys) recordedKeys.add(key);
    else {
      addTwin(sameDay, sameDayKey('debit', t.date, t.amount), t.id);
      // What reached the destination: the fee never did (a credit's settlement: the debt settled)
      addTwin(sameDay, sameDayKey('credit', t.date, (Number(t.amount) || 0) - (Number(t.fee) || 0)), t.id);
    }
  }
  return { recordedKeys, sameDay };
}
