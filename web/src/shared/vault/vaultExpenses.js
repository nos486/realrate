/**
 * vaultExpenses.js — Expense sections and expenses, stored only as encrypted vault records
 *
 * Expenses were never kept in plaintext, so unlike cheques or incomes there is no REST path:
 * every section is an "expense_group" record and every expense an "expense" record whose
 * plaintext metadata is its date and its section (parent_id). Validation is the shared
 * utils/expenseDocument.js.
 *
 * A dollar expense paid from a portfolio (`paidFrom`) also writes, moves or deletes its «spend»
 * transaction in that portfolio (portfolioFunds.js): the transaction first, then the expense.
 */

import {
  validateExpenseGroup,
  validateExpense,
  compareExpensesByDate,
  expenseReceivable,
  DAILY_GROUP_NAME,
} from '../../utils/expenseDocument.js';
import { listVaultRecords, deleteVaultRecord } from './vaultApi.js';
import { putRecord } from './vaultRecordMeta.js';
import { encryptVaultRecord, decryptVaultRecord } from './vaultStore.js';

const GROUP_KIND = 'expense_group';
const EXPENSE_KIND = 'expense';

class ExpenseValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function checked({ value, error }) {
  if (error) throw new ExpenseValidationError(error);
  return value;
}

const newId = (prefix) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

async function decryptAll(kind, filters) {
  const res = await listVaultRecords(kind, undefined, filters);
  const items = [];
  for (const record of res?.records || []) {
    const plain = await decryptVaultRecord(record.payload);
    if (plain?.id) items.push(plain);
    else console.warn(`Skipped an ${kind} record that could not be decrypted:`, record.id);
  }
  return items;
}

/** Sections, oldest first (the order they were created in) */
export async function getExpenseGroups() {
  const groups = await decryptAll(GROUP_KIND);
  groups.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return { success: true, groups };
}

/** Create a section, or update it when `existing` (its stored copy) is given */
export async function saveExpenseGroup(input, existing = null) {
  const now = new Date().toISOString();
  const group = existing
    ? { ...existing, ...checked(validateExpenseGroup({ ...existing, ...input })), updatedAt: now }
    : { id: newId('exg'), ...checked(validateExpenseGroup(input)), createdAt: now, updatedAt: now };
  await putRecord(GROUP_KIND, group.id, await encryptVaultRecord(group), group);
  return { success: true, group };
}

/** Delete a section with every expense in it (expenses first: a half-done delete leaves the section) */
export async function deleteExpenseGroup(groupId) {
  const res = await listVaultRecords(EXPENSE_KIND, undefined, { parent: groupId });
  for (const record of res?.records || []) {
    const plain = await decryptVaultRecord(record.payload).catch(() => null);
    await deleteExpense(record.id, plain);
  }
  await deleteVaultRecord(GROUP_KIND, groupId);
  return { success: true };
}

const funds = () => import('./portfolioFunds.js');
const sameFunding = (a, b) => Boolean(a && b && a.portfolioId === b.portfolioId && a.txId === b.txId);

/**
 * Expenses, newest first: of one section (`parent`) and/or between two days (`from`, `to`,
 * inclusive YYYY-MM-DD) — the filters run on the server's plaintext metadata, so only what is
 * asked for is downloaded and decrypted
 * @param {{ parent?: string, from?: string, to?: string }} [filters]
 */
export async function getExpenses(filters = {}) {
  const expenses = await decryptAll(EXPENSE_KIND, filters);
  expenses.sort(compareExpensesByDate);
  return { success: true, expenses };
}

/** Create an expense, or update it when `existing` (its stored copy) is given */
export async function saveExpense(input, existing = null) {
  const now = new Date().toISOString();
  const expense = existing
    ? { ...existing, ...checked(validateExpense({ ...existing, ...input })), updatedAt: now }
    : { id: newId('exp'), ...checked(validateExpense(input)), createdAt: now, updatedAt: now };

  // Paid from a portfolio: its spend transaction first (moved when the portfolio changed)
  const before = existing?.paidFrom || null;
  if (expense.paidFrom) {
    const { saveSpendTransaction, deleteSpendTransaction } = await funds();
    if (before && !sameFunding(before, expense.paidFrom)) await deleteSpendTransaction(before);
    await saveSpendTransaction(expense);
  }
  try {
    await putRecord(EXPENSE_KIND, expense.id, await encryptVaultRecord(expense), expense, { parentId: expense.groupId });
  } catch (err) {
    // A new expense that couldn't be saved leaves no transaction behind
    if (expense.paidFrom && !sameFunding(before, expense.paidFrom)) {
      await (await funds()).deleteSpendTransaction(expense.paidFrom).catch(() => {});
    }
    throw err;
  }
  // No longer paid from a portfolio
  if (before && !expense.paidFrom) await (await funds()).deleteSpendTransaction(before).catch(() => {});
  return { success: true, expense };
}

/**
 * Shared expenses («دنگ») with something still owed back, oldest first — from every section and
 * every month (`from`: only since that day)
 */
export async function getOpenSharedExpenses({ from } = {}) {
  const { expenses } = await getExpenses(from ? { from } : {});
  return expenses
    .filter((e) => expenseReceivable(e).remaining > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** A new reimbursement (money that came back for a shared expense), ready to add to its list */
export function newReimbursement(input) {
  return { id: newId('rmb'), ...input };
}

/** Delete an expense (and its spend transaction, when it was paid from a portfolio) */
export async function deleteExpense(expenseId, expense = null) {
  await deleteVaultRecord(EXPENSE_KIND, expenseId);
  if (expense?.paidFrom) await (await funds()).deleteSpendTransaction(expense.paidFrom).catch(() => {});
  return { success: true };
}

/**
 * The daily section among `groups`, created when missing (the first everyday expense)
 * @returns {Promise<object>} the section
 */
export async function ensureDailyGroup(groups) {
  const existing = groups.find((g) => g.type === 'daily');
  if (existing) return existing;
  const { group } = await saveExpenseGroup({ name: DAILY_GROUP_NAME, type: 'daily' });
  return group;
}
