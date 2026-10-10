/**
 * reportMath.js — The reports page's figures, month by month over a Shamsi year (pure: no React,
 * no storage)
 *
 * - What was invested: the everyday expenses recorded in the «سرمایه‌گذاری» category (the money
 *   the user spent on investments), by month and by what it went into — the portfolios' own
 *   records are not read
 * - The share of income invested: what was invested ÷ the month's income (the incomes counted in
 *   the totals: «سرمایه‌گذاری» and the like are left out by the caller).
 * - Income and expenses in dollars: each one at the dollar's rate on its own day (its stored rate
 *   first, else the price history); one without a rate is counted apart, never at today's rate.
 * - Subscriptions: what was paid for each in the year — the expenses that name it
 *   (`subscriptionId`), and the ones in «اینترنت و اشتراک‌ها» that name none, apart.
 * - What is left out of the totals, shown apart: the excluded categories of incomes and expenses
 *   («سرمایه‌گذاری», «فروش دارایی», …) and each project's spending (sumApart).
 */

import { buildYearSeries } from '../../shared/flow/flowYear.js';
import { SUBSCRIPTION_EXPENSE_CATEGORY } from '../../utils/subscriptionDocument.js';

const num = (v) => Number(v) || 0;

/** The expense category whose expenses are money put into investments */
export const INVESTMENT_CATEGORY = 'investment';

/**
 * Everyday expenses recorded as investment (category «سرمایه‌گذاری») as dated points in tomans
 * (`amountOf`: the user's share, a dollar expense at its day's rate), each with what it went into:
 * the asset it was added to in a portfolio (`investedIn`), else its own title
 * @param {object[]} expenses
 * @param {(e: object) => number} amountOf
 * @returns {Array<{ date: string, amount: number, key: string, assetId: string, title: string }>}
 */
export function investmentPoints(expenses = [], amountOf) {
  const points = [];
  for (const e of expenses) {
    if (e?.category !== INVESTMENT_CATEGORY) continue;
    const amount = num(amountOf(e));
    if (!e.date || !(amount > 0)) continue;
    const assetId = String(e.investedIn?.assetId || '');
    const title = String(e.title || '').trim();
    points.push({ date: e.date, amount, key: assetId ? `asset:${assetId}` : `title:${title}`, assetId, title });
  }
  return points;
}

/**
 * The year month by month: income, what was invested and its share of the income (null when the
 * month had no income)
 * @param {Array<{ date: string, amount: number }>} incomePoints tomans
 * @param {ReturnType<typeof investmentPoints>} investPoints
 * @param {number} jy
 * @param {{ throughMonth?: number }} [options]
 */
export function investmentShareByMonth(incomePoints, investPoints, jy, { throughMonth = 12 } = {}) {
  const income = buildYearSeries(incomePoints, jy, { throughMonth });
  const invest = buildYearSeries(investPoints, jy, { throughMonth });
  return income.map((m, i) => {
    const invested = invest[i]?.total || 0;
    return {
      key: m.key,
      jm: m.jm,
      label: m.label,
      monthLabel: m.monthLabel,
      income: m.total,
      invested,
      count: invest[i]?.count || 0,
      share: m.total > 0 ? (invested / m.total) * 100 : null,
    };
  });
}

/** The year's totals of investmentShareByMonth: income, what was invested and its share */
export function summarizeInvestmentShare(months) {
  const income = months.reduce((s, m) => s + m.income, 0);
  const invested = months.reduce((s, m) => s + m.invested, 0);
  const count = months.reduce((s, m) => s + m.count, 0);
  return { income, invested, count, share: income > 0 ? (invested / income) * 100 : null };
}

/**
 * What the year's investment went into, largest first: one entry per asset (added to a
 * portfolio) or per title
 * @param {ReturnType<typeof investmentPoints>} points
 * @param {{ from: string, to: string }} range inclusive YYYY-MM-DD
 * @returns {Array<{ key: string, assetId: string, title: string, total: number, count: number }>}
 */
export function investmentBreakdown(points, { from, to }) {
  const byKey = new Map();
  for (const p of points) {
    if (p.date < from || p.date > to) continue;
    const entry = byKey.get(p.key) || { key: p.key, assetId: p.assetId, title: p.title, total: 0, count: 0 };
    entry.total += p.amount;
    entry.count += 1;
    byKey.set(p.key, entry);
  }
  return [...byKey.values()].sort((a, b) => b.total - a.total);
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
 * income invested, the costliest month against the monthly average, what subscriptions took of
 * the expenses. Only the ones the data holds.
 * @param {{ cash: ReturnType<typeof summarizeCashFlow>, expenseYear?: { total: number, monthlyAverage: number, top: object|null, byCategory: Array<{ category: string, total: number }> }|null,
 *   invest?: { share: number|null, invested: number }|null,
 *   subscriptions?: { total: number }|null }} input
 * @returns {Array<{ id: string, tone: 'good'|'bad'|'info', [key: string]: any }>}
 */
export function reportInsights({ cash, expenseYear = null, invest = null, subscriptions = null }) {
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
  if (invest && invest.share !== null && invest.invested > 0) out.push({ id: 'invested-share', tone: 'good', share: invest.share, invested: invest.invested });
  if (subscriptions?.total > 0 && expenseYear?.total > 0) {
    out.push({ id: 'subscriptions-share', tone: 'info', total: subscriptions.total, share: (subscriptions.total / expenseYear.total) * 100 });
  }
  return out;
}

/**
 * What was paid for each subscription in the year, largest first: the expenses naming it (in
 * tomans: `amountOf`, the user's share, a dollar one at its day's rate). Payments in the
 * subscriptions category that name none are counted apart (`unlinked`); a removed subscription's
 * payments keep showing under «اشتراک حذف‌شده».
 * @param {object[]} expenses the year's expenses
 * @param {object[]} subscriptions
 * @param {(e: object) => number} amountOf
 * @param {{ from: string, to: string }} range inclusive YYYY-MM-DD
 * @returns {{ rows: Array<{ id: string, name: string, count: number, total: number, last: string, removed: boolean }>,
 *   unlinked: { count: number, total: number }, total: number, count: number }}
 */
export function subscriptionPayments(expenses = [], subscriptions = [], amountOf, { from, to }) {
  const byId = new Map(subscriptions.map((s) => [s.id, s]));
  const rows = new Map();
  const unlinked = { count: 0, total: 0 };
  for (const e of expenses) {
    if (!e?.date || e.date < from || e.date > to) continue;
    const amount = num(amountOf(e));
    if (e.subscriptionId) {
      const sub = byId.get(e.subscriptionId);
      const row = rows.get(e.subscriptionId) || { id: e.subscriptionId, name: sub?.name || 'اشتراک حذف‌شده', count: 0, total: 0, last: '', removed: !sub };
      row.count += 1;
      row.total += amount;
      if (e.date > row.last) row.last = e.date;
      rows.set(e.subscriptionId, row);
    } else if (e.category === SUBSCRIPTION_EXPENSE_CATEGORY) {
      unlinked.count += 1;
      unlinked.total += amount;
    }
  }
  const list = [...rows.values()].sort((a, b) => b.total - a.total);
  const total = list.reduce((sum, r) => sum + r.total, 0) + unlinked.total;
  const count = list.reduce((sum, r) => sum + r.count, 0) + unlinked.count;
  return { rows: list, unlinked, total, count };
}

/**
 * Records summed apart by a key over a range, largest first — the year's excluded categories,
 * each project's spending
 * @template T
 * @param {T[]} records
 * @param {{ dateOf: (r: T) => string, keyOf: (r: T) => string, amountOf: (r: T) => number, range: { from: string, to: string } }} how
 * @returns {Array<{ key: string, total: number, count: number }>}
 */
export function sumApart(records = [], { dateOf, keyOf, amountOf, range }) {
  const byKey = new Map();
  for (const r of records) {
    const date = dateOf(r);
    if (!date || date < range.from || date > range.to) continue;
    const key = keyOf(r);
    const entry = byKey.get(key) || { key, total: 0, count: 0 };
    entry.total += num(amountOf(r));
    entry.count += 1;
    byKey.set(key, entry);
  }
  return [...byKey.values()].sort((a, b) => b.total - a.total);
}
