/**
 * loanFunding.js — What a received loan was spent on
 *
 * A loan is not income: the money received is a debt. What it pays for is recorded where it is
 * spent — an expense (expenseDocument.js) carries `loanId` when it was paid from a loan rather than
 * the user's own money («تأمین از»). This module sums those up per loan: how much of the principal
 * has been spent, what is left, and on what. Shared with the web client through a symlink.
 */

import { expenseInToman } from './expenseDocument.js';

/** A loan is settled once nothing is owed, or every installment is paid */
export function isLoanSettled(loan = {}) {
  const total = Number(loan.installmentCount) || 0;
  return loan.remainingBalance === 0 || (total > 0 && (Number(loan.paidCount) || 0) >= total);
}

/**
 * The loans an expense can be funded from: those not yet settled, plus the one it already names
 * (so editing an older expense keeps its loan)
 * @param {object[]} loans
 * @param {string} [currentLoanId]
 */
export function fundingLoanOptions(loans = [], currentLoanId = '') {
  return loans.filter((l) => l.id === currentLoanId || !isLoanSettled(l));
}

/**
 * How much of `loan` was spent, from the expenses that name it
 * @param {object} loan `{ id, principalAmount }`
 * @param {object[]} expenses any expenses; only those with `loanId === loan.id` count
 * @param {{ usdToman?: number }} [options] today's dollar rate, for dollar expenses without one
 * @returns {{ principal: number, spent: number, remaining: number, overspent: number,
 *   count: number, expenses: object[] }} `expenses`: the loan's own, newest first
 */
export function summarizeLoanFunding(loan, expenses = [], { usdToman = 0 } = {}) {
  const principal = Number(loan?.principalAmount) || 0;
  const own = expenses
    .filter((e) => loan?.id && e.loanId === loan.id)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const spent = own.reduce((sum, e) => sum + (expenseInToman(e, usdToman) || 0), 0);
  return {
    principal,
    spent,
    remaining: Math.max(0, principal - spent),
    overspent: Math.max(0, spent - principal),
    count: own.length,
    expenses: own,
  };
}
