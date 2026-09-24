/**
 * incomeApi.js — Incomes Feature API Calls
 * Interfaces with RealRate Cloudflare Worker API via httpClient
 */

import { httpClient } from '../../../shared/api/httpClient.js';
import { routeThroughVault } from '../../../shared/vault/vaultRouting.js';
import * as vaultIncomes from '../../../shared/vault/vaultIncomes.js';

/**
 * @typedef {object} IncomeInput
 * @property {string} title
 * @property {string} category - one of INCOME_CATEGORIES values
 * @property {number} amount - Toman
 * @property {string} incomeDate - Gregorian ISO date (YYYY-MM-DD)
 * @property {string} [notes]
 */

/**
 * Fetch all incomes of the current user (newest first)
 * @returns {Promise<{ success: boolean, count: number, incomes: Array }>}
 */
async function getIncomesRest() {
  return httpClient.get('/api/incomes');
}

/**
 * Record a new income
 * @param {IncomeInput} incomeData
 * @returns {Promise<{ success: boolean, income: object }>}
 */
async function createIncomeRest(incomeData) {
  return httpClient.post('/api/incomes', incomeData);
}

/**
 * Update an existing income
 * @param {string} incomeId
 * @param {IncomeInput} incomeData
 * @returns {Promise<{ success: boolean, income: object }>}
 */
async function updateIncomeRest(incomeId, incomeData) {
  if (!incomeId) throw new Error('شناسه درآمد الزامی است');
  return httpClient.put(`/api/incomes/${encodeURIComponent(incomeId)}`, incomeData);
}

/**
 * Delete an income
 * @param {string} incomeId
 * @returns {Promise<{ success: boolean, message: string }>}
 */
async function deleteIncomeRest(incomeId) {
  if (!incomeId) throw new Error('شناسه درآمد الزامی است');
  return httpClient.delete(`/api/incomes/${encodeURIComponent(incomeId)}`);
}

// With account-wide end-to-end encryption on, incomes are encrypted records handled in the
// browser instead (same signatures and response shapes).
export const {
  getIncomes,
  createIncome,
  updateIncome,
  deleteIncome,
} = routeThroughVault(
  {
    getIncomes: getIncomesRest,
    createIncome: createIncomeRest,
    updateIncome: updateIncomeRest,
    deleteIncome: deleteIncomeRest,
  },
  vaultIncomes
);
