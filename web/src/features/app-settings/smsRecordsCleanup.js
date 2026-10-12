/**
 * smsRecordsCleanup.js — Find and delete the expenses and incomes the app made from bank SMS
 *
 * Records made from a message carry `source: 'sms'` and its transaction key (`smsKey`); anything
 * typed in by hand has neither, so it is never touched. Records another feature owns
 * (recordOwners.js) are left to that feature. The vault must be open.
 */

import { getExpenses, deleteExpense } from '../../shared/vault/vaultExpenses.js';
import { getIncomes, deleteIncome } from '../../shared/vault/vaultIncomes.js';
import { recordOwnerOf } from '../../utils/recordOwners.js';

const fromSms = (record) => record.source === 'sms' && Boolean(record.smsKey) && !recordOwnerOf(record);

/**
 * The SMS-made expenses and incomes dated between two days
 * @param {string} from first day, YYYY-MM-DD
 * @param {string} to last day (inclusive), YYYY-MM-DD
 * @returns {Promise<{ expenses: object[], incomes: object[] }>}
 */
export async function findSmsRecords(from, to) {
  const [{ expenses = [] }, { incomes = [] }] = await Promise.all([getExpenses({ from, to }), getIncomes({ from, to })]);
  return { expenses: expenses.filter(fromSms), incomes: incomes.filter(fromSms) };
}

/** Deletes in flight at once: each is its own request, so a long list would take minutes one by one */
const DELETE_PARALLEL = 8;

/**
 * Delete the records `findSmsRecords` returned, several at a time
 * @param {{ expenses: object[], incomes: object[] }} found
 * @param {(done: number, total: number) => void} [onProgress] called after each deletion
 * @returns {Promise<number>} how many were deleted
 */
export async function deleteSmsRecords({ expenses, incomes }, onProgress) {
  const jobs = [
    ...expenses.map((expense) => () => deleteExpense(expense.id, expense)),
    ...incomes.map((income) => () => deleteIncome(income.id)),
  ];
  let next = 0;
  let deleted = 0;
  // A fixed set of workers, each taking the next job when it finishes one; the first failure stops them all
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      await job();
      deleted += 1;
      onProgress?.(deleted, jobs.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(DELETE_PARALLEL, jobs.length) }, worker));
  return deleted;
}
