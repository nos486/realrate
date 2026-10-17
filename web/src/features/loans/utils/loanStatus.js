/**
 * loanStatus.js — Whether a loan is settled (nothing left to pay), shared by the loans list's
 * row cards and the list's default of hiding settled loans, and how urgent its next installment is
 */

/** Days left to the next installment at or below which a loan card turns red (overdue included) */
export const DUE_NEAR_DAYS = 7;
/** Days left above which a loan card is green (just paid or far from its next installment); between is amber */
export const DUE_FAR_DAYS = 20;

const DAY_MS = 86400000;

/**
 * @param {string} fromIso ISO date (YYYY-MM-DD)
 * @param {string} toIso ISO date (YYYY-MM-DD)
 * @returns {number} whole days from `fromIso` to `toIso` (negative when `toIso` is earlier)
 */
export function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`)) / DAY_MS);
}


/**
 * @param {{ remainingBalance?: number, totalCount?: number, installmentCount?: number, paidCount?: number }} loan
 * @returns {boolean} true when every installment is paid
 */
export function isLoanCompleted(loan) {
  const totalCount = loan.totalCount || loan.installmentCount || 0;
  const paidCount = loan.paidCount || 0;
  return loan.remainingBalance === 0 || (totalCount > 0 && paidCount >= totalCount);
}

/**
 * The tone of a loan card by how close its next installment is: green when far (or settled),
 * amber in between, red when near or overdue.
 * @param {{ nextDueInstallment?: { dueDate?: string } | null }} loan
 * @param {string} today ISO date (YYYY-MM-DD)
 * @returns {'positive' | 'warning' | 'negative'}
 */
export function loanDueTone(loan, today) {
  const dueDate = loan.nextDueInstallment?.dueDate;
  if (isLoanCompleted(loan) || !dueDate) return 'positive';
  const days = daysBetween(today, dueDate);
  if (days <= DUE_NEAR_DAYS) return 'negative';
  return days > DUE_FAR_DAYS ? 'positive' : 'warning';
}
