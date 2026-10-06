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
 * @returns {Array<{ date: string, amount: number, category: 'buy'|'sell', assetId: string, assetName: string }>}
 */
export function investmentPoints(holdings = [], transactions = []) {
  const points = [];
  for (const h of holdings) {
    const date = sortableDate(h?.buyDate);
    const value = num(h?.amount) * num(h?.buyPrice);
    if (!date || !(value > 0) || h.referenceAssetId || h.loanId) continue;
    points.push({ date, amount: value, category: 'buy', assetId: String(h.assetId || ''), assetName: String(h.assetName || '') });
  }
  for (const t of transactions) {
    if (!t) continue;
    const date = sortableDate(t.transactionDate || t.date);
    const value = txQty(t) * txPrice(t);
    const type = txType(t);
    if (!date || !(value > 0) || t.referenceAssetId) continue;
    const asset = { assetId: String(t.assetId || t.symbol || ''), assetName: String(t.assetName || '') };
    if (type === 'buy' && !t.loanId) points.push({ date, amount: value, category: 'buy', ...asset });
    else if (type === 'sell' || type === 'spend') points.push({ date, amount: -value, category: 'sell', ...asset });
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
  // The days of the ones without a rate, so each month can say what it left out
  const missing = [];
  for (const item of items) {
    const usd = dollarOf(item)?.usd;
    if (usd > 0) points.push({ date: dateOf(item), amount: usd });
    else if (usd === undefined || usd === null) missing.push({ date: dateOf(item), amount: 0 });
  }
  return { points, missing, unpriced: missing.length };
}

/**
 * Income and expenses in dollars month by month, and what was left (income − expenses);
 * `unpriced`: the month's items left out for want of a rate (`missing`, from dollarPoints)
 * @returns {Array<{ key: string, jm: number, label: string, monthLabel: string, income: number, expense: number, net: number, unpriced: number }>}
 */
export function dollarFlowByMonth(incomePoints, expensePoints, jy, { throughMonth = 12, missing = [] } = {}) {
  const income = buildYearSeries(incomePoints, jy, { throughMonth });
  const expense = buildYearSeries(expensePoints, jy, { throughMonth });
  const left = buildYearSeries(missing, jy, { throughMonth });
  return income.map((m, i) => ({
    unpriced: left[i]?.count || 0,
    key: m.key,
    jm: m.jm,
    label: m.label,
    monthLabel: m.monthLabel,
    income: m.total,
    expense: expense[i]?.total || 0,
    net: m.total - (expense[i]?.total || 0),
  }));
}

/**
 * What went into each asset over a period: bought, sold and net, largest buy first (a name of the
 * record's own when it has one, e.g. a custom asset)
 * @param {ReturnType<typeof investmentPoints>} points
 * @param {{ from: string, to: string }} range inclusive YYYY-MM-DD
 * @returns {Array<{ assetId: string, assetName: string, bought: number, sold: number, net: number }>}
 */
export function investmentByAsset(points, { from, to }) {
  const byAsset = new Map();
  for (const p of points) {
    if (!p.assetId || p.date < from || p.date > to) continue;
    const entry = byAsset.get(p.assetId) || { assetId: p.assetId, assetName: '', bought: 0, sold: 0, net: 0 };
    if (!entry.assetName && p.assetName) entry.assetName = p.assetName;
    if (p.amount > 0) entry.bought += p.amount;
    else entry.sold += -p.amount;
    entry.net = entry.bought - entry.sold;
    byAsset.set(p.assetId, entry);
  }
  return [...byAsset.values()].sort((a, b) => b.bought - a.bought || b.sold - a.sold);
}

/**
 * Income and expenses month by month (two buildYearSeries of the same year): what was left and
 * the savings rate (null without income)
 * @returns {Array<{ key: string, jm: number, label: string, monthLabel: string, income: number, expense: number, net: number, savingsRate: number|null }>}
 */
export function cashFlowByMonth(incomeSeries, expenseSeries) {
  return incomeSeries.map((m, i) => {
    const expense = expenseSeries[i]?.total || 0;
    const net = m.total - expense;
    return {
      key: m.key,
      jm: m.jm,
      label: m.label,
      monthLabel: m.monthLabel,
      income: m.total,
      expense,
      net,
      savingsRate: m.total > 0 ? (net / m.total) * 100 : null,
    };
  });
}

/**
 * The year's cash flow: totals, the savings rate, the monthly average left, the months that spent
 * more than came in, and the best and worst months (by what was left)
 */
export function summarizeCashFlow(months) {
  const income = months.reduce((s, m) => s + m.income, 0);
  const expense = months.reduce((s, m) => s + m.expense, 0);
  const active = months.filter((m) => m.income > 0 || m.expense > 0);
  const byNet = [...active].sort((a, b) => b.net - a.net);
  return {
    income,
    expense,
    net: income - expense,
    savingsRate: income > 0 ? ((income - expense) / income) * 100 : null,
    monthlyNet: active.length ? (income - expense) / active.length : 0,
    months: active.length,
    negativeMonths: active.filter((m) => m.net < 0).length,
    best: byNet[0] || null,
    worst: byNet.length > 1 ? byNet[byNet.length - 1] : null,
  };
}

/**
 * What stands out in the year, as facts the page words: the best and worst month for saving,
 * the months that spent more than came in, the largest expense category's share, the share of
 * income invested, the costliest month against the monthly average. Only the ones the data holds.
 * @param {{ cash: ReturnType<typeof summarizeCashFlow>, expenseYear?: { total: number, monthlyAverage: number, top: object|null, byCategory: Array<{ category: string, total: number }> }|null,
 *   invest?: { share: number|null, net: number }|null }} input
 * @returns {Array<{ id: string, tone: 'good'|'bad'|'info', [key: string]: any }>}
 */
export function reportInsights({ cash, expenseYear = null, invest = null }) {
  const out = [];
  if (cash.best && cash.best.net > 0) out.push({ id: 'best-month', tone: 'good', month: cash.best.label, net: cash.best.net, rate: cash.best.savingsRate });
  if (cash.negativeMonths > 0) out.push({ id: 'negative-months', tone: 'bad', count: cash.negativeMonths, months: cash.months });
  if (cash.worst && cash.worst.net < 0) out.push({ id: 'worst-month', tone: 'bad', month: cash.worst.label, net: cash.worst.net });
  const topCategory = expenseYear?.byCategory?.[0];
  if (topCategory && expenseYear.total > 0) {
    out.push({ id: 'top-category', tone: 'info', category: topCategory.category, total: topCategory.total, share: (topCategory.total / expenseYear.total) * 100 });
  }
  const top = expenseYear?.top;
  if (top && expenseYear.monthlyAverage > 0 && top.total > expenseYear.monthlyAverage * 1.25) {
    out.push({ id: 'costly-month', tone: 'info', month: top.label, total: top.total, over: ((top.total - expenseYear.monthlyAverage) / expenseYear.monthlyAverage) * 100 });
  }
  if (invest && invest.share !== null && invest.net > 0) out.push({ id: 'invested-share', tone: 'good', share: invest.share, net: invest.net });
  return out;
}
