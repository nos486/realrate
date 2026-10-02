/**
 * expenseDollarValue.test.js — a project's toman expense with the dollar's rate on its day: what
 * it was in dollars, and what that costs at today's rate
 */
import { describe, it, expect } from 'vitest';
import { validateExpense, expenseDollarValue, summarizeDollarValue, expenseInToman } from '../../src/domain/expenseDocument.js';

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
