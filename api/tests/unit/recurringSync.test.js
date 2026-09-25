import { describe, it, expect, vi } from 'vitest';
import { syncRecurringIncomes } from '../../../web/src/features/incomes/utils/recurringSync.js';
import { validateRecurringIncome } from '../../src/domain/recurringIncome.js';

const rule = (overrides = {}) => ({
  id: 'rinc_1',
  ...validateRecurringIncome({ title: 'حقوق', amount: 20000000, category: 'salary', startDate: '2026-07-23', ...overrides }).value,
});

const api = () => {
  let n = 0;
  return {
    createIncome: vi.fn(async (data) => ({ income: { id: `inc_${++n}`, ...data } })),
    updateRule: vi.fn(async (id, data) => ({ rule: { id, ...data } })),
  };
};

describe('creating fixed-income entries', () => {
  it('adds each due month once and advances the rule', async () => {
    const a = api();
    // 2026-07-23 = 1405/05/01 → due 05/01, 06/01, 07/01 by 2026-09-25
    const res = await syncRecurringIncomes({ rules: [rule()], incomes: [], today: '2026-09-25', ...a });
    expect(res.created.map((i) => i.incomeDate)).toEqual(['2026-07-23', '2026-08-23', '2026-09-23']);
    expect(res.created[0]).toMatchObject({ title: 'حقوق', amount: 20000000, recurringId: 'rinc_1', category: 'salary' });
    expect(a.updateRule).toHaveBeenCalledWith('rinc_1', expect.objectContaining({ generatedThrough: '2026-09-23' }));
    expect(res.rules[0].generatedThrough).toBe('2026-09-23');

    // Next run: nothing new
    const again = await syncRecurringIncomes({ rules: res.rules, incomes: res.created, today: '2026-09-25', ...api() });
    expect(again.created).toEqual([]);
  });

  it('never duplicates an entry that already exists, and does not recreate a deleted one', async () => {
    const a = api();
    const existing = [{ id: 'x', recurringId: 'rinc_1', incomeDate: '2026-08-23' }];
    const res = await syncRecurringIncomes({ rules: [rule()], incomes: existing, today: '2026-09-25', ...a });
    expect(res.created.map((i) => i.incomeDate)).toEqual(['2026-07-23', '2026-09-23']);

    // generatedThrough covers a deleted entry: it is not added back
    const b = api();
    const later = await syncRecurringIncomes({ rules: [rule({ generatedThrough: '2026-09-23' })], incomes: [], today: '2026-09-25', ...b });
    expect(later.created).toEqual([]);
    expect(b.updateRule).not.toHaveBeenCalled();
  });

  it('stops a rule at the first failure and continues from there next time', async () => {
    const a = api();
    a.createIncome.mockImplementationOnce(async (d) => ({ income: { id: 'ok', ...d } }))
      .mockImplementationOnce(async () => { throw new Error('offline'); });
    const res = await syncRecurringIncomes({ rules: [rule()], incomes: [], today: '2026-09-25', ...a });
    expect(res.created).toHaveLength(1);
    expect(res.errors[0]).toContain('offline');
    expect(a.updateRule).toHaveBeenCalledWith('rinc_1', expect.objectContaining({ generatedThrough: '2026-07-23' }));
  });

  it('leaves paused rules alone', async () => {
    const a = api();
    const res = await syncRecurringIncomes({ rules: [rule({ active: false })], incomes: [], today: '2026-09-25', ...a });
    expect(res.created).toEqual([]);
    expect(a.createIncome).not.toHaveBeenCalled();
  });
});
