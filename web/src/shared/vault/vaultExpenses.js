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
 * transaction (portfolioFunds.js): the transaction first, then the expense. A purchase paid from
 * several sources («چند منبع», `payments`) writes a «sell» for each asset sold for its part.
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
import { recordOwnerOf, ownedRecordMessage } from '../../utils/recordOwners.js';
import { syncRecordLinks, releaseRecordLinks } from './recordLinks.js';
import { tomanRateOn } from './recordRates.js';
import { listVaultRecords, deleteVaultRecord, deleteVaultRecords, putVaultRecords, VAULT_BATCH_MAX } from './vaultApi.js';
import { putRecord, recordDateOf } from './vaultRecordMeta.js';
import { encryptVaultRecord, decryptVaultRecord, decryptVaultRecords } from './vaultStore.js';

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

/**
 * An expense another feature recorded is changed only by that feature (recordOwners.js): its page,
 * through spendingRecords.js / recordLinks.js, which pass `asOwner`
 */
function assertNotOwned(expense, asOwner) {
  if (expense && !asOwner && recordOwnerOf(expense)) throw new ExpenseValidationError(ownedRecordMessage(expense, 'expense'));
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
  const decrypted = await decryptVaultRecords(records.map((r) => r.payload));
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
  const records = res?.records || [];
  const plains = await Promise.all(records.map((record) => decryptVaultRecord(record.payload).catch(() => null)));
  // The whole section goes, whoever recorded what is in it
  await deleteExpenses(records.map((record, i) => plains[i] || { id: record.id }), { asOwner: true });
  await deleteVaultRecord(GROUP_KIND, groupId);
  return { success: true };
}

const funds = () => import('./portfolioFunds.js');

/**
 * The portfolio entries an expense has, and how each is written: paid from a portfolio
 * (`paidFrom`, a «spend»), put into an asset (`investedIn`, a «buy»), and the assets sold for the
 * parts of a purchase paid from several sources (`payments[].soldFrom`, a «sell» at the part)
 * @returns {Array<{ slot: string, link: object, write: (f: object, expense: object) => Promise<void> }>}
 *   `slot`: where on the expense the entry is (a part's by its id), to pair an edit's entries
 */
export function portfolioEntriesOf(expense) {
  if (!expense) return [];
  return [
    ...(expense.paidFrom ? [{ slot: 'paidFrom', link: expense.paidFrom, write: (f, e) => f.saveSpendTransaction(e) }] : []),
    ...(expense.investedIn ? [{
      slot: 'investedIn',
      link: expense.investedIn,
      // At its tomans: a foreign expense at its currency's rate on its day (the price history)
      write: async (f, e) => f.saveLinkedTransaction(e.investedIn, {
        type: 'buy',
        toman: (Number(e.amount) || 0) * await tomanRateOn(e.currency, e.date),
        date: e.date,
        owner: { expenseId: e.id },
      }),
    }] : []),
    ...(Array.isArray(expense.payments) ? expense.payments : []).filter((p) => p?.soldFrom).map((p) => ({
      slot: `payment:${p.id}`,
      link: p.soldFrom,
      write: (f, e) => f.saveLinkedTransaction(p.soldFrom, { type: 'sell', toman: Number(p.amount) || 0, date: e.date, owner: { expenseId: e.id }, note: 'pay' }),
    })),
  ];
}

/** Whether an entry of `list` is the same portfolio entry as `entry` */
const hasEntry = (list, entry) => list.some((x) => sameLink(x.link, entry.link));
/** Whether `list` has an entry in the same place on the expense as `entry` */
const hasSlot = (list, entry) => list.some((x) => x.slot === entry.slot);

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
 * @param {{ id?: string, syncLinks?: boolean, asOwner?: boolean }} [options] `id`: a new expense's
 *   own id (one recorded for another feature's spending, spendingRecords.js: the same id each time,
 *   so it is never recorded twice); `syncLinks: false` when the record it links to was already
 *   changed; `asOwner`: the feature that recorded it (recordOwners.js) is changing it
 */
export async function saveExpense(input, existing = null, { id = '', syncLinks = true, asOwner = false } = {}) {
  assertNotOwned(existing, asOwner);
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

  // Its portfolio entries first (one that moved to another portfolio leaves the old one)
  const before = portfolioEntriesOf(existing);
  const after = portfolioEntriesOf(expense);
  if (before.length || after.length) {
    const f = await funds();
    for (const entry of after) {
      const old = before.find((b) => b.slot === entry.slot);
      if (old && !sameLink(old.link, entry.link)) await f.deleteLinkedTransaction(old.link);
      await entry.write(f, expense);
    }
  }
  try {
    await putRecord(EXPENSE_KIND, expense.id, await encryptVaultRecord(expense), expense, { parentId: expense.groupId });
  } catch (err) {
    // A new entry of an expense that couldn't be saved is not left behind
    for (const entry of after.filter((x) => !hasEntry(before, x))) {
      await (await funds()).deleteLinkedTransaction(entry.link).catch(() => {});
    }
    throw err;
  }
  // No longer paid from / put into / sold from a portfolio
  for (const entry of before.filter((x) => !hasSlot(after, x) && !hasEntry(after, x))) {
    await (await funds()).deleteLinkedTransaction(entry.link).catch(() => {});
  }
  if (syncLinks) await syncRecordLinks('expense', expense, existing);
  return { success: true, expense };
}

/**
 * Save many new expenses together (e.g. a long run of bank SMS recorded automatically): checked,
 * encrypted and stored VAULT_BATCH_MAX at a time, one request each, all or none in each chunk —
 * giving the screen a turn between chunks, so thousands of expenses never freeze it. Ones that name a portfolio (paid from / put into it) are saved one at a time, as
 * saveExpense does, since each also writes the portfolio's entry.
 * @param {object[]} inputs new expenses, as saveExpense takes them
 * @returns {Promise<object[]>} the saved expenses, in order
 */
export async function saveExpenses(inputs) {
  if (!inputs.length) return [];
  if (inputs.some((input) => portfolioEntriesOf(input).length)) {
    const saved = [];
    for (const input of inputs) saved.push((await saveExpense(input)).expense);
    return saved;
  }
  const now = new Date().toISOString();
  const dailyId = inputs.some((input) => !input.groupId) ? (await ensureDailyGroup((await getExpenseGroups()).groups)).id : '';
  const saved = [];
  for (let i = 0; i < inputs.length; i += VAULT_BATCH_MAX) {
    const chunk = inputs.slice(i, i + VAULT_BATCH_MAX).map((input) => {
      const value = checked(validateExpense({ ...input, groupId: input.groupId || dailyId }));
      return { id: newId('exp'), ...value, createdAt: now, updatedAt: now };
    });
    await putExpenses(chunk);
    for (const expense of chunk) await syncRecordLinks('expense', expense, null);
    saved.push(...chunk);
    // The screen's turn (taps, scrolling) before the next chunk
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return saved;
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
  for (const e of expenses) assertNotOwned(e, false);
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

/**
 * Delete an expense (and its portfolio entries: paid from a portfolio, put into an asset). One
 * another feature recorded only by that feature (`asOwner`, recordOwners.js).
 */
export async function deleteExpense(expenseId, expense = null, { syncLinks = true, asOwner = false } = {}) {
  assertNotOwned(expense || { id: expenseId }, asOwner);
  await deleteVaultRecord(EXPENSE_KIND, expenseId);
  for (const { link } of portfolioEntriesOf(expense)) {
    await (await funds()).deleteLinkedTransaction(link).catch(() => {});
  }
  if (syncLinks) await releaseRecordLinks('expense', expense);
  return { success: true };
}

/**
 * Delete several expenses together — what `deleteExpense` does for each, but the records go in
 * batches (one request per VAULT_BATCH_MAX); only an expense linked to a portfolio or to another
 * record (a cheque, an installment, a subscription) is then released one at a time
 * @param {object[]} expenses their stored copies
 * @param {{ syncLinks?: boolean, asOwner?: boolean }} [options] as deleteExpense
 */
export async function deleteExpenses(expenses, { syncLinks = true, asOwner = false } = {}) {
  for (const expense of expenses) assertNotOwned(expense, asOwner);
  await deleteVaultRecords(EXPENSE_KIND, expenses.map((e) => e.id));
  for (const expense of expenses) {
    for (const { link } of portfolioEntriesOf(expense)) {
      await (await funds()).deleteLinkedTransaction(link).catch(() => {});
    }
    if (syncLinks) await releaseRecordLinks('expense', expense);
  }
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
