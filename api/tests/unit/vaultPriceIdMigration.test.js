// @vitest-environment happy-dom
/**
 * vaultPriceIdMigration.test.js — Holdings and transactions saved with an older asset id are
 * stored again (re-encrypted) with the price book's id the next time they are read.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const puts = [];
let records = [];
vi.mock('../../../web/src/shared/vault/vaultApi.js', () => ({
  putVaultRecord: vi.fn(async (kind, id, payload, options) => { puts.push({ kind, id, payload, ...options }); }),
  listVaultRecords: vi.fn(async () => ({ records, total: records.length })),
  deleteVaultRecord: vi.fn(),
}));
vi.mock('../../../web/src/features/portfolio/api/portfolioApi.js', () => ({
  getPortfolio: vi.fn(async () => ({ holdings: [] })),
  deletePortfolioHolding: vi.fn(),
}));
vi.mock('../../../web/src/features/transactions/api/transactionApi.js', () => ({
  getTransactions: vi.fn(async () => ({ transactions: [] })),
  deleteTransaction: vi.fn(),
}));

const { e2eeEncrypt, e2eeDecrypt, deriveE2eeKey, generateE2eeSalt } = await import('../../../web/src/lib/e2ee.js');
const { listPortfolioHoldings, listPortfolioTransactions } = await import('../../../web/src/shared/vault/vaultPortfolioItems.js');
const { setKnownPriceIds } = await import('../../../web/src/features/market/knownPriceIds.js');

const flush = () => new Promise((r) => setTimeout(r, 20));
const portfolio = { id: 'p1' };

describe('stored asset ids become price book ids', () => {
  let key;
  beforeEach(async () => {
    puts.length = 0;
    key = key || await deriveE2eeKey('pass-for-tests', generateE2eeSalt());
    setKnownPriceIds({ usd: 1, 'src_def_bourse__فولاد': 1, gold_18k: 1 });
  });

  it('re-encrypts a holding saved with an old id, and shows it with the new one', async () => {
    const old = { id: 'h1', portfolioId: 'p1', assetId: 'bourse_فولاد', referenceAssetId: 'USD', amount: 10, buyDate: '2026-01-01' };
    const current = { id: 'h2', portfolioId: 'p1', assetId: 'gold_18k', amount: 1, buyDate: '2026-01-02' };
    records = [
      { id: 'h1', payload: await e2eeEncrypt(key, old), recordDate: '2026-01-01', parentId: 'p1' },
      { id: 'h2', payload: await e2eeEncrypt(key, current), recordDate: '2026-01-02', parentId: 'p1' },
    ];

    const holdings = await listPortfolioHoldings(portfolio, key);
    expect(holdings.find((h) => h.id === 'h1')).toMatchObject({ assetId: 'src_def_bourse__فولاد', referenceAssetId: 'usd' });

    await flush();
    const saved = puts.filter((p) => p.kind === 'holding');
    expect(saved.map((p) => p.id)).toEqual(['h1']); // the standard one is left alone
    expect(saved[0]).toMatchObject({ parentId: 'p1', recordDate: '2026-01-01' });
    expect(await e2eeDecrypt(key, saved[0].payload)).toMatchObject({ id: 'h1', assetId: 'src_def_bourse__فولاد', referenceAssetId: 'usd', amount: 10 });
  });

  it('does the same for transactions', async () => {
    const tx = { id: 't1', portfolioId: 'p1', assetId: 'src_def_usd', type: 'buy', quantity: 5, transactionDate: '2026-02-01' };
    records = [{ id: 't1', payload: await e2eeEncrypt(key, tx), recordDate: '2026-02-01', parentId: 'p1' }];
    const list = await listPortfolioTransactions(portfolio, key);
    expect(list[0].assetId).toBe('usd');
    await flush();
    const saved = puts.filter((p) => p.kind === 'transaction' && p.id === 't1');
    expect(saved).toHaveLength(1);
    expect((await e2eeDecrypt(key, saved[0].payload)).assetId).toBe('usd');
  });

  it('waits for the price book: nothing is rewritten before its ids are known', async () => {
    const { setKnownPriceIds: reset } = await import('../../../web/src/features/market/knownPriceIds.js');
    reset(null); // keeps the last known ids — a fresh module would have none
    const old = { id: 'h9', portfolioId: 'p1', assetId: 'src_def_nothing_known', amount: 1 };
    records = [{ id: 'h9', payload: await e2eeEncrypt(key, old), recordDate: '', parentId: 'p1' }];
    await listPortfolioHoldings(portfolio, key);
    await flush();
    expect(puts.filter((p) => p.kind === 'holding')).toHaveLength(0);
  });
});
