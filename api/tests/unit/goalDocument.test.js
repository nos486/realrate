/**
 * goalDocument.test.js — Validating a goal and working out where it stands: deposits in any
 * currency at today's rates, a goal in dollars, portfolio assets reserved by quantity or percent
 * (one goal at a time per asset), the monthly amount a date asks for and the estimate from the
 * pace of the last months
 */
import { describe, it, expect } from 'vitest';
import {
  validateGoal, goalProgress, goalTotals, compareGoals, resolveAllocations, assetKey, GOAL_LIMITS,
} from '../../src/domain/goalDocument.js';

const base = { name: 'خانه', targetAmount: 1_200_000_000, icon: 'Home' };
const rates = { usdToman: 100_000 };

describe('validateGoal', () => {
  it('needs a name and a positive target, in tomans unless said', () => {
    expect(validateGoal({ ...base, name: ' ' }).error).toBeTruthy();
    expect(validateGoal({ ...base, targetAmount: 0 }).error).toBeTruthy();
    expect(validateGoal({ ...base, targetAmount: GOAL_LIMITS.maxAmount + 1 }).error).toBeTruthy();
    expect(validateGoal(base).value).toMatchObject({ name: 'خانه', icon: 'Home', currency: 'IRT', targetDate: '', deposits: [], allocations: [] });
  });

  it('takes a dollar target with cents and drops the old portfolio link', () => {
    const { value } = validateGoal({ name: 'اسپرسوساز', targetAmount: 299.999, currency: 'USD', portfolioId: 'pf_1' });
    expect(value).toMatchObject({ currency: 'USD', targetAmount: 300 });
    expect(value.portfolioId).toBeUndefined();
    expect(validateGoal({ ...base, currency: 'XXX' }).value.currency).toBe('IRT');
  });

  it('keeps a valid date and falls back to a known icon', () => {
    expect(validateGoal({ ...base, targetDate: '2027-03-01', icon: 'Nope' }).value).toMatchObject({ targetDate: '2027-03-01', icon: 'PiggyBank' });
    expect(validateGoal({ ...base, targetDate: '2027-13-01' }).error).toBeTruthy();
  });

  it('checks deposits, gives each a currency, orders them by day and keeps ids unique', () => {
    const { value } = validateGoal({
      ...base,
      deposits: [
        { id: 'a', date: '2026-02-01', amount: 100, currency: 'USD' },
        { id: 'a', date: '2026-01-01', amount: -20, note: 'x' },
      ],
    });
    expect(value.deposits.map((d) => d.date)).toEqual(['2026-01-01', '2026-02-01']);
    expect(value.deposits.map((d) => d.currency)).toEqual(['IRT', 'USD']);
    expect(new Set(value.deposits.map((d) => d.id)).size).toBe(2);
    expect(validateGoal({ ...base, deposits: [{ id: 'a', date: '2026-01-01', amount: 0 }] }).error).toBeTruthy();
    expect(validateGoal({ ...base, deposits: [{ id: 'a', date: 'soon', amount: 5 }] }).error).toBeTruthy();
  });

  it('checks allocations: an asset of a portfolio, a quantity or a percent up to 100', () => {
    const alloc = { id: 'x', portfolioId: 'pf_1', assetId: 'gold18', assetName: 'طلا', unit: 'گرم', mode: 'amount', value: 2, date: '2026-05-01' };
    expect(validateGoal({ ...base, allocations: [alloc] }).value.allocations[0]).toMatchObject({ assetId: 'gold18', mode: 'amount', value: 2 });
    expect(validateGoal({ ...base, allocations: [{ ...alloc, mode: 'percent', value: 101 }] }).error).toBeTruthy();
    expect(validateGoal({ ...base, allocations: [{ ...alloc, value: 0 }] }).error).toBeTruthy();
    expect(validateGoal({ ...base, allocations: [{ ...alloc, portfolioId: '' }] }).error).toBeTruthy();
    expect(validateGoal({ ...base, allocations: [{ ...alloc, mode: 'weird' }] }).value.allocations[0].mode).toBe('amount');
  });
});

describe('resolveAllocations', () => {
  const assets = new Map([[assetKey('pf_1', 'gold18'), { amount: 10, unitPrice: 5_000_000 }]]);
  const alloc = (id, mode, value) => ({ id, date: '2026-05-01', portfolioId: 'pf_1', assetId: 'gold18', mode, value });

  it('values a quantity or a percent of the held amount at the asset price', () => {
    const goals = [{ id: 'g1', createdAt: '1', allocations: [alloc('a', 'amount', 2), alloc('b', 'percent', 25)] }];
    const { byGoal, leftOf } = resolveAllocations(goals, assets);
    expect(byGoal.get('g1').map((a) => a.quantity)).toEqual([2, 2.5]);
    expect(byGoal.get('g1')[0].toman).toBe(10_000_000);
    expect(leftOf('pf_1', 'gold18')).toBe(5.5);
  });

  it('gives an asset to one goal at a time, the older goal first, the later one what is left', () => {
    const goals = [
      { id: 'late', createdAt: '2', allocations: [alloc('b', 'amount', 6)] },
      { id: 'early', createdAt: '1', allocations: [alloc('a', 'percent', 70)] },
    ];
    const { byGoal, leftOf } = resolveAllocations(goals, assets);
    expect(byGoal.get('early')[0].quantity).toBe(7);
    expect(byGoal.get('late')[0].quantity).toBe(3);
    expect(leftOf('pf_1', 'gold18')).toBe(0);
  });

  it('counts an asset the portfolio no longer holds as nothing', () => {
    const goals = [{ id: 'g1', createdAt: '1', allocations: [{ ...alloc('a', 'amount', 1), assetId: 'gone' }] }];
    expect(resolveAllocations(goals, assets).byGoal.get('g1')[0]).toMatchObject({ missing: true, toman: 0 });
  });
});

describe('goalProgress', () => {
  const today = '2026-06-01';
  const goal = (extra = {}) => ({ ...base, targetAmount: 1000, deposits: [], allocations: [], ...extra });
  const dep = (date, amount, currency = 'IRT') => ({ date, amount, currency });

  it('adds the deposits and subtracts withdrawals', () => {
    const p = goalProgress(goal({ deposits: [dep('2026-05-01', 400), dep('2026-05-10', -100)] }), { today });
    expect(p).toMatchObject({ deposited: 300, saved: 300, remaining: 700, pct: 30, reached: false });
  });

  it('counts the resolved allocations too', () => {
    const p = goalProgress(goal(), { today, allocations: [{ date: '2026-05-01', toman: 500 }] });
    expect(p).toMatchObject({ allocated: 500, saved: 500, pct: 50 });
  });

  it('mixes tomans and dollars toward a dollar goal at today\'s rate', () => {
    // 300 dollar goal: 2.5M tomans (25 USD) + 100 USD + 2 g of gold worth 1.5M tomans (15 USD)
    const g = { ...base, currency: 'USD', targetAmount: 300, deposits: [dep('2026-05-01', 2_500_000), dep('2026-05-02', 100, 'USD')], allocations: [] };
    const p = goalProgress(g, { today, rates, allocations: [{ date: '2026-05-03', toman: 1_500_000 }] });
    expect(p.saved).toBeCloseTo(140);
    expect(p.remaining).toBeCloseTo(160);
    expect(p.pct).toBe(47);
    expect(p.targetToman).toBe(30_000_000);
  });

  it('shows nothing against a target whose currency has no rate', () => {
    const p = goalProgress({ ...goal(), currency: 'EUR', targetAmount: 100 }, { today, rates });
    expect(p).toMatchObject({ unpriced: true, saved: 0, reached: false, eta: null });
  });

  it('is reached at the target and the percent never passes 100', () => {
    const p = goalProgress(goal({ deposits: [dep('2026-05-01', 1500)] }), { today });
    expect(p).toMatchObject({ reached: true, pct: 100, remaining: 0, monthlyNeeded: null, eta: null, onTrack: null });
  });

  it('says what to set aside each month to meet the date', () => {
    // 90 days left = 3 months: 900 remaining → 300 a month
    const p = goalProgress(goal({ targetDate: '2026-08-30', deposits: [dep('2026-05-30', 100)] }), { today });
    expect(p.daysLeft).toBe(90);
    expect(p.monthlyNeeded).toBe(300);
    expect(goalProgress(goal({ targetDate: '2026-05-01' }), { today })).toMatchObject({ overdue: true, monthlyNeeded: null });
  });

  it('estimates the day it is reached from the last 90 days', () => {
    // 300 over 90 days = 100 a month; 700 remaining → 7 months (210 days) → 2026-12-28
    const g = goal({ deposits: [dep('2026-04-01', 300), dep('2025-01-01', 1)], targetDate: '2026-11-01' });
    const p = goalProgress(g, { today });
    expect(p.monthlyPace).toBe(100);
    expect(p.eta).toBe('2026-12-28');
    expect(p.onTrack).toBe(false);
    expect(goalProgress({ ...g, targetDate: '2027-02-01' }, { today }).onTrack).toBe(true);
  });

  it('gives no estimate without recent deposits', () => {
    expect(goalProgress(goal({ deposits: [dep('2025-01-01', 100)] }), { today })).toMatchObject({ monthlyPace: 0, eta: null });
  });
});

describe('goalTotals and compareGoals', () => {
  const today = '2026-06-01';
  const goals = [
    { id: 'a', name: 'a', targetAmount: 1000, deposits: [{ date: '2026-05-01', amount: 2000, currency: 'IRT' }], targetDate: '2026-07-01', createdAt: '1' },
    { id: 'b', name: 'b', targetAmount: 1000, deposits: [{ date: '2026-05-01', amount: 250, currency: 'IRT' }], targetDate: '2026-09-01', createdAt: '2' },
    { id: 'c', name: 'c', targetAmount: 1000, deposits: [], createdAt: '3' },
  ];
  const progressOf = (g) => goalProgress(g, { today });

  it('counts at most each goal\'s target as saved, in tomans', () => {
    expect(goalTotals(goals, progressOf)).toEqual({ count: 3, reached: 1, saved: 1250, target: 3000, pct: 42 });
  });

  it('lists the nearest day first, no day after, reached last', () => {
    expect([...goals].sort(compareGoals(progressOf)).map((g) => g.id)).toEqual(['b', 'c', 'a']);
  });
});
