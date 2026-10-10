/**
 * storedData.test.js — What is stored and exported is only what was recorded: the rates older
 * expenses stored are dropped from the store (once, dropStoredRates; and on every save or move),
 * and the expense CSV holds the expense's own fields — nothing computed from a rate — and reads back
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const vault = vi.hoisted(() => ({ batches: [], expenses: [] }));
vi.mock('../../../web/src/shared/vault/vaultApi.js', () => ({
  VAULT_BATCH_MAX: 100,
  putVaultRecords: vi.fn(async (kind, records) => { vault.batches.push({ kind, records }); return { records }; }),
  listVaultRecords: vi.fn(async (kind) => ({
    records: kind === 'expense' ? vault.expenses.map((e) => ({ id: e.id, payload: JSON.stringify(e) })) : [],
  })),
  deleteVaultRecord: vi.fn(),
}));
vi.mock('../../../web/src/shared/vault/vaultRecordMeta.js', () => ({ putRecord: vi.fn(), recordDateOf: (kind, e) => e.date }));
vi.mock('../../../web/src/shared/vault/vaultStore.js', () => ({
  encryptVaultRecord: vi.fn(async (v) => JSON.stringify(v)),
  decryptVaultRecord: vi.fn(async (p) => JSON.parse(p)),
}));
vi.mock('../../../web/src/features/portfolio/components/ShamsiDatePicker.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  formatShamsiDisplay: (iso) => iso.slice(0, 10),
}));
vi.mock('../../../web/src/features/accounts/constants/accountDisplay.js', () => ({ accountLabel: (a) => a?.name || 'حساب حذف‌شده' }));
vi.mock('../../../web/src/features/expenses/constants/expenseCategories.js', () => ({ getExpenseCategory: (c) => ({ label: c }) }));

const { dropStoredRates, moveExpenses } = await import('../../../web/src/shared/vault/vaultExpenses.js');
const { expenseCsvHeaders, expenseCsvRow, parseExpenseCsvRow } = await import('../../../web/src/features/expenses/utils/expenseCsv.js');

const expense = (id, extra = {}) => ({ id, groupId: 'exg_d', title: `هزینه ${id}`, amount: 10, currency: 'USD', date: '2026-10-01', category: 'other', ...extra });

beforeEach(() => {
  vault.batches = [];
  vault.expenses = [];
});

describe('stored rates', () => {
  it('are dropped once from the expenses that still have one, all together', async () => {
    vault.expenses = [expense('a', { usdRate: 90_000 }), expense('b'), expense('c', { currency: 'EUR', rate: 60_000, usdRate: null })];
    expect(await dropStoredRates()).toBe(2);
    expect(vault.batches).toHaveLength(1);
    const written = vault.batches[0].records.map((r) => JSON.parse(r.payload));
    expect(written.map((e) => e.id)).toEqual(['a', 'c']);
    for (const e of written) {
      expect(e).not.toHaveProperty('usdRate');
      expect(e).not.toHaveProperty('rate');
    }
    expect(vault.batches[0].records[0]).toMatchObject({ id: 'a', parentId: 'exg_d', recordDate: '2026-10-01' });
    // Nothing left: nothing written
    vault.batches = [];
    vault.expenses = [expense('b')];
    expect(await dropStoredRates()).toBe(0);
    expect(vault.batches).toHaveLength(0);
  });

  it('go when an expense is moved too', async () => {
    const [moved] = await moveExpenses([expense('a', { usdRate: 90_000 })], 'exg_p');
    expect(moved).not.toHaveProperty('usdRate');
    expect(JSON.parse(vault.batches[0].records[0].payload)).not.toHaveProperty('usdRate');
  });
});

describe('the expense CSV', () => {
  it('holds only what the expense recorded: no rate, no toman or dollar value', () => {
    const headers = expenseCsvHeaders({ withCategory: true });
    expect(headers).toEqual(['تاریخ', 'دسته‌بندی', 'عنوان', 'مبلغ', 'سهم من', 'ارز', 'برچسب‌ها', 'دریافت‌شده از دیگران', 'پرداخت از', 'تأمین از', 'ثبت از', 'یادداشت']);
    expect(headers.some((h) => /نرخ|معادل|امروز/.test(h))).toBe(false);
    const row = expenseCsvRow(expense('a', { usdRate: 90_000, tags: ['سفر'], accountId: 'acc_1', notes: 'هتل' }), {
      withCategory: true, accountById: new Map([['acc_1', { name: 'وایز' }]]),
    });
    expect(row).toEqual(['2026-10-01', 'other', 'هزینه a', 10, 10, 'دلار', 'سفر', '', 'وایز', '', '', 'هتل']);
  });
});

describe('reading an expense CSV back', () => {
  const headers = expenseCsvHeaders({ withCategory: true });
  const headerIndex = Object.fromEntries(headers.map((h, i) => [h, i]));
  const lookups = { categoryOf: (label) => ({ dining: 'dining' })[label] || 'other', accountOf: (label) => (label === 'وایز' ? 'acc_1' : '') };

  it('gets back what was exported: day, category, title, amount and share, currency, tags, account, note', () => {
    const original = { ...expense('a', { category: 'dining', currency: 'IRT', amount: 900_000, myShare: 300_000, tags: ['سفر', 'شام'], accountId: 'acc_1', notes: 'هتل' }) };
    const row = expenseCsvRow(original, { withCategory: true, accountById: new Map([['acc_1', { name: 'وایز' }]]) }).map(String);
    // The day as the file writes it (Shamsi, Persian digits) reads back too
    row[0] = '۱۴۰۵/۰۷/۰۹';
    const parsed = parseExpenseCsvRow(row, headerIndex, 0, lookups);
    expect(parsed).toMatchObject({ status: 'ok', name: 'هزینه a' });
    expect(parsed.data).toEqual({
      title: 'هزینه a', category: 'dining', amount: 900_000, currency: 'IRT', date: '2026-10-01', myShare: 300_000,
      tags: ['سفر', 'شام'], accountId: 'acc_1', notes: 'هتل',
    });
  });

  it('a dollar row keeps its currency (no share); a row without amount, day or name is left out', () => {
    const row = ['2026-10-01', '', 'هاست', '20', '20', 'دلار', '', '', '', '', '', ''];
    expect(parseExpenseCsvRow(row, headerIndex, 0, lookups).data).toMatchObject({ currency: 'USD', amount: 20, myShare: null, date: '2026-10-01' });
    expect(parseExpenseCsvRow(['2026-10-01', '', 'x', '0'], headerIndex, 1, lookups).status).toBe('invalid');
    expect(parseExpenseCsvRow(['', '', 'x', '10'], headerIndex, 2, lookups).status).toBe('invalid');
    expect(parseExpenseCsvRow(['2026-10-01', '', '', '10'], headerIndex, 3, { ...lookups, categoryOf: () => '' })).toMatchObject({ status: 'invalid', name: 'ردیف ۵'.replace('۵', '5') });
  });
});
