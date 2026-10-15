/**
 * loanApi.js — The loans feature's data: every loan is an end-to-end encrypted vault record and
 * every operation runs in the browser on the decrypted document (shared/vault/vaultLoans.js,
 * domain/loanDocument.js). The feature imports from here, so its callers never name the store.
 */

export {
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
} from '../../../shared/vault/vaultLoans.js';
