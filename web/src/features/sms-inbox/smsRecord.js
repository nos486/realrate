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

import { t } from '../../utils/i18n.js';
import { getExpenseCategory } from '../expenses/constants/expenseCategories.js';
import * as expensesApi from '../../shared/vault/vaultExpenses.js';
import { createIncome } from '../incomes/api/incomeApi.js';
import { createIncomes } from '../../shared/vault/vaultIncomes.js';
import { getIncomeCategory } from '../incomes/constants/incomeCategories.js';
import { getAccounts } from '../../shared/vault/vaultAccounts.js';
import { getPendingSms, getSmsSettings, markSmsHandled, markSmsHandledMany, dropRecordedSms } from '../../shared/native/smsInbox.js';
import { smsExpenseDraft, smsIncomeDraft } from './smsDrafts.js';
import { ensureSmsAccount } from './smsAccounts.js';
import { findRecorded, sameDayKey } from './recordedCheck.js';

/** Messages recorded per stored chunk */
const RECORD_CHUNK = 100;

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
 * @param {{ accounts?: object[]|null }} [options] `accounts`: the active accounts, grown by the one made for this message (null: not linked)
 * @returns {Promise<object>} the expense
 */
export async function recordSmsExpense(item, { accounts = [], category = getSmsSettings().recordCategory } = {}) {
  // Tied to its account, made from the message when the user has none for it
  const accountId = accounts ? await ensureSmsAccount(item.tx, accounts) : '';
  // Titled after its category (the user's own categories too)
  const { expense } = await saveSmsExpense({ ...smsExpenseDraft(item.tx, accounts || []), accountId, category, title: getExpenseCategory(category).label, currency: 'IRT' });
  markSmsHandled(item.fingerprint);
  return expense;
}

/**
 * Record a waiting deposit that is a received loan: an income in «دریافت وام», which is outside
 * the income totals (a debt, not earnings) but keeps the account's balance right
 * @param {{ fingerprint: string, tx: object }} item a waiting message
 * @param {{ title: string }} loan the loan the money came from
 * @returns {Promise<object>} the income
 */
export async function recordSmsLoanDeposit(item, loan) {
  const accounts = await accountsOrNone();
  const accountId = accounts ? await ensureSmsAccount(item.tx, accounts) : '';
  const { income } = await createIncome({
    ...smsIncomeDraft(item.tx, accounts || []),
    accountId,
    category: 'loan_received',
    title: t('دریافت وام {title}', { title: loan.title }).slice(0, 120),
  });
  markSmsHandled(item.fingerprint);
  return income;
}

/**
 * Record several waiting withdrawals together, each as `recordSmsExpense` would (its account, the
 * category's title), but stored in batches rather than one request each
 * @param {Array<{ fingerprint: string, tx: object }>} items waiting messages
 * @returns {Promise<number>} how many were recorded
 */
async function recordSmsExpenses(items, { accounts = [], category = getSmsSettings().recordCategory } = {}) {
  let recorded = 0;
  // A chunk at a time, each leaving the inbox once stored: a long run never holds the screen, and
  // one that fails midway keeps the rest waiting
  for (let i = 0; i < items.length; i += RECORD_CHUNK) {
    const chunk = items.slice(i, i + RECORD_CHUNK);
    const inputs = [];
    for (const item of chunk) {
      const accountId = accounts ? await ensureSmsAccount(item.tx, accounts) : '';
      inputs.push({ ...smsExpenseDraft(item.tx, accounts || []), accountId, category, title: getExpenseCategory(category).label, currency: 'IRT' });
    }
    await expensesApi.saveExpenses(inputs);
    markSmsHandledMany(chunk.map((item) => item.fingerprint));
    recorded += chunk.length;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return recorded;
}

/**
 * Record several waiting deposits together as incomes of `category`, a chunk at a time like
 * recordSmsExpenses
 * @returns {Promise<number>} how many were recorded
 */
async function recordSmsIncomes(items, { accounts = [], category = getSmsSettings().incomeCategory } = {}) {
  let recorded = 0;
  for (let i = 0; i < items.length; i += RECORD_CHUNK) {
    const chunk = items.slice(i, i + RECORD_CHUNK);
    const inputs = [];
    for (const item of chunk) {
      const accountId = accounts ? await ensureSmsAccount(item.tx, accounts) : '';
      inputs.push({ ...smsIncomeDraft(item.tx, accounts || []), accountId, category, title: getIncomeCategory(category).label, currency: 'IRT' });
    }
    await createIncomes(inputs);
    markSmsHandledMany(chunk.map((item) => item.fingerprint));
    recorded += chunk.length;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return recorded;
}

async function accountsOrNone() {
  try {
    return (await getAccounts()).accounts.filter((a) => !a.archived);
  } catch {
    // No accounts feature (or they cannot be read): recorded without an account, and none is made
    return null;
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
 * Record the waiting withdrawals and deposits up to their automatic limits (each when turned on in
 * the app settings): withdrawals as everyday expenses, deposits as incomes of the chosen category.
 * With `rule`, a one-off run instead of the settings — what a read of earlier messages records of
 * what it found (see below). The vault must be open; one run at a time.
 * @param {{ expense?: { max: number, category: string }, income?: { max: number, category: string },
 *   from?: string, to?: string }} [rule] limits and categories for this run, and the days
 *   (YYYY-MM-DD, inclusive) the messages must be of
 * @returns {Promise<number>} how many were recorded
 */
export function autoRecordSms(rule) {
  if (running) return rule ? running.catch(() => {}).then(() => autoRecordSms(rule)) : running;
  running = (async () => {
    const s = getSmsSettings();
    const expense = rule ? rule.expense : (s.autoRecord ? { max: s.autoRecordMax, category: s.recordCategory } : null);
    const income = rule ? rule.income : (s.autoRecordIncome ? { max: s.autoRecordIncomeMax, category: s.incomeCategory } : null);
    if (!expense && !income) return 0;
    const inRange = (p) => (!rule?.from || p.tx.date >= rule.from) && (!rule?.to || p.tx.date <= rule.to);
    const small = (list, direction, limit) => list.filter((p) => p.tx?.direction === direction && p.tx.amount > 0 && p.tx.amount <= limit.max && inRange(p));
    const todo = (list) => [...(expense ? small(list, 'debit', expense) : []), ...(income ? small(list, 'credit', income) : [])];
    if (!todo(getPendingSms()).length) return 0;

    // Already recorded (here, on another device, or by hand): gone from the inbox first
    await dropAlreadyRecorded();

    const accounts = await accountsOrNone();
    // The inbox is newest first: recorded in the order they happened, stored together (a long
    // read of earlier messages is a few requests, not one per message)
    const pending = getPendingSms();
    let recorded = 0;
    if (expense) recorded += await recordSmsExpenses(small(pending, 'debit', expense).reverse(), { accounts, category: expense.category });
    if (income) recorded += await recordSmsIncomes(small(pending, 'credit', income).reverse(), { accounts, category: income.category });
    return recorded;
  })().finally(() => {
    running = null;
  });
  return running;
}
