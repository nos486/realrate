/**
 * goalDocument.test.js — Validating a goal and working out where it stands: the deposits' net, a
 * linked portfolio's value, the monthly amount a date asks for and the estimate from the pace of
 * the last months
 */
import { describe, it, expect } from 'vitest';
import { validateGoal, goalProgress, goalTotals, compareGoals, GOAL_LIMITS } from '../../src/domain/goalDocument.js';

const base = { name: 'خانه', targetAmount: 1_200_000_000, icon: 'Home' };

describe('validateGoal', () => {
  it('needs a name and a positive target', () => {
    expect(validateGoal({ ...base, name: ' ' }).error).toBeTruthy();
    expect(validateGoal({ ...base, targetAmount: 0 }).error).toBeTruthy();
    expect(validateGoal({ ...base, targetAmount: GOAL_LIMITS.maxAmount + 1 }).error).toBeTruthy();
    expect(validateGoal(base).value).toMatchObject({ name: 'خانه', icon: 'Home', targetDate: '', portfolioId: '', deposits: [] });
  });

  it('keeps a valid date and falls back to a known icon', () => {
    expect(validateGoal({ ...base, targetDate: '2027-03-01', icon: 'Nope' }).value).toMatchObject({ targetDate: '2027-03-01', icon: 'PiggyBank' });
    expect(validateGoal({ ...base, targetDate: '2027-13-01' }).error).toBeTruthy();
  });

  it('checks deposits, orders them by day and gives repeated ids a unique one', () => {
    const { value } = validateGoal({
      ...base,
      deposits: [
        { id: 'a', date: '2026-02-01', amount: 100 },
        { id: 'a', date: '2026-01-01', amount: -20, note: 'x' },
      ],
    });
    expect(value.deposits.map((d) => d.date)).toEqual(['2026-01-01', '2026-02-01']);
    expect(new Set(value.deposits.map((d) => d.id)).size).toBe(2);
    expect(validateGoal({ ...base, deposits: [{ id: 'a', date: '2026-01-01', amount: 0 }] }).error).toBeTruthy();
    expect(validateGoal({ ...base, deposits: [{ id: 'a', date: 'soon', amount: 5 }] }).error).toBeTruthy();
  });
});

describe('goalProgress', () => {
  const today = '2026-06-01';
  const goal = (extra = {}) => ({ ...base, targetAmount: 1000, deposits: [], ...extra });

  it('adds the deposits and subtracts withdrawals', () => {
    const p = goalProgress(goal({ deposits: [{ date: '2026-05-01', amount: 400 }, { date: '2026-05-10', amount: -100 }] }), { today });
    expect(p).toMatchObject({ deposited: 300, saved: 300, remaining: 700, pct: 30, reached: false });
  });

  it('counts a linked portfolio only when the goal links one', () => {
    expect(goalProgress(goal(), { today, portfolioValue: 500 }).saved).toBe(0);
    const p = goalProgress(goal({ portfolioId: 'p1' }), { today, portfolioValue: 500 });
    expect(p).toMatchObject({ linked: 500, saved: 500, pct: 50 });
  });

  it('is reached at the target and the percent never passes 100', () => {
    const p = goalProgress(goal({ deposits: [{ date: '2026-05-01', amount: 1500 }] }), { today });
    expect(p).toMatchObject({ reached: true, pct: 100, remaining: 0, monthlyNeeded: null, eta: null, onTrack: null });
  });

  it('says what to set aside each month to meet the date', () => {
    // 90 days left = 3 months: 900 remaining → 300 a month
    const p = goalProgress(goal({ targetDate: '2026-08-30', deposits: [{ date: '2026-05-30', amount: 100 }] }), { today });
    expect(p.daysLeft).toBe(90);
    expect(p.monthlyNeeded).toBe(300);
    expect(goalProgress(goal({ targetDate: '2026-05-01' }), { today })).toMatchObject({ overdue: true, monthlyNeeded: null });
  });

  it('estimates the day it is reached from the last 90 days of deposits', () => {
    // 300 over 90 days = 100 a month; 700 remaining → 7 months (210 days) → 2026-12-28
    const g = goal({ deposits: [{ date: '2026-04-01', amount: 300 }, { date: '2025-01-01', amount: 0.4 }], targetDate: '2026-11-01' });
    const p = goalProgress(g, { today });
    expect(p.monthlyPace).toBe(100);
    expect(p.eta).toBe('2026-12-28');
    expect(p.onTrack).toBe(false);
    expect(goalProgress({ ...g, targetDate: '2027-02-01' }, { today }).onTrack).toBe(true);
  });

  it('gives no estimate without recent deposits', () => {
    const p = goalProgress(goal({ deposits: [{ date: '2025-01-01', amount: 100 }] }), { today });
    expect(p).toMatchObject({ monthlyPace: 0, eta: null });
  });
});

describe('goalTotals and compareGoals', () => {
  const today = '2026-06-01';
  const goals = [
    { id: 'a', name: 'a', targetAmount: 1000, deposits: [{ date: '2026-05-01', amount: 2000 }], targetDate: '2026-07-01', createdAt: '1' },
    { id: 'b', name: 'b', targetAmount: 1000, deposits: [{ date: '2026-05-01', amount: 250 }], targetDate: '2026-09-01', createdAt: '2' },
    { id: 'c', name: 'c', targetAmount: 1000, deposits: [], createdAt: '3' },
  ];
  const progressOf = (g) => goalProgress(g, { today });

  it('counts at most each goal\'s target as saved', () => {
    expect(goalTotals(goals, progressOf)).toEqual({ count: 3, reached: 1, saved: 1250, target: 3000, pct: 42 });
  });

  it('lists the nearest day first, no day after, reached last', () => {
    expect([...goals].sort(compareGoals(progressOf)).map((g) => g.id)).toEqual(['b', 'c', 'a']);
  });
});
