/**
 * vaultExpenses.js — Expense sections and expenses, stored only as encrypted vault records
 *
 * Expenses were never kept in plaintext, so unlike cheques or incomes there is no REST path:
 * every section is an "expense_group" record and every expense an "expense" record whose
 * plaintext metadata is its date and its section (parent_id). Validation is the shared
 * utils/expenseDocument.js.
 */

import { validateExpenseGroup, validateExpense, compareExpensesByDate } from '../../utils/expenseDocument.js';
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
  for (const record of res?.records || []) await deleteVaultRecord(EXPENSE_KIND, record.id);
  await deleteVaultRecord(GROUP_KIND, groupId);
  return { success: true };
}

/** Every expense (of every section), newest first */
export async function getExpenses() {
  const expenses = await decryptAll(EXPENSE_KIND);
  expenses.sort(compareExpensesByDate);
  return { success: true, expenses };
}

/** Create an expense, or update it when `existing` (its stored copy) is given */
export async function saveExpense(input, existing = null) {
  const now = new Date().toISOString();
  const expense = existing
    ? { ...existing, ...checked(validateExpense({ ...existing, ...input })), updatedAt: now }
    : { id: newId('exp'), ...checked(validateExpense(input)), createdAt: now, updatedAt: now };
  await putRecord(EXPENSE_KIND, expense.id, await encryptVaultRecord(expense), expense, { parentId: expense.groupId });
  return { success: true, expense };
}

export async function deleteExpense(expenseId) {
  await deleteVaultRecord(EXPENSE_KIND, expenseId);
  return { success: true };
}
