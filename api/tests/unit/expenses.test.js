// @vitest-environment happy-dom
/**
 * expenses.test.js — expense validation, totals across tomans and dollars, and the encrypted
 * storage of sections and expenses (vault records, the expense's parent being its section)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateExpense, validateExpenseGroup, summarizeExpenses, expenseInToman,
  summarizeByCategory, shamsiMonthRange, shiftShamsiMonth, shamsiMonthOf,
} from '../../src/domain/expenseDocument.js';

// In-memory stand-in for the vault record endpoints; "encryption" is JSON so records are readable
const records = new Map();
vi.mock('../../../web/src/shared/vault/vaultApi.js', () => ({
  listVaultRecords: vi.fn(async (kind, _options, filters = {}) => ({
    records: [...records.values()].filter((r) => r.kind === kind
      && (!filters.parent || r.parentId === filters.parent)
      && (!filters.from || r.recordDate >= filters.from)
      && (!filters.to || r.recordDate <= filters.to)),
  })),
  putVaultRecord: vi.fn(async (kind, id, payload, { recordDate = '', parentId = '' } = {}) => {
    records.set(`${kind}:${id}`, { kind, id, payload, recordDate, parentId });
    return { success: true };
  }),
  deleteVaultRecord: vi.fn(async (kind, id) => {
    records.delete(`${kind}:${id}`);
    return { success: true };
  }),
}));
vi.mock('../../../web/src/shared/vault/vaultStore.js', () => ({
  encryptVaultRecord: vi.fn(async (plain) => `enc:${JSON.stringify(plain)}`),
  decryptVaultRecord: vi.fn(async (payload) => JSON.parse(payload.slice(4))),
}));
vi.mock('../../../web/src/features/demo/index.js', () => ({ isDemoReadOnly: () => false }));

const vaultExpenses = await import('../../../web/src/shared/vault/vaultExpenses.js');

const base = { groupId: 'exg_1', title: 'کاشی', amount: 1000, date: '2026-09-28' };

describe('validateExpense', () => {
  it('normalizes a toman expense', () => {
    expect(validateExpense(base).value).toMatchObject({ currency: 'IRT', source: 'manual', category: '' });
  });

  it('never stores a rate: its day\'s comes from the price history', () => {
    const { value } = validateExpense({ ...base, currency: 'USD', amount: 12.5, usdRate: '95000', rate: 5 });
    expect(value).toMatchObject({ amount: 12.5, currency: 'USD' });
    expect(value).not.toHaveProperty('usdRate');
    expect(value).not.toHaveProperty('rate');
  });

  it.each([
    [{ groupId: '' }, 'بخش'],
    [{ title: ' ' }, 'عنوان'],
    [{ amount: 0 }, 'مبلغ'],
    [{ date: '1404-07-06' }, 'تاریخ'],
  ])('rejects %o', (patch, word) => {
    expect(validateExpense({ ...base, ...patch }).error).toContain(word);
  });

  it('requires a section name', () => {
    expect(validateExpenseGroup({ name: '' }).error).toBeTruthy();
    expect(validateExpenseGroup({ name: ' سفر ' }).value).toEqual({ name: 'سفر', type: 'project', notes: '', archived: false, budget: null, budgets: {} });
  });
});

describe('daily expenses', () => {
  it('keeps a known category and drops an unknown one', () => {
    expect(validateExpense({ ...base, category: 'dining' }).value.category).toBe('dining');
    expect(validateExpense({ ...base, category: 'nope' }).value.category).toBe('');
    expect(validateExpenseGroup({ name: 'روزمره', type: 'daily' }).value.type).toBe('daily');
  });

  it('titles an untitled everyday expense after its category («ثبت سریع», SMS)', () => {
    expect(validateExpense({ ...base, title: '', category: 'dining' }).value.title).toBe('رستوران و کافه');
    expect(validateExpense({ ...base, title: 'شام', category: 'dining' }).value.title).toBe('شام');
    expect(validateExpense({ ...base, title: '' }).error).toContain('عنوان');
  });

  it('totals per category, largest first, uncategorized as other', () => {
    const list = [
      { ...base, category: 'dining', amount: 100 },
      { ...base, category: 'groceries', amount: 500 },
      { ...base, category: 'dining', amount: 50, currency: 'USD', usdRate: 10 },
      { ...base, category: '', amount: 1 },
    ];
    expect(summarizeByCategory(list)).toEqual([
      { category: 'dining', totalToman: 600, count: 2 },
      { category: 'groceries', totalToman: 500, count: 1 },
      { category: 'other', totalToman: 1, count: 1 },
    ]);
  });

  it('maps Shamsi months to Gregorian day ranges', () => {
    expect(shamsiMonthRange(1405, 7)).toEqual({ from: '2026-09-23', to: '2026-10-22', days: 30 });
    expect(shamsiMonthRange(1405, 1).from).toBe('2026-03-21');
    expect(shiftShamsiMonth({ jy: 1405, jm: 1 }, -1)).toEqual({ jy: 1404, jm: 12 });
    expect(shiftShamsiMonth({ jy: 1404, jm: 12 }, 1)).toEqual({ jy: 1405, jm: 1 });
    expect(shamsiMonthOf('2026-09-28')).toEqual({ jy: 1405, jm: 7 });
  });
});

describe('summarizeExpenses', () => {
  const list = [
    { ...base, amount: 1_000_000, currency: 'IRT', date: '2026-09-01' },
    { ...base, amount: 10, currency: 'USD', usdRate: 90_000, date: '2026-09-10' },
    { ...base, amount: 5, currency: 'USD', usdRate: null, date: '2026-09-20' },
  ];

  it('sums per currency and converts dollars at their own rate, else today\'s', () => {
    const s = summarizeExpenses(list, { usdToman: 100_000 });
    expect(s).toMatchObject({ count: 3, toman: 1_000_000, byCurrency: { IRT: 1_000_000, USD: 15 }, totalToman: 1_000_000 + 900_000 + 500_000, usesTodayRate: true, unpriced: {} });
    expect(s.firstDate).toBe('2026-09-01');
    expect(s.lastDate).toBe('2026-09-20');
  });

  it('leaves dollars with no rate at all out of the toman total, and says how many', () => {
    const s = summarizeExpenses(list, { usdToman: 0 });
    expect(s.totalToman).toBe(1_900_000);
    expect(s.unpriced).toEqual({ USD: 5 });
    expect(expenseInToman(list[2], { usdToman: 0 })).toBeNull();
  });
});

describe('encrypted storage', () => {
  beforeEach(() => records.clear());

  it('stores sections and expenses as vault records, the expense under its section and date', async () => {
    const { group } = await vaultExpenses.saveExpenseGroup({ name: 'بازسازی' });
    const { expense } = await vaultExpenses.saveExpense({ ...base, groupId: group.id });
    expect(records.get(`expense:${expense.id}`)).toMatchObject({ parentId: group.id, recordDate: '2026-09-28' });
    expect(records.get(`expense_group:${group.id}`).payload.startsWith('enc:')).toBe(true);

    const updated = await vaultExpenses.saveExpense({ amount: 2000 }, expense);
    expect(updated.expense).toMatchObject({ id: expense.id, amount: 2000, title: 'کاشی', createdAt: expense.createdAt });
    expect((await vaultExpenses.getExpenses()).expenses).toHaveLength(1);
  });

  it('refuses an invalid expense before storing anything', async () => {
    await expect(vaultExpenses.saveExpense({ ...base, amount: -5 })).rejects.toMatchObject({ status: 400 });
    expect(records.size).toBe(0);
  });

  it('deletes a section together with its expenses only', async () => {
    const a = (await vaultExpenses.saveExpenseGroup({ name: 'A' })).group;
    const b = (await vaultExpenses.saveExpenseGroup({ name: 'B' })).group;
    await vaultExpenses.saveExpense({ ...base, groupId: a.id });
    await vaultExpenses.saveExpense({ ...base, groupId: a.id });
    const kept = (await vaultExpenses.saveExpense({ ...base, groupId: b.id })).expense;

    await vaultExpenses.deleteExpenseGroup(a.id);
    expect((await vaultExpenses.getExpenseGroups()).groups.map((g) => g.id)).toEqual([b.id]);
    expect((await vaultExpenses.getExpenses()).expenses.map((e) => e.id)).toEqual([kept.id]);
  });

  it('downloads only one section and one date range when asked', async () => {
    const daily = await vaultExpenses.ensureDailyGroup([]);
    expect(daily.type).toBe('daily');
    await vaultExpenses.saveExpense({ ...base, groupId: daily.id, date: '2026-09-25', category: 'dining' });
    await vaultExpenses.saveExpense({ ...base, groupId: daily.id, date: '2026-08-01', category: 'dining' });
    await vaultExpenses.saveExpense({ ...base, groupId: 'exg_other', date: '2026-09-25' });
    const { expenses } = await vaultExpenses.getExpenses({ parent: daily.id, from: '2026-09-23', to: '2026-10-22' });
    expect(expenses.map((e) => e.date)).toEqual(['2026-09-25']);
    // An existing daily section is reused
    expect((await vaultExpenses.ensureDailyGroup([daily])).id).toBe(daily.id);
  });
});
