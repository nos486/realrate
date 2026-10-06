/**
 * reportMath.js — The reports page's figures, month by month over a Shamsi year (pure: no React,
 * no storage)
 *
 * - What was invested: every portfolio's buys and dated holdings (money in) less its sells and
 *   spends (money out), at each one's own price in tomans. Money moving inside the portfolios (a
 *   buy paid with another asset, a sale for one: `referenceAssetId`) is not new money, and a buy
 *   with a loan (`loanId`) isn't the user's income; neither counts.
 * - The share of income invested: what was invested ÷ the month's income (the incomes counted in
 *   the totals: «مدیریت نقدینگی» and the like are left out by the caller).
 * - Income and expenses in dollars: each one at the dollar's rate on its own day (its stored rate
 *   first, else the price history); one without a rate is counted apart, never at today's rate.
 */

import { buildYearSeries } from '../../shared/flow/flowYear.js';
import { sortableDate } from '../portfolio/utils/assetLedger.js';

const num = (v) => Number(v) || 0;
const txType = (t) => String(t.transactionType || t.type || 'buy').toLowerCase();
const txQty = (t) => num(t.quantity !== undefined ? t.quantity : t.amount);
const txPrice = (t) => num(t.unitPrice !== undefined ? t.unitPrice : (t.buyPrice || t.price));

/**
 * Money that went into investments (+) or came out of them (−) as dated points, or nothing for
 * what doesn't count (no date, no price, a swap, bought with a loan)
 * @returns {Array<{ date: string, amount: number, category: 'buy'|'sell' }>}
 */
export function investmentPoints(holdings = [], transactions = []) {
  const points = [];
  for (const h of holdings) {
    const date = sortableDate(h?.buyDate);
    const value = num(h?.amount) * num(h?.buyPrice);
    if (!date || !(value > 0) || h.referenceAssetId || h.loanId) continue;
    points.push({ date, amount: value, category: 'buy' });
  }
  for (const t of transactions) {
    if (!t) continue;
    const date = sortableDate(t.transactionDate || t.date);
    const value = txQty(t) * txPrice(t);
    const type = txType(t);
    if (!date || !(value > 0) || t.referenceAssetId) continue;
    if (type === 'buy' && !t.loanId) points.push({ date, amount: value, category: 'buy' });
    else if (type === 'sell' || type === 'spend') points.push({ date, amount: -value, category: 'sell' });
  }
  return points;
}

/**
 * The year month by month: income, bought, sold, net invested and its share of the income
 * (null when the month had no income)
 * @param {Array<{ date: string, amount: number }>} incomePoints tomans
 * @param {ReturnType<typeof investmentPoints>} investPoints
 * @param {number} jy
 * @param {{ throughMonth?: number }} [options]
 */
export function investmentShareByMonth(incomePoints, investPoints, jy, { throughMonth = 12 } = {}) {
  const income = buildYearSeries(incomePoints, jy, { throughMonth });
  const invest = buildYearSeries(investPoints, jy, { throughMonth });
  return income.map((m, i) => {
    const bought = num(invest[i]?.byCategory.buy);
    const sold = Math.abs(num(invest[i]?.byCategory.sell));
    const net = bought - sold;
    return {
      key: m.key,
      jm: m.jm,
      label: m.label,
      monthLabel: m.monthLabel,
      income: m.total,
      bought,
      sold,
      net,
      share: m.total > 0 ? (net / m.total) * 100 : null,
    };
  });
}

/** The year's totals of investmentShareByMonth: income, net invested and the share of it */
export function summarizeInvestmentShare(months) {
  const income = months.reduce((s, m) => s + m.income, 0);
  const bought = months.reduce((s, m) => s + m.bought, 0);
  const sold = months.reduce((s, m) => s + m.sold, 0);
  const net = bought - sold;
  return { income, bought, sold, net, share: income > 0 ? (net / income) * 100 : null };
}

/**
 * Items as dated dollar points, at each one's own day rate (`dollarOf` gives { usd } or null);
 * `unpriced` counts the ones without a rate (left out)
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string} dateOf
 * @param {(item: T) => ({ usd: number }|null)} dollarOf
 */
export function dollarPoints(items = [], dateOf, dollarOf) {
  const points = [];
  let unpriced = 0;
  for (const item of items) {
    const usd = dollarOf(item)?.usd;
    if (usd > 0) points.push({ date: dateOf(item), amount: usd });
    else if (usd === undefined || usd === null) unpriced++;
  }
  return { points, unpriced };
}

/**
 * Income and expenses in dollars month by month, and what was left (income − expenses)
 * @returns {Array<{ key: string, jm: number, label: string, monthLabel: string, income: number, expense: number, net: number }>}
 */
export function dollarFlowByMonth(incomePoints, expensePoints, jy, { throughMonth = 12 } = {}) {
  const income = buildYearSeries(incomePoints, jy, { throughMonth });
  const expense = buildYearSeries(expensePoints, jy, { throughMonth });
  return income.map((m, i) => ({
    key: m.key,
    jm: m.jm,
    label: m.label,
    monthLabel: m.monthLabel,
    income: m.total,
    expense: expense[i]?.total || 0,
    net: m.total - (expense[i]?.total || 0),
  }));
}
