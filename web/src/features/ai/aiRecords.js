/**
 * aiRecords.js — The `records` intent: create the expenses and incomes a voice note described, and take them back
 *
 * Expenses go to the everyday expenses (no section), incomes to the incomes, each in tomans on the
 * day and account the voice named; stored together, one request per kind.
 */

import { saveExpenses, deleteExpenses } from '../../shared/vault/vaultExpenses.js';
import { createIncomes, deleteIncomes } from '../../shared/vault/vaultIncomes.js';

/**
 * @param {Array<{ kind: 'expense'|'income', amount: number, title: string, category: string, date: string, accountId: string }>} items
 * @returns {Promise<{ expenses: object[], incomes: object[] }>} the stored records
 */
export async function saveVoiceItems(items) {
  const common = (i) => ({ title: i.title, category: i.category, amount: i.amount, accountId: i.accountId, currency: 'IRT' });
  const expenses = items.filter((i) => i.kind === 'expense').map((i) => ({ ...common(i), date: i.date }));
  const incomes = items.filter((i) => i.kind === 'income').map((i) => ({ ...common(i), incomeDate: i.date }));
  return {
    expenses: expenses.length ? await saveExpenses(expenses) : [],
    incomes: incomes.length ? await createIncomes(incomes) : [],
  };
}

/** Delete what saveVoiceItems stored */
export async function undoVoiceItems({ expenses = [], incomes = [] }) {
  if (expenses.length) await deleteExpenses(expenses);
  if (incomes.length) await deleteIncomes(incomes.map((i) => i.id));
}
