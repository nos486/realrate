/**
 * reportMath.test.js — The reports page's figures: what was invested each month (buys and dated
 * holdings less sells and spends; swaps and loan-funded buys left out), its share of the month's
 * income, and income and expenses in dollars at each one's own day rate
 */
import { describe, it, expect } from 'vitest';
import { buildYearSeries } from '../../../web/src/shared/flow/flowYear.js';
import {
  investmentPoints,
  investmentShareByMonth,
  summarizeInvestmentShare,
  dollarPoints,
  dollarFlowByMonth,
  investmentByAsset,
  cashFlowByMonth,
  summarizeCashFlow,
  reportInsights,
} from '../../../web/src/features/reports/reportMath.js';

// 1405/07/xx is October 2026; 1405/06/xx is September 2026
const MEHR = '2026-10-05';
const SHAHRIVAR = '2026-09-10';

describe('investmentPoints', () => {
  it('counts buys and dated holdings in, sells and spends out; swaps, loans, undated and unpriced not at all', () => {
    const holdings = [
      { buyDate: '1405/07/04', amount: 2, buyPrice: 1000, assetId: 'gold_18k' }, // Shamsi date
      { buyDate: '', amount: 5, buyPrice: 1000 }, // opening balance
      { buyDate: MEHR, amount: 1, buyPrice: 500, loanId: 'loan_1' },
      { buyDate: MEHR, amount: 1, buyPrice: 0 },
    ];
    const transactions = [
      { transactionType: 'buy', transactionDate: MEHR, quantity: 3, unitPrice: 100, assetId: 'usd' },
      { transactionType: 'sell', transactionDate: MEHR, quantity: 1, unitPrice: 400, assetId: 'usd' },
      { type: 'spend', date: MEHR, amount: 2, price: 50, symbol: 'usd' }, // older field names
      { transactionType: 'buy', transactionDate: MEHR, quantity: 1, unitPrice: 999, referenceAssetId: 'usd' },
      { transactionType: 'buy', transactionDate: MEHR, quantity: 1, unitPrice: 777, loanId: 'loan_1' },
    ];
    const points = investmentPoints(holdings, transactions);
    expect(points.map(({ date, amount, category, assetId }) => ({ date, amount, category, assetId }))).toEqual([
      { date: '2026-09-26', amount: 2000, category: 'buy', assetId: 'gold_18k' },
      { date: MEHR, amount: 300, category: 'buy', assetId: 'usd' },
      { date: MEHR, amount: -400, category: 'sell', assetId: 'usd' },
      { date: MEHR, amount: -100, category: 'sell', assetId: 'usd' },
    ]);

    // By asset over the year: largest buy first
    expect(investmentByAsset(points, { from: '2026-03-21', to: '2027-03-20' })).toEqual([
      { assetId: 'gold_18k', assetName: '', bought: 2000, sold: 0, net: 2000 },
      { assetId: 'usd', assetName: '', bought: 300, sold: 500, net: -200 },
    ]);
    expect(investmentByAsset(points, { from: '2026-10-01', to: '2026-10-31' }).map((a) => a.assetId)).toEqual(['usd']);
  });
});

describe('investmentShareByMonth', () => {
  it("gives each month's income, bought, sold, net and its share; no income → no share", () => {
    const income = [{ date: SHAHRIVAR, amount: 10000 }, { date: MEHR, amount: 20000 }];
    const invest = [
      { date: SHAHRIVAR, amount: 3000, category: 'buy' },
      { date: MEHR, amount: 8000, category: 'buy' },
      { date: MEHR, amount: -2000, category: 'sell' },
      { date: '2026-11-01', amount: 500, category: 'buy' }, // Aban: no income
    ];
    const months = investmentShareByMonth(income, invest, 1405, { throughMonth: 8 });
    expect(months).toHaveLength(8);
    const [shahrivar, mehr, aban] = months.slice(5);
    expect(shahrivar).toMatchObject({ jm: 6, income: 10000, bought: 3000, sold: 0, net: 3000, share: 30 });
    expect(mehr).toMatchObject({ jm: 7, income: 20000, bought: 8000, sold: 2000, net: 6000, share: 30 });
    expect(aban).toMatchObject({ jm: 8, income: 0, net: 500, share: null });
    expect(months[0].share).toBeNull();

    expect(summarizeInvestmentShare(months)).toEqual({ income: 30000, bought: 11500, sold: 2000, net: 9500, share: (9500 / 30000) * 100 });
    expect(summarizeInvestmentShare(investmentShareByMonth([], [], 1405)).share).toBeNull();
  });

  it('a month that sold more than it bought has a negative share', () => {
    const [m] = investmentShareByMonth([{ date: MEHR, amount: 1000 }], [{ date: MEHR, amount: -500, category: 'sell' }], 1405, { throughMonth: 7 }).slice(6);
    expect(m).toMatchObject({ net: -500, share: -50 });
  });
});

describe('dollars', () => {
  it('each item at its own day rate; one without a rate is counted apart, not at today\'s', () => {
    const items = [
      { date: SHAHRIVAR, usd: 100 },
      { date: MEHR, usd: 50 },
      { date: MEHR, usd: null }, // no rate known
      { date: MEHR, usd: 0 }, // nothing
    ];
    const { points, unpriced, missing } = dollarPoints(items, (i) => i.date, (i) => (i.usd === null ? null : { usd: i.usd }));
    expect(points).toEqual([{ date: SHAHRIVAR, amount: 100 }, { date: MEHR, amount: 50 }]);
    expect(unpriced).toBe(1);

    const months = dollarFlowByMonth(points, [{ date: MEHR, amount: 80 }], 1405, { throughMonth: 7, missing });
    expect(months[5]).toMatchObject({ jm: 6, income: 100, expense: 0, net: 100, unpriced: 0 });
    // Each month says what it left out for want of a rate
    expect(months[6]).toMatchObject({ jm: 7, income: 50, expense: 80, net: -30, unpriced: 1 });
  });
});

describe('cash flow', () => {
  const income = buildYearSeries([
    { date: '2026-04-25', amount: 100 }, { date: SHAHRIVAR, amount: 100 }, { date: MEHR, amount: 200 },
  ], 1405, { throughMonth: 7 });
  const expense = buildYearSeries([
    { date: '2026-04-25', amount: 40, category: 'housing' }, { date: SHAHRIVAR, amount: 130, category: 'housing' }, { date: MEHR, amount: 50, category: 'dining' },
  ], 1405, { throughMonth: 7 });
  const months = cashFlowByMonth(income, expense);

  it('month by month: what was left and the savings rate (none without income)', () => {
    expect(months).toHaveLength(7);
    expect(months[1]).toMatchObject({ jm: 2, income: 100, expense: 40, net: 60, savingsRate: 60 });
    expect(months[5]).toMatchObject({ jm: 6, net: -30, savingsRate: -30 });
    expect(months[0]).toMatchObject({ income: 0, expense: 0, net: 0, savingsRate: null });
  });

  it('the year: totals, rate, average over active months, negative months, best and worst', () => {
    const cash = summarizeCashFlow(months);
    expect(cash).toMatchObject({ income: 400, expense: 220, net: 180, savingsRate: 45, months: 3, monthlyNet: 60, negativeMonths: 1 });
    expect(cash.best.jm).toBe(7);
    expect(cash.worst.jm).toBe(6);
    expect(summarizeCashFlow([])).toMatchObject({ savingsRate: null, best: null, worst: null, monthlyNet: 0 });
  });

  it('insights: only what the data holds', () => {
    const cash = summarizeCashFlow(months);
    const expenseYear = { total: 220, monthlyAverage: 220 / 7, top: { label: 'شهریور ۱۴۰۵', total: 130 }, byCategory: [{ category: 'housing', total: 170 }, { category: 'dining', total: 50 }] };
    const ids = reportInsights({ cash, expenseYear, invest: { share: 20, net: 80 } }).map((i) => i.id);
    expect(ids).toEqual(['best-month', 'negative-months', 'worst-month', 'top-category', 'costly-month', 'invested-share']);
    const top = reportInsights({ cash, expenseYear }).find((i) => i.id === 'top-category');
    expect(top.share).toBeCloseTo((170 / 220) * 100);
    // Nothing to say about an empty year
    expect(reportInsights({ cash: summarizeCashFlow([]) })).toEqual([]);
  });
});
