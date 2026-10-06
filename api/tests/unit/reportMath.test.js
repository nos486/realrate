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
  investmentBreakdown,
  cashFlowByMonth,
  summarizeCashFlow,
  reportInsights,
} from '../../../web/src/features/reports/reportMath.js';

// 1405/07/xx is October 2026; 1405/06/xx is September 2026
const MEHR = '2026-10-05';
const SHAHRIVAR = '2026-09-10';

describe('what was invested: the expenses recorded as investment', () => {
  const expenses = [
    { date: '2026-09-26', category: 'investment', title: 'خرید طلا', amount: 2000, investedIn: { assetId: 'gold_18k' } },
    { date: MEHR, category: 'investment', title: ' خرید دلار ', amount: 300 },
    { date: MEHR, category: 'investment', title: 'خرید دلار', amount: 200 },
    { date: MEHR, category: 'groceries', title: 'نان', amount: 999 }, // not investment
    { date: MEHR, category: 'investment', title: 'صفر', amount: 0 }, // nothing
    { date: '', category: 'investment', title: 'بی‌تاریخ', amount: 50 },
  ];
  const points = investmentPoints(expenses, (e) => e.amount);

  it('dated points of the investment category, keyed by the asset it went into, else its title', () => {
    expect(points.map(({ date, amount, key }) => ({ date, amount, key }))).toEqual([
      { date: '2026-09-26', amount: 2000, key: 'asset:gold_18k' },
      { date: MEHR, amount: 300, key: 'title:خرید دلار' },
      { date: MEHR, amount: 200, key: 'title:خرید دلار' },
    ]);
  });

  it('what it went into over a period, largest first', () => {
    expect(investmentBreakdown(points, { from: '2026-03-21', to: '2027-03-20' })).toEqual([
      { key: 'asset:gold_18k', assetId: 'gold_18k', title: 'خرید طلا', total: 2000, count: 1 },
      { key: 'title:خرید دلار', assetId: '', title: 'خرید دلار', total: 500, count: 2 },
    ]);
    expect(investmentBreakdown(points, { from: '2026-10-01', to: '2026-10-31' }).map((a) => a.key)).toEqual(['title:خرید دلار']);
  });

  it("each month's share of income; no income → no share", () => {
    const income = [{ date: SHAHRIVAR, amount: 10000 }, { date: MEHR, amount: 20000 }];
    const months = investmentShareByMonth(income, points, 1405, { throughMonth: 8 });
    expect(months).toHaveLength(8);
    expect(months[5]).toMatchObject({ jm: 6, income: 10000, invested: 0, share: 0 });
    expect(months[6]).toMatchObject({ jm: 7, income: 20000, invested: 2500, count: 3, share: 12.5 });
    expect(months[7]).toMatchObject({ jm: 8, income: 0, invested: 0, share: null });
    expect(summarizeInvestmentShare(months)).toEqual({ income: 30000, invested: 2500, count: 3, share: (2500 / 30000) * 100 });
    expect(summarizeInvestmentShare(investmentShareByMonth([], [], 1405)).share).toBeNull();
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
    const ids = reportInsights({ cash, expenseYear, invest: { share: 20, invested: 80 } }).map((i) => i.id);
    expect(ids).toEqual(['best-month', 'negative-months', 'worst-month', 'top-category', 'costly-month', 'invested-share']);
    const top = reportInsights({ cash, expenseYear }).find((i) => i.id === 'top-category');
    expect(top.share).toBeCloseTo((170 / 220) * 100);
    // Nothing to say about an empty year
    expect(reportInsights({ cash: summarizeCashFlow([]) })).toEqual([]);
  });
});
