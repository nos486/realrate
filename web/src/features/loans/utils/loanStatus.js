/**
 * loanStatus.js — Whether a loan is settled (nothing left to pay), shared by the loans list's
 * row cards and the list's default of hiding settled loans
 */

/**
 * @param {{ remainingBalance?: number, totalCount?: number, installmentCount?: number, paidCount?: number }} loan
 * @returns {boolean} true when every installment is paid
 */
export function isLoanCompleted(loan) {
  const totalCount = loan.totalCount || loan.installmentCount || 0;
  const paidCount = loan.paidCount || 0;
  return loan.remainingBalance === 0 || (totalCount > 0 && paidCount >= totalCount);
}
