import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateRecurringIncome,
  dueOccurrences,
  nextOccurrence,
  shamsiDayOf,
  isRecurringId,
} from '../../src/domain/recurringIncome.js';

// 2026-09-23 = 1405/07/01, 2026-09-22 = 1405/06/31
const rule = (overrides = {}) => validateRecurringIncome({
  title: 'حقوق',
  category: 'salary',
  amount: 20000000,
  startDate: '2026-03-21', // 1405/01/01
  ...overrides,
}).value;

describe('fixed income rules', () => {
  it('normalizes a rule and takes the day from the start date', () => {
    expect(rule()).toMatchObject({ dayOfMonth: 1, intervalMonths: 1, active: true, endDate: '', generatedThrough: '' });
    expect(shamsiDayOf('2026-09-22')).toBe(31);
  });

  it.each([
    ['no title', { title: ' ' }],
    ['zero amount', { amount: 0 }],
    ['bad start', { startDate: '1405-01-01' }],
    ['end before start', { endDate: '2026-01-01' }],
    ['odd interval', { intervalMonths: 5 }],
    ['day 32', { dayOfMonth: 32 }],
  ])('rejects %s', (_l, patch) => {
    expect(validateRecurringIncome({ title: 'x', amount: 1, startDate: '2026-03-21', ...patch }).error).toBeTruthy();
  });

  it('lists every month due so far, then only new ones after generatedThrough', () => {
    const r = rule();
    const due = dueOccurrences(r, '2026-09-25'); // up to 1405/07/03
    expect(due).toHaveLength(7); // Farvardin..Mehr 1405
    expect(due[0]).toBe('2026-03-21');
    expect(due.at(-1)).toBe('2026-09-23');
    expect(dueOccurrences({ ...r, generatedThrough: '2026-09-23' }, '2026-09-25')).toEqual([]);
    expect(dueOccurrences({ ...r, generatedThrough: '2026-08-23' }, '2026-09-25')).toEqual(['2026-09-23']);
  });

  it('clamps day 31 to 30-day months and skips a start-month day before the start', () => {
    const r = rule({ startDate: '2026-09-01', dayOfMonth: 31 }); // 1405/06/10, pays on the 31st
    const due = dueOccurrences(r, '2026-12-31');
    // 1405/06/31 (2026-09-22), 1405/07/30 (2026-10-22), 1405/08/30 (2026-11-21), 1405/09/30 (2026-12-21)
    expect(due).toEqual(['2026-09-22', '2026-10-22', '2026-11-21', '2026-12-21']);
  });

  it('respects the interval, the end date and a paused rule', () => {
    expect(dueOccurrences(rule({ intervalMonths: 3 }), '2026-09-25')).toEqual(['2026-03-21', '2026-06-22', '2026-09-23']);
    expect(dueOccurrences(rule({ endDate: '2026-05-01' }), '2026-09-25')).toEqual(['2026-03-21', '2026-04-21']);
    expect(dueOccurrences(rule({ active: false }), '2026-09-25')).toEqual([]);
    expect(nextOccurrence(rule(), '2026-09-25')).toBe('2026-10-23');
    expect(nextOccurrence(rule({ active: false }), '2026-09-25')).toBeNull();
  });

  it('caps a long catch-up', () => {
    expect(dueOccurrences(rule({ startDate: '2015-01-01' }), '2026-09-25')).toHaveLength(36);
  });

  it('accepts only simple ids on income entries', () => {
    expect(isRecurringId('')).toBe(true);
    expect(isRecurringId('rinc_abc123')).toBe(true);
    expect(isRecurringId('x; drop')).toBe(false);
  });
});

vi.mock('../../src/lib/auth.js', () => ({ getAuthenticatedUser: vi.fn(async () => ({ userId: 'u1' })) }));
vi.mock('../../src/repositories/index.js', () => ({
  dbGetUserRecurringIncomes: vi.fn(async () => []),
  dbCreateRecurringIncome: vi.fn(async (_e, _u, data) => ({ id: 'rinc_1', ...data })),
  dbUpdateRecurringIncome: vi.fn(async () => null),
  dbDeleteRecurringIncome: vi.fn(async () => true),
}));

const { handleCreateRecurringIncome, handleUpdateRecurringIncome } = await import('../../src/handlers/recurringIncomeRoutes.js');
const repo = await import('../../src/repositories/index.js');

describe('fixed income routes', () => {
  beforeEach(() => vi.clearAllMocks());
  const req = (method, body) => new Request('https://api.realrate.ir/api/incomes/recurring', {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  it('creates a validated rule', async () => {
    const res = await handleCreateRecurringIncome(req('POST', { title: 'اجاره', amount: 8000000, startDate: '2026-09-23', category: 'rental' }), {});
    expect(res.status).toBe(201);
    expect(repo.dbCreateRecurringIncome.mock.calls[0][2]).toMatchObject({ dayOfMonth: 1, intervalMonths: 1, active: true });
    await expect(handleCreateRecurringIncome(req('POST', { title: '', amount: 1, startDate: '2026-09-23' }), {})).rejects.toMatchObject({ statusCode: 400 });
  });

  it('404s for a rule of someone else', async () => {
    await expect(handleUpdateRecurringIncome(req('PUT', { title: 'x', amount: 1, startDate: '2026-09-23' }), {}, { ruleId: 'rinc_x' }))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});
