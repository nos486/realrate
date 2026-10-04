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
 * @param {{ usdToman?: number, usdAt?: Function, holdings?: object[] }} [options] today's dollar
 *   rate and the rate on a date (price history), for dollar expenses without a rate of their own,
 *   and portfolio holdings (any; only the loan's own count)
 * @returns {{ principal: number, spent: number, remaining: number, overspent: number,
 *   count: number, items: { id: string, kind: 'expense'|'holding', source: object, date: string,
 *   toman: number }[] }} `items`: what the loan paid for, newest first
 */
export function summarizeLoanFunding(loan, expenses = [], { usdToman = 0, usdAt = null, holdings = [] } = {}) {
  const principal = Number(loan?.principalAmount) || 0;
  const own = (list) => list.filter((x) => loan?.id && x.loanId === loan.id);
  const items = [
    ...own(expenses).map((e) => ({ id: e.id, kind: 'expense', source: e, date: isoDayOf(e.date), toman: expenseInToman(e, usdToman, usdAt) || 0 })),
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

const DAY_MS = 86_400_000;
/** Shorter than this, a yearly figure says more about noise than about the investment */
export const MIN_ANNUALIZE_DAYS = 30;

/**
 * How the holdings a loan bought are doing, next to what the loan costs: their cost and value
 * today, the gain, and that gain as a yearly (simple) rate — comparable with the loan's yearly
 * interest rate. The holding period is weighted by cost, so a big recent purchase counts more
 * than a small old one.
 * @param {object[]} items `summarizeLoanFunding(...).items`; only holdings count
 * @param {(holding: object) => number|null} valueOf a holding's value today in tomans (null: unknown)
 * @param {{ today?: string }} [options] YYYY-MM-DD
 * @returns {{ count: number, cost: number, value: number, gain: number, gainPct: number|null,
 *   annualPct: number|null, days: number }|null} null when the loan bought no priced holding;
 *   `annualPct` is null under MIN_ANNUALIZE_DAYS or without buy dates
 */
export function loanInvestmentReturn(items = [], valueOf, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const now = Date.parse(`${today}T00:00:00Z`);
  let count = 0;
  let cost = 0;
  let value = 0;
  let datedCost = 0;
  let costDays = 0;
  for (const item of items) {
    if (item.kind !== 'holding' || !(item.toman > 0)) continue;
    const worth = valueOf(item.source);
    if (worth === null || worth === undefined || !Number.isFinite(worth)) continue;
    count++;
    cost += item.toman;
    value += worth;
    const bought = item.date ? Date.parse(`${item.date}T00:00:00Z`) : NaN;
    if (Number.isFinite(bought) && bought <= now) {
      datedCost += item.toman;
      costDays += item.toman * ((now - bought) / DAY_MS);
    }
  }
  if (!count) return null;
  const gain = value - cost;
  const gainPct = cost > 0 ? (gain / cost) * 100 : null;
  const days = datedCost > 0 ? costDays / datedCost : 0;
  const annualPct = gainPct !== null && days >= MIN_ANNUALIZE_DAYS ? (gainPct * 365) / days : null;
  return { count, cost, value, gain, gainPct, annualPct, days };
}
