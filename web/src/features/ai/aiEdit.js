/**
 * aiEdit.js — The `edit` intent: change or delete a record already saved, found by what the voice said
 *
 * The model names the record loosely (the latest one, or a word from its title and/or its day) and
 * what changes; here the app looks among the recent records on this device (they are encrypted on the
 * server), offers the matches for the user to pick, and applies the change. Records another feature
 * recorded (recordOwners.js) are never touched, and only a plain record is updated (not one paid from
 * several sources, a portfolio, a loan or a cheque) — a deletion goes through the normal release of links.
 */

import { getExpenses, saveExpense, deleteExpense } from '../../shared/vault/vaultExpenses.js';
import { getIncomes, updateIncome, deleteIncome, createIncome } from '../../shared/vault/vaultIncomes.js';
import { recordOwnerOf } from '../../utils/recordOwners.js';
import { todayIso } from '../../shared/utils/dates.js';

/** How far back the voice looks for a record, and how many matches it offers */
export const EDIT_LOOKBACK_DAYS = 90;
export const EDIT_MAX_MATCHES = 5;

const dayOf = (kind, record) => (kind === 'income' ? record.incomeDate : record.date);

/** Fields that tie an expense to something else: such a record is not edited by voice */
const LINK_FIELDS = ['payments', 'paidFrom', 'investedIn', 'loanId', 'chequeId', 'subscriptionId', 'soldFrom'];
const isPlain = (record) => LINK_FIELDS.every((field) => !record[field] || (Array.isArray(record[field]) && !record[field].length));

function addDays(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/**
 * The records the voice may mean, best first
 * @param {{ op: string, kind: string, target: { which: string, text: string, date: string } }} answer
 * @returns {Promise<Array<{ kind: 'expense'|'income', record: object }>>}
 */
export async function findEditCandidates(answer) {
  const today = todayIso();
  const from = answer.target.date || addDays(today, -EDIT_LOOKBACK_DAYS);
  const to = answer.target.date || today;
  const kinds = answer.kind ? [answer.kind] : ['expense', 'income'];
  const found = [];
  if (kinds.includes('expense')) for (const record of (await getExpenses({ from, to })).expenses) found.push({ kind: 'expense', record });
  if (kinds.includes('income')) for (const record of (await getIncomes({ from, to })).incomes) found.push({ kind: 'income', record });

  const word = answer.target.text.toLowerCase();
  const matches = found.filter(({ record }) => !recordOwnerOf(record)
    && (answer.op === 'delete' || isPlain(record))
    && (answer.target.which === 'last' || !word || `${record.title} ${record.notes || ''}`.toLowerCase().includes(word)));
  matches.sort((a, b) => (answer.target.which === 'last'
    ? String(b.record.createdAt).localeCompare(String(a.record.createdAt))
    : String(dayOf(b.kind, b.record)).localeCompare(String(dayOf(a.kind, a.record))) || String(b.record.createdAt).localeCompare(String(a.record.createdAt))));
  return matches.slice(0, answer.target.which === 'last' ? 1 : EDIT_MAX_MATCHES);
}

/** The fields of a record the change touches, with their current values (to show and to undo) */
function touched(kind, record, changes) {
  const before = {};
  for (const [field, value] of Object.entries(changes)) {
    const key = field === 'date' && kind === 'income' ? 'incomeDate' : field;
    if (record[key] !== value) before[key] = record[key] ?? '';
  }
  return before;
}

const asRecordFields = (kind, changes) => Object.fromEntries(Object.entries(changes).map(([field, value]) => [field === 'date' && kind === 'income' ? 'incomeDate' : field, value]));

/**
 * Apply the answer to the chosen record
 * @returns {Promise<{ op: string, kind: string, before: object, record: object }>} what undo needs
 */
export async function applyEdit(answer) {
  const { kind, record } = answer.candidates.find((c) => c.record.id === answer.chosenId);
  if (answer.op === 'delete') {
    if (kind === 'income') await deleteIncome(record.id);
    else await deleteExpense(record.id, record);
    return { op: 'delete', kind, before: {}, record };
  }
  const fields = asRecordFields(kind, answer.changes);
  const before = touched(kind, record, answer.changes);
  if (kind === 'income') await updateIncome(record.id, { ...record, ...fields });
  else await saveExpense(fields, record);
  return { op: 'update', kind, before, record };
}

/** Take back what applyEdit did: restore the old values, or save a deleted record again */
export async function undoEdit({ op, kind, before, record }) {
  if (op === 'delete') {
    // An expense keeps its id; an income gets a new one
    if (kind === 'income') await createIncome(record);
    else await saveExpense(record, null, { id: record.id });
    return;
  }
  if (kind === 'income') await updateIncome(record.id, { ...record, ...before });
  else await saveExpense(before, record);
}
