/**
 * incomeApi.js — Incomes Feature API Calls
 * Interfaces with RealRate Cloudflare Worker API via httpClient
 */

import { httpClient } from '../../../shared/api/httpClient.js';

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
export async function getIncomes() {
  return httpClient.get('/api/incomes');
}

/**
 * Record a new income
 * @param {IncomeInput} incomeData
 * @returns {Promise<{ success: boolean, income: object }>}
 */
export async function createIncome(incomeData) {
  return httpClient.post('/api/incomes', incomeData);
}

/**
 * Update an existing income
 * @param {string} incomeId
 * @param {IncomeInput} incomeData
 * @returns {Promise<{ success: boolean, income: object }>}
 */
export async function updateIncome(incomeId, incomeData) {
  if (!incomeId) throw new Error('شناسه درآمد الزامی است');
  return httpClient.put(`/api/incomes/${encodeURIComponent(incomeId)}`, incomeData);
}

/**
 * Delete an income
 * @param {string} incomeId
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function deleteIncome(incomeId) {
  if (!incomeId) throw new Error('شناسه درآمد الزامی است');
  return httpClient.delete(`/api/incomes/${encodeURIComponent(incomeId)}`);
}
