/**
 * statementImportData.js — What the bank-statement import reads from and writes to the encrypted
 * store: the records already there (to skip what is recorded), the loans, cheques and
 * subscriptions a row may be the payment of, and the saving — a chunk at a time, with progress,
 * and an undo of everything one import saved
 *
 * The statement's rows are decided in the browser (utils/bankStatement.js); this file only moves
 * the result in and out of the vault.
 */

import * as expensesApi from '../../../shared/vault/vaultExpenses.js';
import { createIncomes, deleteIncomes } from '../../../shared/vault/vaultIncomes.js';
import { getIncomes } from '../../incomes/api/incomeApi.js';
import { getTransfers, saveTransfer, deleteTransfer } from '../../../shared/vault/vaultTransfers.js';
import { getLoans, getLoanDetail } from '../../loans/api/loanApi.js';
import { getCheques } from '../../cheques/api/chequeApi.js';
import { getSubscriptions } from '../../../shared/vault/vaultSubscriptions.js';

/** Records saved per request chunk (the stores split further by VAULT_BATCH_MAX) */
const CHUNK = 100;

/**
 * The expenses, incomes and transfers recorded in a period (for the duplicate check)
 * @param {{ from: string, to: string }} period inclusive YYYY-MM-DD
 */
export async function loadExistingRecords({ from, to }) {
  const range = { from, to };
  const [{ expenses = [] }, { incomes = [] }, { transfers = [] }] = await Promise.all([
    expensesApi.getExpenses(range),
    getIncomes(range),
    // Without the transfers feature (or the plan) there are none to read
    getTransfers(range).catch(() => ({ transfers: [] })),
  ]);
  return { expenses, incomes, transfers };
}

/**
 * The records an imported row can be linked to (statementLinks.js): open cheques, unpaid
 * installments of the loans, and the subscriptions. Whatever cannot be read is left out — the
 * import goes on without those links.
 * @returns {Promise<import('../../../utils/statementLinks.js').LinkCandidates>}
 */
export async function loadLinkCandidates() {
  const safe = (promise, fallback) => promise.catch(() => fallback);
  const [cheques, subscriptions, loans] = await Promise.all([
    safe(getCheques().then((r) => r.cheques || []), []),
    safe(getSubscriptions().then((r) => r.subscriptions || []), []),
    safe(getLoans().then((r) => r.loans || []), []),
  ]);
  const details = await Promise.all(loans.filter((l) => (l.paidCount ?? 0) < (l.totalCount ?? 1)).map((l) => safe(getLoanDetail(l.id).then((r) => r.loan), null)));
  const installments = details.filter(Boolean).flatMap((loan) => (loan.installments || [])
    .filter((i) => !i.isPaid)
    .map((i) => ({
      loanId: loan.id,
      loanTitle: loan.title || '',
      installmentId: i.id,
      number: i.installmentNumber,
      dueDate: String(i.dueDate || '').slice(0, 10),
      amount: Number(i.totalAmount) || 0,
    })));
  return { cheques, subscriptions, installments };
}

/**
 * Save the records of an import, a chunk at a time. A chunk that fails (the free plan's monthly
 * limit, a lost connection) stops that kind there: what was saved before stays, and is returned,
 * so the screen can say exactly how far it got.
 * @param {{ expenses: object[], incomes: object[], transfers: object[] }} records buildRecords'
 * @param {{ onProgress?: (done: number, total: number) => void }} [options]
 * @returns {Promise<{ saved: { expenses: object[], incomes: object[], transfers: object[] }, error: string }>}
 */
export async function saveImport(records, { onProgress } = {}) {
  const total = records.expenses.length + records.incomes.length + records.transfers.length;
  const saved = { expenses: [], incomes: [], transfers: [] };
  let done = 0;
  const step = (count) => {
    done += count;
    onProgress?.(done, total);
  };
  onProgress?.(0, total);
  try {
    for (let i = 0; i < records.expenses.length; i += CHUNK) {
      const chunk = records.expenses.slice(i, i + CHUNK);
      saved.expenses.push(...await expensesApi.saveExpenses(chunk));
      step(chunk.length);
    }
    for (let i = 0; i < records.incomes.length; i += CHUNK) {
      const chunk = records.incomes.slice(i, i + CHUNK);
      saved.incomes.push(...await createIncomes(chunk));
      step(chunk.length);
    }
    for (const input of records.transfers) {
      saved.transfers.push((await saveTransfer(input)).transfer);
      step(1);
    }
  } catch (err) {
    return { saved, error: err?.message || 'ذخیره‌ی بخشی از ردیف‌ها ممکن نشد.' };
  }
  return { saved, error: '' };
}

/**
 * Take back everything one import saved (what `saveImport` returned)
 * @param {{ expenses: object[], incomes: object[], transfers: object[] }} saved
 */
export async function undoImport(saved) {
  if (saved.expenses.length) await expensesApi.deleteExpenses(saved.expenses);
  if (saved.incomes.length) await deleteIncomes(saved.incomes.map((i) => i.id));
  for (const transfer of saved.transfers) await deleteTransfer(transfer.id);
}
