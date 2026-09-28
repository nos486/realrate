// @vitest-environment happy-dom
/**
 * accounts.test.js — money accounts (validation, encrypted storage), expenses pointing to one,
 * and expense budgets
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateAccount, compareAccounts } from '../../src/domain/accountDocument.js';
import { validateExpense, validateExpenseGroup, summarizeByAccount } from '../../src/domain/expenseDocument.js';

const records = new Map();
vi.mock('../../../web/src/shared/vault/vaultApi.js', () => ({
  listVaultRecords: vi.fn(async (kind) => ({ records: [...records.values()].filter((r) => r.kind === kind) })),
  putVaultRecord: vi.fn(async (kind, id, payload) => {
    records.set(`${kind}:${id}`, { kind, id, payload });
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

const vaultAccounts = await import('../../../web/src/shared/vault/vaultAccounts.js');

describe('validateAccount', () => {
  it('keeps a bank account\'s bank and card digits (Persian digits too)', () => {
    expect(validateAccount({ name: 'حقوق', type: 'bank', bankId: 'mellat', bankName: 'بانک ملت', cardLast4: '۱۲۳۴' }).value)
      .toMatchObject({ type: 'bank', bankId: 'mellat', cardLast4: '1234', currency: 'IRT' });
  });

  it('drops bank fields from cash and wallets', () => {
    expect(validateAccount({ name: 'کیف پول', type: 'cash', bankId: 'mellat', cardLast4: '1234' }).value)
      .toMatchObject({ type: 'cash', bankId: '', cardLast4: '' });
  });

  it.each([[{ name: '' }, 'نام'], [{ name: 'x', cardLast4: '12' }, '۴ رقم']])('rejects %o', (body, word) => {
    expect(validateAccount(body).error).toContain(word);
  });

  it('lists active accounts first', () => {
    const list = [{ name: 'ب', archived: true }, { name: 'الف' }, { name: 'پ' }].sort(compareAccounts);
    expect(list.map((a) => a.name)).toEqual(['الف', 'پ', 'ب']);
  });
});

describe('expenses with accounts and budgets', () => {
  const base = { groupId: 'exg_1', title: 'x', amount: 100, date: '2026-09-28' };

  it('keeps a well-formed account id on an expense', () => {
    expect(validateExpense({ ...base, accountId: 'acc_1' }).value.accountId).toBe('acc_1');
    expect(validateExpense({ ...base, accountId: '../x' }).value.accountId).toBe('');
  });

  it('totals per account', () => {
    expect(summarizeByAccount([{ ...base, accountId: 'a' }, { ...base, amount: 50 }, { ...base, accountId: 'a' }])).toEqual([
      { accountId: 'a', totalToman: 200, count: 2 },
      { accountId: '', totalToman: 50, count: 1 },
    ]);
  });

  it('keeps a project budget, and the daily section\'s monthly budgets per known category', () => {
    expect(validateExpenseGroup({ name: 'p', budget: '5000' }).value.budget).toBe(5000);
    expect(validateExpenseGroup({ name: 'p', budget: -1 }).error).toBeTruthy();
    const daily = validateExpenseGroup({ name: 'd', type: 'daily', budgets: { total: 900, dining: 100, bogus: 5, groceries: '' } }).value;
    expect(daily.budgets).toEqual({ total: 900, dining: 100 });
    expect(daily.budget).toBeNull();
  });
});

describe('encrypted account storage', () => {
  beforeEach(() => records.clear());

  it('creates, updates and deletes accounts as vault records', async () => {
    const { account } = await vaultAccounts.saveAccount({ name: 'نقد', type: 'cash' });
    expect(account.id).toMatch(/^acc_/);
    expect(records.get(`bank_account:${account.id}`).payload.startsWith('enc:')).toBe(true);

    const { account: archived } = await vaultAccounts.saveAccount({ archived: true }, account);
    expect(archived).toMatchObject({ id: account.id, name: 'نقد', archived: true });
    expect((await vaultAccounts.getAccounts()).accounts).toHaveLength(1);

    await vaultAccounts.deleteAccount(account.id);
    expect((await vaultAccounts.getAccounts()).accounts).toHaveLength(0);
  });

  it('refuses an invalid account', async () => {
    await expect(vaultAccounts.saveAccount({ name: '' })).rejects.toMatchObject({ status: 400 });
    expect(records.size).toBe(0);
  });
});
