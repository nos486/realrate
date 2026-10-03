/**
 * expensePaidFromPortfolio.test.js — a dollar expense paid from a portfolio's dollars: the
 * expense keeps where it came from, the portfolio gets a «spend» transaction written first, moved
 * or removed with the expense; the day's rate comes from the price history
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateExpense } from '../../src/domain/expenseDocument.js';

const funds = vi.hoisted(() => ({ calls: [], failPut: false }));
vi.mock('../../../web/src/shared/vault/portfolioFunds.js', () => {
  const remove = vi.fn(async (link) => funds.calls.push(['delete', link.portfolioId, link.txId]));
  return {
    saveSpendTransaction: vi.fn(async (expense) => funds.calls.push(['save', expense.paidFrom.portfolioId, expense.paidFrom.txId, expense.amount])),
    saveLinkedTransaction: vi.fn(async (link, entry) => funds.calls.push(['link', entry.type, link.portfolioId, link.txId, link.quantity, entry.toman, entry.owner])),
    deleteSpendTransaction: remove,
    deleteLinkedTransaction: remove,
  };
});
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

describe('an investment expense added to a portfolio (investedIn)', () => {
  const invest = { groupId: 'exg_1', title: 'خرید طلا', amount: 50_000_000, currency: 'IRT', date: '2026-09-20', category: 'investment' };
  const link = (portfolioId = 'pf_a', txId = 'txl_1', quantity = 2) => ({ portfolioId, portfolioName: 'اصلی', assetId: 'gold_18k', quantity, txId });

  it('validates the link: an asset, a quantity, a toman value, no «دنگ»', () => {
    expect(validateExpense({ ...invest, investedIn: link() }).value.investedIn).toEqual(link());
    expect(validateExpense(invest).value.investedIn).toBeNull();
    expect(validateExpense({ ...invest, investedIn: { ...link(), quantity: 0 } }).error).toMatch(/مقدار/);
    expect(validateExpense({ ...invest, investedIn: { ...link(), assetId: '' } }).error).toMatch(/دارایی/);
    expect(validateExpense({ ...invest, investedIn: { ...link(), txId: 'bad id' } }).error).toBeTruthy();
    expect(validateExpense({ ...invest, currency: 'USD', amount: 100, investedIn: link() }).error).toMatch(/نرخ/);
    expect(validateExpense({ ...invest, currency: 'USD', amount: 100, usdRate: 100_000, investedIn: link() }).value.investedIn).toBeTruthy();
    expect(validateExpense({ ...invest, myShare: 10_000_000, investedIn: link() }).error).toMatch(/دنگ/);
  });

  it('writes a «buy» of the quantity at the expense\'s tomans, before the expense', async () => {
    const { expense } = await api.saveExpense({ ...invest, investedIn: link() });
    expect(funds.calls).toEqual([
      ['link', 'buy', 'pf_a', 'txl_1', 2, 50_000_000, { expenseId: expense.id }],
      ['expense'],
    ]);
  });

  it('a dollar investment is bought at its own rate', async () => {
    await api.saveExpense({ ...invest, currency: 'USD', amount: 500, usdRate: 100_000, investedIn: link() });
    expect(funds.calls[0][5]).toBe(50_000_000);
  });

  it('moves, removes and deletes with the expense', async () => {
    const { expense } = await api.saveExpense({ ...invest, investedIn: link() });
    funds.calls = [];
    const { expense: moved } = await api.saveExpense({ investedIn: link('pf_b', 'txl_2', 3) }, expense);
    expect(funds.calls).toEqual([['delete', 'pf_a', 'txl_1'], ['link', 'buy', 'pf_b', 'txl_2', 3, 50_000_000, { expenseId: expense.id }], ['expense']]);
    funds.calls = [];
    const { expense: plain } = await api.saveExpense({ investedIn: null, category: 'other' }, moved);
    expect(funds.calls).toEqual([['expense'], ['delete', 'pf_b', 'txl_2']]);
    funds.calls = [];
    const { expense: again } = await api.saveExpense({ investedIn: link() }, plain);
    funds.calls = [];
    await api.deleteExpense(again.id, again);
    expect(funds.calls).toEqual([['deleteExpense'], ['delete', 'pf_a', 'txl_1']]);
  });

  it('a failed save leaves no purchase behind', async () => {
    funds.failPut = true;
    await expect(api.saveExpense({ ...invest, investedIn: link() })).rejects.toThrow();
    expect(funds.calls.at(-1)).toEqual(['delete', 'pf_a', 'txl_1']);
  });
});
