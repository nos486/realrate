// @vitest-environment happy-dom
/**
 * portfolioMerge.test.js — merging two portfolios: the pure rules (portfolioMerge.js) and the
 * encrypted entries moved between the portfolios' keys (shared/vault/mergePortfolios.js)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { repointPortfolioRecord, moveEntry, canMergePortfolios } from '../../src/domain/portfolioMerge.js';

const records = new Map();
const apiCalls = [];
vi.mock('../../../web/src/shared/vault/vaultApi.js', () => ({
  VAULT_BATCH_MAX: 100,
  listVaultRecords: vi.fn(async (kind, _options, filters = {}) => ({
    records: [...records.values()].filter((r) => r.kind === kind && (!filters.parent || r.parentId === filters.parent)),
  })),
  putVaultRecords: vi.fn(async (kind, list) => {
    for (const r of list) records.set(`${kind}:${r.id}`, { kind, ...r });
    return { success: true };
  }),
}));
// Each portfolio's key is its id; the account key is "acct"
const seal = (key, plain) => `${key}:${JSON.stringify(plain)}`;
const open = (key, payload) => (payload.startsWith(`${key}:`) ? JSON.parse(payload.slice(key.length + 1)) : null);
vi.mock('../../../web/src/lib/e2ee.js', () => ({
  e2eeEncrypt: async (key, plain) => seal(key, plain),
  e2eeDecryptMany: async (key, payloads) => payloads.map((p) => open(key, p)),
}));
vi.mock('../../../web/src/shared/vault/vaultStore.js', () => ({
  getPortfolioKey: async (p) => p.id,
  encryptVaultRecord: async (plain) => seal('acct', plain),
  decryptVaultRecords: async (payloads) => payloads.map((p) => open('acct', p)),
}));
vi.mock('../../../web/src/features/portfolio/api/portfolioApi.js', () => ({
  updatePortfolio: vi.fn(async (data) => {
    apiCalls.push(['update', data]);
    return { success: true };
  }),
  deletePortfolio: vi.fn(async (id) => {
    apiCalls.push(['delete', id]);
    for (const [k, r] of records) if (r.parentId === id) records.delete(k);
    return { success: true };
  }),
}));

const { mergePortfolios } = await import('../../../web/src/shared/vault/mergePortfolios.js');

const KEEP = { id: 'pf_keep', name: 'اصلی', isDefault: false };
const MERGED = { id: 'pf_old', name: 'طلا', isDefault: true };

function put(kind, id, key, plain, parentId = '') {
  records.set(`${kind}:${id}`, { kind, id, payload: seal(key, plain), recordDate: '2026-01-01', parentId });
}

describe('repointPortfolioRecord', () => {
  it('points expense, income and goal links at the kept portfolio', () => {
    const expense = { id: 'e1', paidFrom: { portfolioId: 'pf_old', portfolioName: 'طلا', txId: 'tx_1' }, investedIn: { portfolioId: 'pf_x', txId: 'tx_2' } };
    const out = repointPortfolioRecord('expense', expense, 'pf_old', KEEP);
    expect(out.changed).toBe(true);
    expect(out.record.paidFrom).toEqual({ portfolioId: 'pf_keep', portfolioName: 'اصلی', txId: 'tx_1' });
    expect(out.record.investedIn.portfolioId).toBe('pf_x');

    expect(repointPortfolioRecord('income', { soldFrom: { portfolioId: 'pf_old' } }, 'pf_old', KEEP).record.soldFrom.portfolioId).toBe('pf_keep');

    const goal = { allocations: [{ portfolioId: 'pf_old', assetId: 'usd' }, { portfolioId: 'pf_x', assetId: 'gold' }] };
    expect(repointPortfolioRecord('goal', goal, 'pf_old', KEEP).record.allocations.map((a) => a.portfolioId)).toEqual(['pf_keep', 'pf_x']);
  });

  it('leaves unrelated records unchanged', () => {
    expect(repointPortfolioRecord('expense', { amount: 5 }, 'pf_old', KEEP).changed).toBe(false);
    expect(repointPortfolioRecord('goal', { allocations: [{ portfolioId: 'pf_x' }] }, 'pf_old', KEEP).changed).toBe(false);
  });

  it('moves an entry and refuses merging a portfolio into itself', () => {
    expect(moveEntry({ id: 'h1', portfolioId: 'pf_old', amount: 2 }, 'pf_keep')).toEqual({ id: 'h1', portfolioId: 'pf_keep', amount: 2 });
    expect(canMergePortfolios(KEEP, KEEP)).toBe(false);
    expect(canMergePortfolios(KEEP, MERGED)).toBe(true);
  });
});

describe('mergePortfolios', () => {
  beforeEach(() => {
    records.clear();
    apiCalls.length = 0;
  });

  it('re-encrypts every entry under the kept portfolio, relinks records and deletes the merged one', async () => {
    put('holding', 'h_old', 'pf_old', { id: 'h_old', portfolioId: 'pf_old', assetId: 'usd', amount: 100 }, 'pf_old');
    put('transaction', 'tx_old', 'pf_old', { id: 'tx_old', portfolioId: 'pf_old', assetId: 'usd', quantity: 50, transactionType: 'buy' }, 'pf_old');
    put('portfolio_layout', 'layout_old', 'pf_old', { groups: [] }, 'pf_old');
    put('holding', 'h_keep', 'pf_keep', { id: 'h_keep', portfolioId: 'pf_keep', assetId: 'usd', amount: 10 }, 'pf_keep');
    put('expense', 'e1', 'acct', { id: 'e1', paidFrom: { portfolioId: 'pf_old', portfolioName: 'طلا', txId: 'tx_old' } });
    put('expense', 'e2', 'acct', { id: 'e2', amount: 1 });

    const result = await mergePortfolios(KEEP, MERGED);
    expect(result).toEqual({ moved: 2, relinked: 1 });

    const holding = records.get('holding:h_old');
    expect(holding.parentId).toBe('pf_keep');
    expect(holding.recordDate).toBe('2026-01-01');
    expect(open('pf_keep', holding.payload)).toMatchObject({ portfolioId: 'pf_keep', amount: 100 });
    expect(open('pf_keep', records.get('transaction:tx_old').payload)).toMatchObject({ portfolioId: 'pf_keep', quantity: 50 });
    expect(records.has('holding:h_keep')).toBe(true);
    // The merged portfolio's own layout goes with it
    expect(records.has('portfolio_layout:layout_old')).toBe(false);

    expect(open('acct', records.get('expense:e1').payload).paidFrom).toMatchObject({ portfolioId: 'pf_keep', portfolioName: 'اصلی' });
    // The merged portfolio was the default: the kept one becomes it, then the merged one is deleted
    expect(apiCalls).toEqual([['update', { id: 'pf_keep', isDefault: true }], ['delete', 'pf_old']]);
  });

  it('changes nothing when an entry cannot be decrypted', async () => {
    put('holding', 'h_bad', 'other_key', { id: 'h_bad' }, 'pf_old');
    await expect(mergePortfolios(KEEP, MERGED)).rejects.toThrow();
    expect(records.get('holding:h_bad').parentId).toBe('pf_old');
    expect(apiCalls).toEqual([]);
  });
});
