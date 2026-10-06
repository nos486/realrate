/**
 * moveExpenses.test.js — everyday expenses moved to a project: each is re-encrypted with its new
 * section and all are stored together, one request per 100; what they are paid from stays
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sent = vi.hoisted(() => ({ batches: [] }));
vi.mock('../../../web/src/shared/vault/vaultApi.js', () => ({
  VAULT_BATCH_MAX: 100,
  putVaultRecords: vi.fn(async (kind, records) => { sent.batches.push({ kind, records }); return { records }; }),
  listVaultRecords: vi.fn(async () => ({ records: [] })),
  deleteVaultRecord: vi.fn(),
}));
vi.mock('../../../web/src/shared/vault/vaultRecordMeta.js', () => ({
  putRecord: vi.fn(),
  recordDateOf: (kind, e) => e.date,
}));
vi.mock('../../../web/src/shared/vault/vaultStore.js', () => ({
  encryptVaultRecord: vi.fn(async (v) => JSON.stringify(v)),
  decryptVaultRecord: vi.fn(async (p) => JSON.parse(p)),
}));
vi.mock('../../../web/src/shared/vault/portfolioFunds.js', () => ({
  saveSpendTransaction: vi.fn(),
  saveLinkedTransaction: vi.fn(),
  deleteLinkedTransaction: vi.fn(),
}));
const { moveExpenses } = await import('../../../web/src/shared/vault/vaultExpenses.js');
const funds = await import('../../../web/src/shared/vault/portfolioFunds.js');

const expense = (i, extra = {}) => ({
  id: `exp_${i}`, groupId: 'exg_daily', title: `هزینه ${i}`, amount: 1000 + i, currency: 'IRT', date: '2026-10-01', category: 'groceries', ...extra,
});

beforeEach(() => { sent.batches = []; });

describe('moveExpenses', () => {
  it('stores them with the project as their section, one request per 100', async () => {
    const list = Array.from({ length: 150 }, (_, i) => expense(i));
    const moved = await moveExpenses(list, 'exg_proj');
    expect(moved).toHaveLength(150);
    expect(sent.batches.map((b) => b.records.length)).toEqual([100, 50]);
    expect(sent.batches.every((b) => b.kind === 'expense')).toBe(true);
    const first = sent.batches[0].records[0];
    expect(first).toMatchObject({ id: 'exp_0', parentId: 'exg_proj', recordDate: '2026-10-01' });
    expect(JSON.parse(first.payload)).toMatchObject({ id: 'exp_0', groupId: 'exg_proj', title: 'هزینه 0', category: 'groceries' });
  });

  it('skips those already there, and leaves what they were paid from alone', async () => {
    const paidFrom = { portfolioId: 'pf_a', portfolioName: 'اصلی', assetId: 'usd', txId: 'txs_1' };
    const moved = await moveExpenses([
      expense(1, { groupId: 'exg_proj' }),
      expense(2, { currency: 'USD', usdRate: 100_000, paidFrom }),
    ], 'exg_proj');
    expect(moved.map((e) => e.id)).toEqual(['exp_2']);
    expect(moved[0].paidFrom).toEqual(paidFrom);
    expect(funds.saveSpendTransaction).not.toHaveBeenCalled();
    expect(funds.deleteLinkedTransaction).not.toHaveBeenCalled();
    expect(sent.batches).toHaveLength(1);
  });

  it('nothing to move: no request', async () => {
    expect(await moveExpenses([], 'exg_proj')).toEqual([]);
    expect(sent.batches).toHaveLength(0);
  });
});
