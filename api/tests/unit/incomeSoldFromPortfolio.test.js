/**
 * incomeSoldFromPortfolio.test.js — an income in «فروش دارایی» that is a sale from a portfolio:
 * the portfolio gets a «sell» written first, moved, removed or deleted with the income
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const funds = vi.hoisted(() => ({ calls: [], failPut: false, records: [] }));
vi.mock('../../../web/src/shared/vault/portfolioFunds.js', () => ({
  saveLinkedTransaction: vi.fn(async (link, entry) => funds.calls.push(['link', entry.type, link.portfolioId, link.txId, link.quantity, entry.toman, entry.owner])),
  deleteLinkedTransaction: vi.fn(async (link) => funds.calls.push(['delete', link.portfolioId, link.txId])),
}));
vi.mock('../../../web/src/shared/vault/vaultRecordMeta.js', () => ({
  putRecord: vi.fn(async (kind, id, payload) => {
    funds.calls.push(['income']);
    if (funds.failPut) throw new Error('offline');
    funds.records = [...funds.records.filter((r) => r.id !== id), { id, payload }];
  }),
  backfillRecordDates: vi.fn(),
  repairRecordDates: vi.fn(async () => {}),
}));
vi.mock('../../../web/src/shared/vault/vaultApi.js', () => ({
  listVaultRecords: vi.fn(async () => ({ records: funds.records })),
  deleteVaultRecord: vi.fn(async (kind, id) => {
    funds.calls.push(['deleteIncome']);
    funds.records = funds.records.filter((r) => r.id !== id);
  }),
}));
vi.mock('../../../web/src/shared/vault/vaultStore.js', () => ({
  encryptVaultRecord: vi.fn(async (v) => JSON.stringify(v)),
  decryptVaultRecord: vi.fn(async (p) => JSON.parse(p)),
}));
const api = await import('../../../web/src/shared/vault/vaultIncomes.js');

const sale = { title: 'فروش سکه', category: 'asset_sale', amount: 90_000_000, incomeDate: '2026-09-25' };
const link = (portfolioId = 'pf_a', txId = 'txl_9', quantity = 1) => ({ portfolioId, portfolioName: 'اصلی', assetId: 'full_coin', quantity, txId });

beforeEach(() => {
  funds.calls = [];
  funds.failPut = false;
  funds.records = [];
  api.clearVaultIncomesCache();
});

describe('a sale from a portfolio (soldFrom)', () => {
  it('validates the link and keeps no link by default', () => {
    expect(api.parseIncomeInput({ ...sale, soldFrom: link() }).soldFrom).toEqual(link());
    expect(api.parseIncomeInput(sale).soldFrom).toBeNull();
    expect(() => api.parseIncomeInput({ ...sale, soldFrom: { ...link(), quantity: -1 } })).toThrow(/مقدار/);
  });

  it('writes a «sell» of the quantity at the income\'s tomans, before the income', async () => {
    const { income } = await api.createIncome({ ...sale, soldFrom: link() });
    expect(funds.calls).toEqual([['link', 'sell', 'pf_a', 'txl_9', 1, 90_000_000, { incomeId: income.id }], ['income']]);
  });

  it('moves, removes and deletes with the income', async () => {
    const { income } = await api.createIncome({ ...sale, soldFrom: link() });
    funds.calls = [];
    await api.updateIncome(income.id, { ...sale, soldFrom: link('pf_b', 'txl_10', 2) });
    expect(funds.calls).toEqual([['delete', 'pf_a', 'txl_9'], ['link', 'sell', 'pf_b', 'txl_10', 2, 90_000_000, { incomeId: income.id }], ['income']]);
    funds.calls = [];
    await api.updateIncome(income.id, { ...sale, category: 'other' });
    expect(funds.calls).toEqual([['income'], ['delete', 'pf_b', 'txl_10']]);
    funds.calls = [];
    await api.updateIncome(income.id, { ...sale, soldFrom: link() });
    funds.calls = [];
    api.clearVaultIncomesCache(); // read back from the store, as after a reload
    await api.deleteIncome(income.id);
    expect(funds.calls).toEqual([['deleteIncome'], ['delete', 'pf_a', 'txl_9']]);
  });

  it('a failed save leaves no sale behind', async () => {
    funds.failPut = true;
    await expect(api.createIncome({ ...sale, soldFrom: link() })).rejects.toThrow();
    expect(funds.calls.at(-1)).toEqual(['delete', 'pf_a', 'txl_9']);
  });
});
