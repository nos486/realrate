/**
 * expensePaidFromPortfolio.test.js — a dollar expense paid from a portfolio's dollars: the
 * expense keeps where it came from, the portfolio gets a «spend» transaction written first, moved
 * or removed with the expense; the day's rate comes from the price history
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateExpense } from '../../src/domain/expenseDocument.js';

const funds = vi.hoisted(() => ({ calls: [], failPut: false }));
vi.mock('../../../web/src/shared/vault/portfolioFunds.js', () => ({
  saveSpendTransaction: vi.fn(async (expense) => funds.calls.push(['save', expense.paidFrom.portfolioId, expense.paidFrom.txId, expense.amount])),
  deleteSpendTransaction: vi.fn(async (paidFrom) => funds.calls.push(['delete', paidFrom.portfolioId, paidFrom.txId])),
}));
vi.mock('../../../web/src/shared/vault/vaultRecordMeta.js', () => ({
  putRecord: vi.fn(async () => {
    funds.calls.push(['expense']);
    if (funds.failPut) throw new Error('offline');
  }),
}));
vi.mock('../../../web/src/shared/vault/vaultApi.js', () => ({
  listVaultRecords: vi.fn(async () => ({ records: [] })),
  deleteVaultRecord: vi.fn(async () => funds.calls.push(['deleteExpense'])),
}));
vi.mock('../../../web/src/shared/vault/vaultStore.js', () => ({
  encryptVaultRecord: vi.fn(async (v) => JSON.stringify(v)),
  decryptVaultRecord: vi.fn(async (p) => JSON.parse(p)),
}));
const api = await import('../../../web/src/shared/vault/vaultExpenses.js');

const base = { groupId: 'exg_1', title: 'هتل', amount: 120, currency: 'USD', usdRate: 100_000, date: '2026-09-20', category: 'entertainment' };
const paidFrom = (portfolioId = 'pf_a', txId = 'txs_1') => ({ portfolioId, portfolioName: 'اصلی', assetId: 'usd', txId });

beforeEach(() => {
  funds.calls = [];
  funds.failPut = false;
});

describe('validateExpense — paidFrom', () => {
  it('keeps the portfolio and drops account and loan', () => {
    const { value } = validateExpense({ ...base, accountId: 'acc_1', loanId: 'loan_1', paidFrom: paidFrom() });
    expect(value.paidFrom).toEqual(paidFrom());
    expect(value.accountId).toBe('');
    expect(value.loanId).toBe('');
  });

  it('needs dollars, a rate, and valid ids', () => {
    expect(validateExpense({ ...base, currency: 'IRT', paidFrom: paidFrom() }).error).toBeTruthy();
    expect(validateExpense({ ...base, usdRate: null, paidFrom: paidFrom() }).error).toMatch(/نرخ/);
    expect(validateExpense({ ...base, paidFrom: { ...paidFrom(), txId: 'bad id' } }).error).toBeTruthy();
    expect(validateExpense(base).value.paidFrom).toBeNull();
  });
});

describe('saving with the spend transaction', () => {
  it('writes the transaction before the expense', async () => {
    const { expense } = await api.saveExpense({ ...base, paidFrom: paidFrom() });
    expect(funds.calls).toEqual([['save', 'pf_a', 'txs_1', 120], ['expense']]);
    expect(expense.paidFrom.txId).toBe('txs_1');
  });

  it('removes the transaction again when the new expense fails to save', async () => {
    funds.failPut = true;
    await expect(api.saveExpense({ ...base, paidFrom: paidFrom() })).rejects.toThrow();
    expect(funds.calls).toEqual([['save', 'pf_a', 'txs_1', 120], ['expense'], ['delete', 'pf_a', 'txs_1']]);
  });

  it('moves the transaction to another portfolio, and removes it when no longer paid from one', async () => {
    const { expense } = await api.saveExpense({ ...base, paidFrom: paidFrom() });
    funds.calls = [];
    const { expense: moved } = await api.saveExpense({ paidFrom: paidFrom('pf_b', 'txs_2') }, expense);
    expect(funds.calls).toEqual([['delete', 'pf_a', 'txs_1'], ['save', 'pf_b', 'txs_2', 120], ['expense']]);
    funds.calls = [];
    await api.saveExpense({ paidFrom: null }, moved);
    expect(funds.calls).toEqual([['expense'], ['delete', 'pf_b', 'txs_2']]);
  });

  it('an edit rewrites the same transaction', async () => {
    const { expense } = await api.saveExpense({ ...base, paidFrom: paidFrom() });
    funds.calls = [];
    await api.saveExpense({ amount: 150 }, expense);
    expect(funds.calls).toEqual([['save', 'pf_a', 'txs_1', 150], ['expense']]);
  });

  it('deleting the expense deletes its transaction', async () => {
    const { expense } = await api.saveExpense({ ...base, paidFrom: paidFrom() });
    funds.calls = [];
    await api.deleteExpense(expense.id, expense);
    expect(funds.calls).toEqual([['deleteExpense'], ['delete', 'pf_a', 'txs_1']]);
  });
});
