/**
 * smsRecordsCleanup.js — Find and delete the expenses and incomes the app made from bank SMS
 *
 * Records made from a message carry `source: 'sms'` and its transaction key (`smsKey`); anything
 * typed in by hand has neither, so it is never touched. Records another feature owns
 * (recordOwners.js) are left to that feature. The vault must be open.
 */

import { getExpenses, deleteExpenses } from '../../shared/vault/vaultExpenses.js';
import { getIncomes, deleteIncomes } from '../../shared/vault/vaultIncomes.js';
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

/**
 * Delete the records `findSmsRecords` returned, in batches (one request per hundred)
 * @param {{ expenses: object[], incomes: object[] }} found
 * @returns {Promise<number>} how many were deleted
 */
export async function deleteSmsRecords({ expenses, incomes }) {
  await deleteExpenses(expenses);
  await deleteIncomes(incomes.map((income) => income.id));
  return expenses.length + incomes.length;
}
