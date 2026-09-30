/**
 * loanFunding.js — What a received loan was spent on
 *
 * A loan is not income: the money received is a debt. What it pays for is recorded where it is
 * spent, with `loanId` («تأمین از») instead of the user's own money:
 *   - an expense (expenseDocument.js), daily or of a project
 *   - a portfolio holding bought with it (its cost: amount × buy price, in tomans)
 * This module sums those up per loan: how much of the principal has been spent, what is left, and
 * on what. Shared with the web client through a symlink.
 */

import { expenseInToman } from './expenseDocument.js';
import { jalaliToGregorian } from './loanCalculator.js';

const DAY_RE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/;
const pad = (n) => String(n).padStart(2, '0');

/** A day as Gregorian YYYY-MM-DD: holdings keep a Shamsi buy date («1405/07/08»); '' when none */
export function isoDayOf(value) {
  const digits = String(value ?? '').trim().replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  const match = digits.match(DAY_RE);
  if (!match) return '';
  let [year, month, day] = match.slice(1).map(Number);
  if (year < 1700) ({ year, month, day } = jalaliToGregorian(year, month, day));
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** A loan is settled once nothing is owed, or every installment is paid */
export function isLoanSettled(loan = {}) {
  const total = Number(loan.installmentCount) || 0;
  return loan.remainingBalance === 0 || (total > 0 && (Number(loan.paidCount) || 0) >= total);
}

/**
 * The loans a purchase can be funded from: those not yet settled, plus the one it already names
 * (so editing an older expense keeps its loan)
 * @param {object[]} loans
 * @param {string} [currentLoanId]
 */
export function fundingLoanOptions(loans = [], currentLoanId = '') {
  return loans.filter((l) => l.id === currentLoanId || !isLoanSettled(l));
}

/** What a holding cost, in tomans (0 without a buy price) */
export function holdingCostToman(holding = {}) {
  return (Number(holding.amount) || 0) * (Number(holding.buyPrice) || 0);
}

/**
 * How much of `loan` was spent, from the expenses and holdings that name it
 * @param {object} loan `{ id, principalAmount }`
 * @param {object[]} expenses any expenses; only those with `loanId === loan.id` count
 * @param {{ usdToman?: number, holdings?: object[] }} [options] today's dollar rate (for dollar
 *   expenses without one), and portfolio holdings (any; only the loan's own count)
 * @returns {{ principal: number, spent: number, remaining: number, overspent: number,
 *   count: number, items: { id: string, kind: 'expense'|'holding', source: object, date: string,
 *   toman: number }[] }} `items`: what the loan paid for, newest first
 */
export function summarizeLoanFunding(loan, expenses = [], { usdToman = 0, holdings = [] } = {}) {
  const principal = Number(loan?.principalAmount) || 0;
  const own = (list) => list.filter((x) => loan?.id && x.loanId === loan.id);
  const items = [
    ...own(expenses).map((e) => ({ id: e.id, kind: 'expense', source: e, date: isoDayOf(e.date), toman: expenseInToman(e, usdToman) || 0 })),
    ...own(holdings).map((h) => ({ id: h.id, kind: 'holding', source: h, date: isoDayOf(h.buyDate), toman: holdingCostToman(h) })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const spent = items.reduce((sum, i) => sum + i.toman, 0);
  return {
    principal,
    spent,
    remaining: Math.max(0, principal - spent),
    overspent: Math.max(0, spent - principal),
    count: items.length,
    items,
  };
}
