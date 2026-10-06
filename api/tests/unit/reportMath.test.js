/**
 * reportMath.test.js — The reports page's figures: what was invested each month (buys and dated
 * holdings less sells and spends; swaps and loan-funded buys left out), its share of the month's
 * income, and income and expenses in dollars at each one's own day rate
 */
import { describe, it, expect } from 'vitest';
import {
  investmentPoints,
  investmentShareByMonth,
  summarizeInvestmentShare,
  dollarPoints,
  dollarFlowByMonth,
} from '../../../web/src/features/reports/reportMath.js';

// 1405/07/xx is October 2026; 1405/06/xx is September 2026
const MEHR = '2026-10-05';
const SHAHRIVAR = '2026-09-10';

describe('investmentPoints', () => {
  it('counts buys and dated holdings in, sells and spends out; swaps, loans, undated and unpriced not at all', () => {
    const holdings = [
      { buyDate: '1405/07/04', amount: 2, buyPrice: 1000 }, // Shamsi date
      { buyDate: '', amount: 5, buyPrice: 1000 }, // opening balance
      { buyDate: MEHR, amount: 1, buyPrice: 500, loanId: 'loan_1' },
      { buyDate: MEHR, amount: 1, buyPrice: 0 },
    ];
    const transactions = [
      { transactionType: 'buy', transactionDate: MEHR, quantity: 3, unitPrice: 100 },
      { transactionType: 'sell', transactionDate: MEHR, quantity: 1, unitPrice: 400 },
      { type: 'spend', date: MEHR, amount: 2, price: 50 }, // older field names
      { transactionType: 'buy', transactionDate: MEHR, quantity: 1, unitPrice: 999, referenceAssetId: 'usd' },
      { transactionType: 'buy', transactionDate: MEHR, quantity: 1, unitPrice: 777, loanId: 'loan_1' },
    ];
    const points = investmentPoints(holdings, transactions);
    expect(points).toEqual([
      { date: '2026-09-26', amount: 2000, category: 'buy' },
      { date: MEHR, amount: 300, category: 'buy' },
      { date: MEHR, amount: -400, category: 'sell' },
      { date: MEHR, amount: -100, category: 'sell' },
    ]);
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
    const { points, unpriced } = dollarPoints(items, (i) => i.date, (i) => (i.usd === null ? null : { usd: i.usd }));
    expect(points).toEqual([{ date: SHAHRIVAR, amount: 100 }, { date: MEHR, amount: 50 }]);
    expect(unpriced).toBe(1);

    const months = dollarFlowByMonth(points, [{ date: MEHR, amount: 80 }], 1405, { throughMonth: 7 });
    expect(months[5]).toMatchObject({ jm: 6, income: 100, expense: 0, net: 100 });
    expect(months[6]).toMatchObject({ jm: 7, income: 50, expense: 80, net: -30 });
  });
});
