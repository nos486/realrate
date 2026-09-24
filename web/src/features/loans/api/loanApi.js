/**
 * loanApi.js — Loans & Installments Feature API Calls
 * Interfaces with RealRate Cloudflare Worker API via httpClient
 */

import { httpClient } from '../../../shared/api/httpClient.js';
import { routeThroughVault } from '../../../shared/vault/vaultRouting.js';
import * as vaultLoans from '../../../shared/vault/vaultLoans.js';

/**
 * Fetch all loans for the current user
 * @returns {Promise<{ success: boolean, count: number, loans: Array }>}
 */
async function getLoansRest() {
  return httpClient.get('/api/loans');
}

/**
 * Create a new loan with auto-generated schedule
 * Supports optional `customFirstInstallmentAmount` in `loanData` for atomic first-installment customization
 * @param {object} loanData
 * @returns {Promise<{ success: boolean, loan: object }>}
 */
async function createLoanRest(loanData) {
  return httpClient.post('/api/loans', loanData);
}

/**
 * Get single loan details including full installments table
 * @param {string} loanId
 * @returns {Promise<{ success: boolean, loan: object }>}
 */
async function getLoanDetailRest(loanId) {
  if (!loanId) throw new Error('شناسه وام الزامی است');
  return httpClient.get(`/api/loans/${encodeURIComponent(loanId)}`);
}

/**
 * Update a loan (rebuilds pending installments if financial terms changed)
 * @param {string} loanId
 * @param {object} loanData
 * @returns {Promise<{ success: boolean, loan: object }>}
 */
async function updateLoanRest(loanId, loanData) {
  if (!loanId) throw new Error('شناسه وام الزامی است');
  return httpClient.put(`/api/loans/${encodeURIComponent(loanId)}`, loanData);
}

/**
 * Delete a loan and all its installments
 * @param {string} loanId
 * @returns {Promise<{ success: boolean, message: string }>}
 */
async function deleteLoanRest(loanId) {
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
 * @param {boolean} [details.cascade]
 * @returns {Promise<{ success: boolean, installment: object, cascadedCount?: number, cascadedTotal?: number, cascadedInstallments?: Array }>}
 */
async function markInstallmentPaidRest(loanId, installmentId, details = {}) {
  if (!loanId || !installmentId) throw new Error('شناسه وام و قسط الزامی است');
  return httpClient.put(
    `/api/loans/${encodeURIComponent(loanId)}/installments/${encodeURIComponent(installmentId)}`,
    {
      isPaid: true,
      paidDate: details.paidDate,
      paidAmount: details.paidAmount,
      cascade: Boolean(details.cascade),
    }
  );
}

/**
 * Reset a specific installment to unpaid
 * @param {string} loanId
 * @param {string} installmentId
 * @returns {Promise<{ success: boolean, installment: object }>}
 */
async function unmarkInstallmentPaidRest(loanId, installmentId) {
  if (!loanId || !installmentId) throw new Error('شناسه وام و قسط الزامی است');
  return httpClient.put(
    `/api/loans/${encodeURIComponent(loanId)}/installments/${encodeURIComponent(installmentId)}`,
    { isPaid: false }
  );
}

/**
 * Re-plan every pending installment's amount at once ("ویرایش گروهی اقساط"): any subset gets a
 * known/fixed amount, and every other pending installment equally divides whatever's left —
 * both before and after the touched ones, not just a forward cascade. Available at any time,
 * not just at creation; each call fully replaces the loan's prior plan for still-pending
 * installments and switches it into "distributed" schedule mode.
 * @param {string} loanId
 * @param {Object<number, number>} knownAmounts - installmentNumber -> totalAmount
 * @param {number} [totalRepaymentAmount] - the exact pool (principal + interest) to divide;
 *   should be the loan's current actual total so an edit never silently changes the grand total
 * @returns {Promise<{ success: boolean, loan: object }>}
 */
async function bulkDistributeInstallmentsRest(loanId, knownAmounts, totalRepaymentAmount) {
  if (!loanId) throw new Error('شناسه وام الزامی است');
  const body = { knownAmounts: knownAmounts || {} };
  if (totalRepaymentAmount !== undefined && totalRepaymentAmount !== null) {
    body.totalRepaymentAmount = Number(totalRepaymentAmount);
  }
  return httpClient.put(
    `/api/loans/${encodeURIComponent(loanId)}/installments/bulk`,
    body
  );
}

/**
 * Record an extra lump-sum payment for a loan
 * @param {string} loanId
 * @param {object} paymentData
 * @param {number} paymentData.amount
 * @param {string} paymentData.paymentDate
 * @param {'reduce_amount'|'reduce_term'} [paymentData.reductionMode]
 * @param {string} [paymentData.notes]
 * @returns {Promise<{ success: boolean, fullyPaidOff: boolean, extraPayment: object, loan: object }>}
 */
async function addLoanExtraPaymentRest(loanId, paymentData) {
  if (!loanId) throw new Error('شناسه وام الزامی است');
  return httpClient.post(
    `/api/loans/${encodeURIComponent(loanId)}/extra-payments`,
    paymentData
  );
}

/**
 * Fetch all recorded extra payments for a loan
 * @param {string} loanId
 * @returns {Promise<{ success: boolean, count: number, extraPayments: Array }>}
 */
async function getLoanExtraPaymentsRest(loanId) {
  if (!loanId) throw new Error('شناسه وام الزامی است');
  return httpClient.get(`/api/loans/${encodeURIComponent(loanId)}/extra-payments`);
}

// With account-wide end-to-end encryption on, every call runs against the encrypted loan
// documents in the browser instead (same signatures and response shapes).
export const {
  getLoans,
  createLoan,
  getLoanDetail,
  updateLoan,
  deleteLoan,
  markInstallmentPaid,
  unmarkInstallmentPaid,
  bulkDistributeInstallments,
  addLoanExtraPayment,
  getLoanExtraPayments,
} = routeThroughVault(
  {
    getLoans: getLoansRest,
    createLoan: createLoanRest,
    getLoanDetail: getLoanDetailRest,
    updateLoan: updateLoanRest,
    deleteLoan: deleteLoanRest,
    markInstallmentPaid: markInstallmentPaidRest,
    unmarkInstallmentPaid: unmarkInstallmentPaidRest,
    bulkDistributeInstallments: bulkDistributeInstallmentsRest,
    addLoanExtraPayment: addLoanExtraPaymentRest,
    getLoanExtraPayments: getLoanExtraPaymentsRest,
  },
  vaultLoans
);
