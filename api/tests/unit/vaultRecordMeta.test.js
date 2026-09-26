// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const puts = [];
vi.mock('../../../web/src/shared/vault/vaultApi.js', () => ({
  putVaultRecord: vi.fn(async (kind, id, payload, options) => { puts.push({ kind, id, payload, ...options }); }),
}));

const { recordDateOf, putRecord, backfillRecordDates } = await import('../../../web/src/shared/vault/vaultRecordMeta.js');

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('vault record metadata', () => {
  beforeEach(() => { puts.length = 0; });

  it('takes the one primary date of each kind', () => {
    expect(recordDateOf('income', { incomeDate: '2026-04-18' })).toBe('2026-04-18');
    expect(recordDateOf('cheque', { issueDate: '2026-01-01', dueDate: '2026-02-10' })).toBe('2026-02-10');
    expect(recordDateOf('loan', { loan: { startDate: '2025-10-05T00:00:00.000Z' } })).toBe('2025-10-05');
    expect(recordDateOf('recurring_income', { startDate: '2026-01-15' })).toBe('2026-01-15');
    expect(recordDateOf('transaction', { transactionDate: '2026-05-01' })).toBe('2026-05-01');
    expect(recordDateOf('income', { incomeDate: '1405/01/01' })).toBe('');
    expect(recordDateOf('income', null)).toBe('');
  });

  it('stores the date (and parent) beside the ciphertext', async () => {
    await putRecord('income', 'inc_1', 'enc:e2ee:v1:x', { incomeDate: '2026-04-18', amount: 5 }, { replacePlain: true });
    expect(puts).toEqual([{ kind: 'income', id: 'inc_1', payload: 'enc:e2ee:v1:x', recordDate: '2026-04-18', parentId: '', replacePlain: true }]);
  });

  it('fills the date of older records with the same ciphertext, only where missing', async () => {
    backfillRecordDates('income', [
      { record: { id: 'inc_old', payload: 'enc:e2ee:v1:old', recordDate: '' }, plain: { incomeDate: '2026-03-21' } },
      { record: { id: 'inc_new', payload: 'enc:e2ee:v1:new', recordDate: '2026-04-01' }, plain: { incomeDate: '2026-04-01' } },
    ]);
    await flush();
    expect(puts).toEqual([expect.objectContaining({ id: 'inc_old', payload: 'enc:e2ee:v1:old', recordDate: '2026-03-21' })]);
  });
});
