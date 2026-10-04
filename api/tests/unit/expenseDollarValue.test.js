/**
 * expenseDollarValue.test.js — a project's toman expense with the dollar's rate on its day: what
 * it was in dollars, and what that costs at today's rate
 */
import { describe, it, expect } from 'vitest';
import { validateExpense, expenseDollarValue, summarizeDollarValue, expenseInToman, expenseDayRate, summarizeExpenses } from '../../src/domain/expenseDocument.js';

const base = { groupId: 'exg_1', title: 'کاشی', amount: 50_000_000, currency: 'IRT', date: '2026-01-10' };

describe('the day\'s dollar rate on a toman expense', () => {
  it('is kept (optional), and does not change the toman amount', () => {
    const { value } = validateExpense({ ...base, usdRate: 100_000 });
    expect(value.usdRate).toBe(100_000);
    expect(expenseInToman(value)).toBe(50_000_000);
    expect(validateExpense({ ...base, usdRate: '' }).value.usdRate).toBeNull();
    expect(validateExpense({ ...base, usdRate: -5 }).error).toBeTruthy();
  });

  it('gives the dollars then and the tomans today', () => {
    expect(expenseDollarValue({ ...base, usdRate: 100_000 }, 125_000)).toEqual({ usd: 500, paidToman: 50_000_000, todayToman: 62_500_000, changePct: 25 });
    // Without today's rate: dollars only
    expect(expenseDollarValue({ ...base, usdRate: 100_000 }, 0)).toMatchObject({ usd: 500, todayToman: null, changePct: null });
    // Without the day's rate: nothing to say
    expect(expenseDollarValue(base, 125_000)).toBeNull();
    // A shared expense: the user's own part
    expect(expenseDollarValue({ ...base, myShare: 20_000_000, usdRate: 100_000 }, 100_000).usd).toBe(200);
    // A dollar expense is already in dollars
    expect(expenseDollarValue({ ...base, currency: 'USD', amount: 300, usdRate: 90_000 }, 100_000)).toMatchObject({ usd: 300, paidToman: 27_000_000, todayToman: 30_000_000 });
  });

  it('sums a project, counting the expenses without a rate apart', () => {
    const s = summarizeDollarValue([
      { ...base, usdRate: 100_000 },
      { ...base, amount: 10_000_000, usdRate: 50_000 },
      { ...base, amount: 7_000_000 },
    ], { usdToman: 100_000 });
    expect(s).toMatchObject({ usd: 700, paidToman: 60_000_000, todayToman: 70_000_000, counted: 2, missing: 1 });
    expect(Math.round(s.changePct * 10) / 10).toBe(16.7);
  });
});

describe("the day's rate from the price history (usdAt)", () => {
  const usdAt = (day) => ({ '2026-01-10': 80_000, '2026-01-11': 90_000 })[day] ?? null;

  it('values a toman expense without a rate of its own at its day\'s rate', () => {
    const value = expenseDollarValue(base, 125_000, usdAt);
    expect(value.usd).toBeCloseTo(625);
    expect(value.todayToman).toBeCloseTo(625 * 125_000);
  });

  it("a rate of the expense's own wins over the history", () => {
    expect(expenseDayRate({ ...base, usdRate: 100_000 }, usdAt)).toBe(100_000);
    expect(expenseDayRate(base, usdAt)).toBe(80_000);
    expect(expenseDayRate({ ...base, date: '2025-01-01' }, usdAt)).toBe(0);
    expect(expenseDayRate(base)).toBe(0);
  });

  it("converts a dollar expense at its day's rate, today's only when the day is unknown", () => {
    const usd = { ...base, currency: 'USD', amount: 10, date: '2026-01-11' };
    expect(expenseInToman(usd, 125_000, usdAt)).toBe(900_000);
    expect(expenseInToman({ ...usd, date: '2020-01-01' }, 125_000, usdAt)).toBe(1_250_000);
    const summary = summarizeExpenses([usd], { usdToman: 125_000, usdAt });
    expect(summary).toMatchObject({ totalToman: 900_000, usesTodayRate: false });
  });

  it("a project's dollar view counts every expense whose day is in the history", () => {
    const list = [base, { ...base, date: '2026-01-11', amount: 9_000_000 }, { ...base, date: '2019-01-01' }];
    const view = summarizeDollarValue(list, { usdToman: 100_000, usdAt });
    expect(view).toMatchObject({ counted: 2, missing: 1 });
    expect(view.usd).toBeCloseTo(625 + 100);
  });
});
