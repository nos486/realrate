/**
 * loanApi.js — Loans & Installments Feature API Calls
 * Interfaces with RealRate Cloudflare Worker API via httpClient
 */

import { httpClient } from '../../../shared/api/httpClient.js';

/**
 * Fetch all loans for the current user
 * @returns {Promise<{ success: boolean, count: number, loans: Array }>}
 */
export async function getLoans() {
  return httpClient.get('/api/loans');
}

/**
 * Create a new loan with auto-generated schedule
 * @param {object} loanData
 * @returns {Promise<{ success: boolean, loan: object }>}
 */
export async function createLoan(loanData) {
  return httpClient.post('/api/loans', loanData);
}

/**
 * Get single loan details including full installments table
 * @param {string} loanId
 * @returns {Promise<{ success: boolean, loan: object }>}
 */
export async function getLoanDetail(loanId) {
  if (!loanId) throw new Error('شناسه وام الزامی است');
  return httpClient.get(`/api/loans/${encodeURIComponent(loanId)}`);
}

/**
 * Update a loan (rebuilds pending installments if financial terms changed)
 * @param {string} loanId
 * @param {object} loanData
 * @returns {Promise<{ success: boolean, loan: object }>}
 */
export async function updateLoan(loanId, loanData) {
  if (!loanId) throw new Error('شناسه وام الزامی است');
  return httpClient.put(`/api/loans/${encodeURIComponent(loanId)}`, loanData);
}

/**
 * Delete a loan and all its installments
 * @param {string} loanId
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function deleteLoan(loanId) {
  if (!loanId) throw new Error('شناسه وام الزامی است');
  return httpClient.delete(`/api/loans/${encodeURIComponent(loanId)}`);
}

/**
 * Mark a specific installment as paid
 * @param {string} loanId
 * @param {string} installmentId
 * @param {object} [details={}]
 * @param {string} [details.paidDate]
 * @param {number} [details.paidAmount]
 * @returns {Promise<{ success: boolean, installment: object }>}
 */
export async function markInstallmentPaid(loanId, installmentId, details = {}) {
  if (!loanId || !installmentId) throw new Error('شناسه وام و قسط الزامی است');
  return httpClient.put(
    `/api/loans/${encodeURIComponent(loanId)}/installments/${encodeURIComponent(installmentId)}`,
    {
      isPaid: true,
      paidDate: details.paidDate,
      paidAmount: details.paidAmount,
    }
  );
}

/**
 * Reset a specific installment to unpaid
 * @param {string} loanId
 * @param {string} installmentId
 * @returns {Promise<{ success: boolean, installment: object }>}
 */
export async function unmarkInstallmentPaid(loanId, installmentId) {
  if (!loanId || !installmentId) throw new Error('شناسه وام و قسط الزامی است');
  return httpClient.put(
    `/api/loans/${encodeURIComponent(loanId)}/installments/${encodeURIComponent(installmentId)}`,
    { isPaid: false }
  );
}

/**
 * Manually override a specific unpaid installment amount
 * @param {string} loanId
 * @param {string} installmentId
 * @param {number} totalAmount
 * @returns {Promise<{ success: boolean, loan: object, installment: object, actualTotalAmount: number }>}
 */
export async function setInstallmentAmount(loanId, installmentId, totalAmount) {
  if (!loanId || !installmentId) throw new Error('شناسه وام و قسط الزامی است');
  return httpClient.put(
    `/api/loans/${encodeURIComponent(loanId)}/installments/${encodeURIComponent(installmentId)}/amount`,
    { totalAmount: Number(totalAmount) }
  );
}
