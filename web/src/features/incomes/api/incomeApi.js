/**
 * incomeApi.js — Incomes Feature API Calls
 * Interfaces with RealRate Cloudflare Worker API via httpClient
 */

import { httpClient } from '../../../shared/api/httpClient.js';
import { routeThroughVault } from '../../../shared/vault/vaultRouting.js';
import * as vaultIncomes from '../../../shared/vault/vaultIncomes.js';
import { pageLocally } from '../../../shared/utils/pageLocally.js';

/**
 * @typedef {object} IncomeInput
 * @property {string} title
 * @property {string} category - one of INCOME_CATEGORIES values
 * @property {number} amount - Toman
 * @property {string} incomeDate - Gregorian ISO date (YYYY-MM-DD)
 * @property {string} [notes]
 */

/**
 * Incomes of the current user by date (newest first), filtered and paged like the encrypted store
 * @param {{ from?: string, to?: string, order?: 'asc'|'desc', limit?: number, offset?: number }} [filters]
 * @returns {Promise<{ success: boolean, count: number, incomes: Array, total: number }>}
 */
async function getIncomesRest(filters = {}) {
  const res = await httpClient.get('/api/incomes');
  const { items, total } = pageLocally(Array.isArray(res?.incomes) ? res.incomes : [], filters, (i) => i.incomeDate);
  return { ...res, count: items.length, incomes: items, total };
}

/**
 * Record a new income
 * @param {IncomeInput} incomeData
 * @returns {Promise<{ success: boolean, income: object }>}
 */
async function createIncomeRest(incomeData, options) {
  return httpClient.post('/api/incomes', incomeData, options);
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
