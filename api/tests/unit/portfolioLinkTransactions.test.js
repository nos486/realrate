/**
 * portfolioLinkTransactions.test.js — the portfolio entry a linked expense / income writes, and
 * what it does to the holding: an investment adds to it, a sale takes from it (FIFO ledger)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = vi.hoisted(() => ({ saved: [], deleted: [] }));
vi.mock('../../../web/src/features/market/api/marketApi.js', () => ({ getSparklines: vi.fn() }));
vi.mock('../../../web/src/features/portfolio/api/portfolioApi.js', () => ({
  getPortfolios: vi.fn(async () => ({ portfolios: [{ id: 'pf_a', name: 'اصلی', isDefault: true }, { id: 'pf_b', name: 'دوم' }] })),
}));
vi.mock('../../../web/src/shared/vault/vaultStore.js', () => ({ getPortfolioKey: vi.fn(async () => 'key'), isAccountVaultPortfolio: () => true }));
vi.mock('../../../web/src/shared/vault/vaultPortfolioItems.js', () => ({
  listPortfolioHoldings: vi.fn(async (portfolio) => (portfolio.id === 'pf_a'
    ? [{ id: 'h1', assetId: 'full_coin', amount: 3, buyPrice: 60_000_000, buyDate: '1405/01/10' }]
    : [])),
  listPortfolioTransactions: vi.fn(async () => store.saved.map((s) => s.data)),
  savePortfolioTransaction: vi.fn(async (portfolio, key, id, data) => { store.saved.push({ portfolioId: portfolio.id, id, data: { ...data, id } }); }),
  deletePortfolioTransactionRecord: vi.fn(async (portfolioId, id) => { store.deleted.push([portfolioId, id]); }),
}));
const funds = await import('../../../web/src/shared/vault/portfolioFunds.js');
const { calculateComputedHoldings } = await import('../../../web/src/features/transactions/utils/calculationEngine.js');

beforeEach(() => {
  store.saved = [];
  store.deleted = [];
});

describe('linked portfolio entries', () => {
  it('a sale is a «sell» at tomans / quantity, on its Shamsi day, without the income\'s title', async () => {
    await funds.saveLinkedTransaction(
      { portfolioId: 'pf_a', assetId: 'full_coin', quantity: 2, txId: 'txl_1' },
      { type: 'sell', toman: 180_000_000, date: '2026-09-25', owner: { incomeId: 'inc_1' } },
    );
    expect(store.saved).toHaveLength(1);
    const { portfolioId, id, data } = store.saved[0];
    expect([portfolioId, id]).toEqual(['pf_a', 'txl_1']);
    expect(data).toMatchObject({ transactionType: 'sell', quantity: 2, unitPrice: 90_000_000, incomeId: 'inc_1', transactionDate: '1405/07/03' });
    expect(data.notes).toBe(funds.LINK_NOTES.sell);

    // The holding: 3 coins, 2 sold → 1 left, with the sale's profit realized
    const { positions } = calculateComputedHoldings(store.saved.map((s) => s.data), {}, {
      manualLots: [{ id: 'h1', assetId: 'full_coin', amount: 3, buyPrice: 60_000_000, buyDate: '1405/01/10' }],
    });
    expect(positions.get('full_coin').amount).toBe(1);
    expect(positions.get('full_coin').realizedPnl).toBe(2 * (90_000_000 - 60_000_000));
  });

  it('an investment is a «buy» that adds to the holding', async () => {
    await funds.saveLinkedTransaction(
      { portfolioId: 'pf_a', assetId: 'full_coin', quantity: 0.5, txId: 'txl_2' },
      { type: 'buy', toman: 45_000_000, date: '2026-09-25', owner: { expenseId: 'exp_1' } },
    );
    expect(store.saved[0].data).toMatchObject({ transactionType: 'buy', quantity: 0.5, unitPrice: 90_000_000, expenseId: 'exp_1' });
    const { positions } = calculateComputedHoldings(store.saved.map((s) => s.data), {}, {
      manualLots: [{ id: 'h1', assetId: 'full_coin', amount: 3, buyPrice: 60_000_000, buyDate: '1405/01/10' }],
    });
    expect(positions.get('full_coin').amount).toBe(3.5);
  });

  it('lists every portfolio with what it holds now, and removes an entry', async () => {
    await funds.saveLinkedTransaction(
      { portfolioId: 'pf_a', assetId: 'full_coin', quantity: 1, txId: 'txl_3' },
      { type: 'sell', toman: 90_000_000, date: '2026-09-25', owner: { incomeId: 'inc_2' } },
    );
    const list = await funds.listPortfolioPositions();
    const main = list.find((p) => p.portfolioId === 'pf_a');
    expect(main.positions.find((p) => p.assetId === 'full_coin').amount).toBe(2);
    expect((await funds.listLinkablePortfolios()).map((p) => p.id)).toEqual(['pf_a', 'pf_b']);
    await funds.deleteLinkedTransaction({ portfolioId: 'pf_a', txId: 'txl_3' });
    expect(store.deleted).toEqual([['pf_a', 'txl_3']]);
  });
});
