// @vitest-environment happy-dom
/**
 * accountMerge.test.js — merging two accounts: the pure rules (accountMerge.js), the SMS match of
 * a merged account's card, and the encrypted records moved (shared/vault/mergeAccounts.js)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { repointRecord, mergeAccountFields, canMergeAccounts } from '../../src/domain/accountMerge.js';
import { validateAccount } from '../../src/domain/accountDocument.js';
import { matchSmsAccount } from '../../src/domain/bankSms.js';

const records = new Map();
vi.mock('../../../web/src/shared/vault/vaultApi.js', () => ({
  VAULT_BATCH_MAX: 100,
  listVaultRecords: vi.fn(async (kind) => ({ records: [...records.values()].filter((r) => r.kind === kind) })),
  putVaultRecord: vi.fn(async (kind, id, payload) => {
    records.set(`${kind}:${id}`, { kind, id, payload });
    return { success: true };
  }),
  putVaultRecords: vi.fn(async (kind, list) => {
    for (const r of list) records.set(`${kind}:${r.id}`, { kind, ...r });
    return { success: true };
  }),
  deleteVaultRecord: vi.fn(async (kind, id) => {
    records.delete(`${kind}:${id}`);
    return { success: true };
  }),
  deleteVaultRecords: vi.fn(async (kind, ids) => {
    for (const id of ids) records.delete(`${kind}:${id}`);
  }),
}));
vi.mock('../../../web/src/shared/vault/vaultStore.js', () => ({
  encryptVaultRecord: vi.fn(async (plain) => `enc:${JSON.stringify(plain)}`),
  decryptVaultRecord: vi.fn(async (payload) => JSON.parse(payload.slice(4))),
  decryptVaultRecords: async (payloads) => Promise.all(payloads.map(async (payload) => JSON.parse(payload.slice(4)))),
}));
vi.mock('../../../web/src/features/demo/index.js', () => ({ isDemoReadOnly: () => false }));

const { mergeAccounts } = await import('../../../web/src/shared/vault/mergeAccounts.js');
const vaultAccounts = await import('../../../web/src/shared/vault/vaultAccounts.js');

const put = (kind, plain, extra = {}) => records.set(`${kind}:${plain.id}`, { kind, id: plain.id, payload: `enc:${JSON.stringify(plain)}`, ...extra });
const read = (kind, id) => JSON.parse(records.get(`${kind}:${id}`).payload.slice(4));

describe('repointRecord', () => {
  it('moves an expense, its reimbursements and an income', () => {
    const e = { id: 'e', accountId: 'b', reimbursements: [{ accountId: 'b', amount: 1 }, { accountId: 'c', amount: 2 }] };
    const r = repointRecord('expense', e, 'b', 'a');
    expect(r.changed).toBe(true);
    expect(r.record).toMatchObject({ accountId: 'a', reimbursements: [{ accountId: 'a' }, { accountId: 'c' }] });
    expect(repointRecord('income', { id: 'i', accountId: 'x' }, 'b', 'a').changed).toBe(false);
  });

  it('drops a transfer between the two accounts and re-points the others', () => {
    expect(repointRecord('transfer', { fromAccountId: 'b', toAccountId: 'a' }, 'b', 'a').drop).toBe(true);
    const r = repointRecord('transfer', { fromAccountId: 'c', toAccountId: 'b' }, 'b', 'a');
    expect(r).toMatchObject({ changed: true, drop: false, record: { toAccountId: 'a' } });
  });
});

describe('mergeAccountFields and SMS matching', () => {
  const keep = { id: 'a', name: 'ملی من', type: 'bank', currencies: ['IRT'] };
  const merged = { id: 'b', name: 'ملی', type: 'bank', bankId: 'melli', cardLast4: '1234', currencies: ['IRT', 'USD'] };

  it('fills what the kept account lacks and keeps the other card as an alias', () => {
    const fields = mergeAccountFields({ ...keep, bankId: 'melli', cardLast4: '9999' }, merged);
    expect(fields).toMatchObject({ bankId: 'melli', cardLast4: '9999', currencies: ['IRT', 'USD'], aliases: [{ bankId: 'melli', cardLast4: '1234', accountNumber: '' }] });
    expect(mergeAccountFields(keep, merged).aliases).toEqual([]);
  });

  it('matches a message of the merged card to the kept account', () => {
    const { value } = validateAccount({ ...keep, ...mergeAccountFields({ ...keep, bankId: 'melli', cardLast4: '9999' }, merged) });
    const other = { id: 'z', type: 'bank', bankId: 'melli', cardLast4: '5555', currencies: ['IRT'] };
    const kept = { id: 'a', ...value };
    expect(matchSmsAccount({ bankId: 'melli', cardLast4: '1234' }, [other, kept])).toBe('a');
  });

  it('refuses a credit line and the same account', () => {
    expect(canMergeAccounts(keep, keep)).toBe(false);
    expect(canMergeAccounts(keep, { id: 'c', type: 'credit', credit: {} })).toBe(false);
  });
});

describe('mergeAccounts', () => {
  beforeEach(() => records.clear());

  it('moves every record, deletes the duplicate and keeps its card', async () => {
    const { account: keep } = await vaultAccounts.saveAccount({ name: 'ملی من', type: 'bank', bankId: 'melli', cardLast4: '9999' });
    const { account: dup } = await vaultAccounts.saveAccount({ name: 'ملی', type: 'bank', bankId: 'melli', cardLast4: '1234' });
    put('expense', { id: 'e1', accountId: dup.id, date: '2026-01-01', groupId: 'g' }, { parentId: 'g', recordDate: '2026-01-01' });
    put('expense', { id: 'e2', accountId: keep.id, date: '2026-01-02', groupId: 'g' }, { parentId: 'g' });
    put('income', { id: 'i1', accountId: dup.id });
    put('transfer', { id: 't1', fromAccountId: dup.id, toAccountId: keep.id });
    put('transfer', { id: 't2', fromAccountId: 'other', toAccountId: dup.id });

    const result = await mergeAccounts(keep, dup);

    expect(result).toMatchObject({ moved: 3, dropped: 1 });
    expect(read('expense', 'e1').accountId).toBe(keep.id);
    expect(records.get('expense:e1')).toMatchObject({ parentId: 'g', recordDate: '2026-01-01' });
    expect(read('income', 'i1').accountId).toBe(keep.id);
    expect(records.has('transfer:t1')).toBe(false);
    expect(read('transfer', 't2').toAccountId).toBe(keep.id);
    expect(records.has(`bank_account:${dup.id}`)).toBe(false);
    expect(read('bank_account', keep.id).aliases).toEqual([{ bankId: 'melli', cardLast4: '1234', accountNumber: '' }]);
  });
});
