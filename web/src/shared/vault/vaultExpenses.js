/**
 * vaultExpenses.js — Expense sections and expenses, stored only as encrypted vault records
 *
 * Expenses were never kept in plaintext, so unlike cheques or incomes there is no REST path:
 * every section is an "expense_group" record and every expense an "expense" record whose
 * plaintext metadata is its date and its section (parent_id). Validation is the shared
 * utils/expenseDocument.js.
 *
 * A dollar expense paid from a portfolio (`paidFrom`) also writes, moves or deletes its «spend»
 * transaction in that portfolio, and an expense put into an asset (`investedIn`) its «buy»
 * transaction (portfolioFunds.js): the transaction first, then the expense.
 * An expense is saved in its section (`groupId`): a project's, or — left empty — the daily
 * section (the everyday expenses, created on first use), so every form and path saves alike.
 * The record its category links it to (a cheque, a loan installment, a subscription:
 * utils/categoryLinks.js) is updated after it is saved or deleted (recordLinks.js).
 */

import {
  validateExpenseGroup,
  validateExpense,
  compareExpensesByDate,
  expenseReceivable,
  DAILY_GROUP_NAME,
  LEGACY_RATE_FIELDS,
} from '../../utils/expenseDocument.js';
import { sameLink } from '../../utils/portfolioLink.js';
import { recordLinksOf } from '../../utils/categoryLinks.js';
import { syncRecordLinks, releaseRecordLinks } from './recordLinks.js';
import { tomanRateOn } from './recordRates.js';
import { listVaultRecords, deleteVaultRecord, putVaultRecords, VAULT_BATCH_MAX } from './vaultApi.js';
import { putRecord, recordDateOf } from './vaultRecordMeta.js';
import { encryptVaultRecord, decryptVaultRecord } from './vaultStore.js';

/** The fields of the expense links that name a record by id (the portfolio ones always come back) */
const ID_LINK_FIELDS = recordLinksOf('expense').filter((l) => l.target !== 'portfolio').map((l) => l.field);

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
  // Decrypted together (WebCrypto works in parallel), then read in order
  const records = res?.records || [];
  const decrypted = await Promise.all(records.map((r) => decryptVaultRecord(r.payload)));
  for (const [i, record] of records.entries()) {
    const plain = decrypted[i];
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

/** The portfolio entries an expense can have, and how each is written */
const LINKS = [
  { field: 'paidFrom', write: (f, expense) => f.saveSpendTransaction(expense) },
  {
    field: 'investedIn',
    // At its tomans: a foreign expense at its currency's rate on its day (the price history)
    write: async (f, expense) => f.saveLinkedTransaction(expense.investedIn, {
      type: 'buy',
      toman: (Number(expense.amount) || 0) * await tomanRateOn(expense.currency, expense.date),
      date: expense.date,
      owner: { expenseId: expense.id },
    }),
  },
];

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

/**
 * Create an expense, or update it when `existing` (its stored copy) is given
 * @param {object} input
 * @param {object|null} [existing]
 * @param {{ id?: string, syncLinks?: boolean }} [options] `id`: a new expense's own id (one
 *   recorded for another feature's spending, spendingRecords.js: the same id each time, so it is
 *   never recorded twice); `syncLinks: false` when the record it links to was already changed
 */
export async function saveExpense(input, existing = null, { id = '', syncLinks = true } = {}) {
  const now = new Date().toISOString();
  // No section ('' or none on a new one): the everyday expenses
  if (!('groupId' in input ? input.groupId : existing?.groupId)) {
    input = { ...input, groupId: (await ensureDailyGroup((await getExpenseGroups()).groups)).id };
  }
  const value = checked(validateExpense(existing ? { ...existing, ...input } : input));
  const expense = existing
    ? { ...existing, ...value, updatedAt: now }
    : { id: id || newId('exp'), ...value, createdAt: now, updatedAt: now };
  // The record its category links it to (categoryLinks.js): a link its category no longer
  // declares — or one taken off — is not kept from the stored copy
  for (const field of ID_LINK_FIELDS) if (!(field in value)) delete expense[field];
  // No rate is stored: an older record's goes (its day's rate is read from the price history)
  for (const field of LEGACY_RATE_FIELDS) delete expense[field];

  // Its portfolio entries first (moved when the portfolio changed)
  const links = LINKS.map((l) => ({ ...l, before: existing?.[l.field] || null, after: expense[l.field] || null }));
  if (links.some((l) => l.before || l.after)) {
    const f = await funds();
    for (const l of links.filter((x) => x.after)) {
      if (l.before && !sameLink(l.before, l.after)) await f.deleteLinkedTransaction(l.before);
      await l.write(f, expense);
    }
  }
  try {
    await putRecord(EXPENSE_KIND, expense.id, await encryptVaultRecord(expense), expense, { parentId: expense.groupId });
  } catch (err) {
    // A new entry of an expense that couldn't be saved is not left behind
    for (const l of links.filter((x) => x.after && !sameLink(x.before, x.after))) {
      await (await funds()).deleteLinkedTransaction(l.after).catch(() => {});
    }
    throw err;
  }
  // No longer paid from / put into a portfolio
  for (const l of links.filter((x) => x.before && !x.after)) {
    await (await funds()).deleteLinkedTransaction(l.before).catch(() => {});
  }
  if (syncLinks) await syncRecordLinks('expense', expense, existing);
  return { success: true, expense };
}

/** An expense as stored: never a rate (older records' LEGACY_RATE_FIELDS go) */
function withoutRates(expense) {
  const copy = { ...expense };
  for (const field of LEGACY_RATE_FIELDS) delete copy[field];
  return copy;
}

/**
 * Store expenses together, each re-encrypted: one request per VAULT_BATCH_MAX expenses, all or
 * none in each
 */
async function putExpenses(expenses) {
  for (let i = 0; i < expenses.length; i += VAULT_BATCH_MAX) {
    const chunk = expenses.slice(i, i + VAULT_BATCH_MAX);
    const records = await Promise.all(chunk.map(async (e) => ({
      id: e.id,
      payload: await encryptVaultRecord(e),
      recordDate: recordDateOf(EXPENSE_KIND, e),
      parentId: e.groupId,
    })));
    await putVaultRecords(EXPENSE_KIND, records);
  }
}

/**
 * Move expenses to another section (e.g. everyday expenses into a project), all stored together
 * (putExpenses). What they are paid from or put into doesn't depend on the section and stays.
 * @param {object[]} expenses their stored copies
 * @param {string} groupId the section they move to
 * @returns {Promise<object[]>} the moved expenses
 */
export async function moveExpenses(expenses, groupId) {
  const now = new Date().toISOString();
  const moved = expenses
    .filter((e) => e.groupId !== groupId)
    .map((e) => withoutRates({ ...e, ...checked(validateExpense({ ...e, groupId })), updatedAt: now }));
  await putExpenses(moved);
  return moved;
}

/**
 * Drop the rates older expenses stored (LEGACY_RATE_FIELDS): every rate is the price history's by
 * the expense's day. Only the expenses that still have one are rewritten, all together.
 * @returns {Promise<number>} how many were rewritten
 */
export async function dropStoredRates() {
  const { expenses } = await getExpenses();
  const stale = expenses.filter((e) => LEGACY_RATE_FIELDS.some((field) => field in e));
  await putExpenses(stale.map(withoutRates));
  return stale.length;
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

/** Delete an expense (and its portfolio entries: paid from a portfolio, put into an asset) */
export async function deleteExpense(expenseId, expense = null, { syncLinks = true } = {}) {
  await deleteVaultRecord(EXPENSE_KIND, expenseId);
  for (const { field } of LINKS) {
    if (expense?.[field]) await (await funds()).deleteLinkedTransaction(expense[field]).catch(() => {});
  }
  if (syncLinks) await releaseRecordLinks('expense', expense);
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
