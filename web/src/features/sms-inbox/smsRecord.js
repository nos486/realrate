/**
 * smsRecord.js — Recording a bank withdrawal as an everyday expense without the form
 *
 * - «ثبت سریع» (a withdrawal up to QUICK_RECORD_MAX): one tap records it in the category chosen in
 *   the app settings (`recordCategory`, «سایر» by default)
 * - automatic recording (app settings, off by default): every waiting withdrawal up to
 *   `autoRecordMax` is recorded by itself, as soon as the encrypted data is open
 * Either way the expense carries the transaction's key (`smsKey`), like one recorded through the
 * form, and the message leaves the inbox. Before recording automatically, the waiting messages are
 * checked against what is already recorded (recordedCheck.js), so nothing is recorded twice —
 * from another device, or by hand.
 */

import { getExpenseCategory } from '../expenses/constants/expenseCategories.js';
import * as expensesApi from '../../shared/vault/vaultExpenses.js';
import { getAccounts } from '../../shared/vault/vaultAccounts.js';
import { getPendingSms, getSmsSettings, markSmsHandled, dropRecordedSms } from '../../shared/native/smsInbox.js';
import { smsExpenseDraft } from './smsDrafts.js';
import { findRecorded, sameDayKey } from './recordedCheck.js';

/**
 * Save an expense from a bank SMS where the form put it: a project (`groupId`), or the everyday
 * expenses (no `groupId`: the daily section, created on first use — vaultExpenses.js)
 */
export async function saveSmsExpense(input) {
  return expensesApi.saveExpense(input);
}

/**
 * Record a waiting withdrawal as it is, in `category`
 * @param {{ fingerprint: string, tx: object }} item a waiting message (getPendingSms)
 * @returns {Promise<object>} the expense
 */
export async function recordSmsExpense(item, { accounts = [], category = getSmsSettings().recordCategory } = {}) {
  // Titled after its category (the user's own categories too)
  const { expense } = await saveSmsExpense({ ...smsExpenseDraft(item.tx, accounts), category, title: getExpenseCategory(category).label, currency: 'IRT' });
  markSmsHandled(item.fingerprint);
  return expense;
}

async function accountsOrNone() {
  try {
    return (await getAccounts()).accounts.filter((a) => !a.archived);
  } catch {
    // No accounts feature, or none yet: recorded without an account
    return [];
  }
}

let checking = null;

/**
 * Drop the waiting messages already recorded — an expense or income carrying their key (here, on
 * another device), or recorded by hand (same day, amount and kind). Needs the vault open. Calls
 * made while one runs wait for it and check again, so each drop is counted once.
 * @returns {Promise<number>} how many were dropped
 */
export function dropAlreadyRecorded() {
  const run = (checking || Promise.resolve()).catch(() => {}).then(async () => {
    const pending = getPendingSms();
    if (!pending.length) return 0;
    const { recordedKeys, sameDay } = await findRecorded(pending);
    const byHand = pending
      .filter((p) => p.tx?.key && sameDay.has(sameDayKey(p.tx.direction, p.tx.date, p.tx.amount)))
      .map((p) => p.tx.key);
    return dropRecordedSms([...recordedKeys, ...byHand]);
  });
  checking = run;
  run.then(
    () => { if (checking === run) checking = null; },
    () => { if (checking === run) checking = null; }
  );
  return run;
}

let running = null;

/**
 * Record the waiting withdrawals up to the automatic limit (when it is on). The vault must be
 * open; one run at a time.
 * @returns {Promise<number>} how many were recorded
 */
export function autoRecordSmallExpenses() {
  if (running) return running;
  running = (async () => {
    const { autoRecord, autoRecordMax, recordCategory } = getSmsSettings();
    if (!autoRecord) return 0;
    const small = (list) => list.filter((p) => p.tx?.direction === 'debit' && p.tx.amount > 0 && p.tx.amount <= autoRecordMax);
    if (!small(getPendingSms()).length) return 0;

    // Already recorded (here, on another device, or by hand): gone from the inbox first
    await dropAlreadyRecorded();

    const accounts = await accountsOrNone();
    let recorded = 0;
    // The inbox is newest first: recorded in the order they happened
    for (const item of small(getPendingSms()).reverse()) {
      await recordSmsExpense(item, { accounts, category: recordCategory });
      recorded++;
    }
    return recorded;
  })().finally(() => {
    running = null;
  });
  return running;
}
