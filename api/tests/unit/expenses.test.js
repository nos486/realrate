// @vitest-environment happy-dom
/**
 * expenses.test.js — expense validation, totals across tomans and dollars, and the encrypted
 * storage of sections and expenses (vault records, the expense's parent being its section)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateExpense, validateExpenseGroup, summarizeExpenses, expenseInToman } from '../../src/domain/expenseDocument.js';

// In-memory stand-in for the vault record endpoints; "encryption" is JSON so records are readable
const records = new Map();
vi.mock('../../../web/src/shared/vault/vaultApi.js', () => ({
  listVaultRecords: vi.fn(async (kind, _options, filters = {}) => ({
    records: [...records.values()].filter((r) => r.kind === kind && (!filters.parent || r.parentId === filters.parent)),
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
  it('normalizes a toman expense and drops a rate it does not need', () => {
    const { value } = validateExpense({ ...base, usdRate: 90000 });
    expect(value).toMatchObject({ currency: 'IRT', usdRate: null, source: 'manual', category: '' });
  });

  it('keeps the day rate of a dollar expense', () => {
    expect(validateExpense({ ...base, currency: 'USD', amount: 12.5, usdRate: '95000' }).value).toMatchObject({ amount: 12.5, usdRate: 95000 });
  });

  it.each([
    [{ groupId: '' }, 'بخش'],
    [{ title: ' ' }, 'عنوان'],
    [{ amount: 0 }, 'مبلغ'],
    [{ date: '1404-07-06' }, 'تاریخ'],
    [{ currency: 'USD', usdRate: -1 }, 'نرخ'],
  ])('rejects %o', (patch, word) => {
    expect(validateExpense({ ...base, ...patch }).error).toContain(word);
  });

  it('requires a section name', () => {
    expect(validateExpenseGroup({ name: '' }).error).toBeTruthy();
    expect(validateExpenseGroup({ name: ' سفر ' }).value).toEqual({ name: 'سفر', type: 'project', notes: '', archived: false });
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
    expect(s).toMatchObject({ count: 3, toman: 1_000_000, usd: 15, totalToman: 1_000_000 + 900_000 + 500_000, usesTodayRate: true, unpricedUsd: 0 });
    expect(s.firstDate).toBe('2026-09-01');
    expect(s.lastDate).toBe('2026-09-20');
  });

  it('leaves dollars with no rate at all out of the toman total, and says how many', () => {
    const s = summarizeExpenses(list, { usdToman: 0 });
    expect(s.totalToman).toBe(1_900_000);
    expect(s.unpricedUsd).toBe(5);
    expect(expenseInToman(list[2], 0)).toBeNull();
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
});
