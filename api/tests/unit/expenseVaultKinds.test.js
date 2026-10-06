/**
 * expenseVaultKinds.test.js — vault kinds that belong to a feature: expenses and accounts (both
 * generally available) are open to every signed-in user; a kind whose feature is off for a user
 * answers 404, as if it did not exist
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/auth.js', () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock('../../src/repositories/index.js', () => ({
  dbGetUserVault: vi.fn(),
  dbUserHasPlaintextData: vi.fn(),
  dbSaveUserVault: vi.fn(),
  dbListVaultRecords: vi.fn(async () => []),
  dbPutVaultRecord: vi.fn(async (_env, _user, kind, id) => ({ id, kind })),
  dbPutVaultRecords: vi.fn(async (_env, _user, kind, records) => records.map(({ id }) => ({ id, kind }))),
  dbDeleteVaultRecord: vi.fn(async () => true),
  dbGetLoanDocument: vi.fn(),
}));

import { getAuthenticatedUser } from '../../src/lib/auth.js';
import * as repo from '../../src/repositories/index.js';
import { handleListVaultRecords, handlePutVaultRecord, handlePutVaultRecords, handleDeleteVaultRecord } from '../../src/handlers/vaultRoutes.js';

const ADMIN = { userId: 'a1', role: 'admin' };
const USER = { userId: 'u1', role: 'user' };
const req = (method = 'GET', body) => new Request('https://api.realrate.ir/api/vault/records/expense', {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
});

describe('expense vault kinds', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['expense_group', 'expense'])('lets a regular user use %s now that expenses are public', async (kind) => {
    getAuthenticatedUser.mockResolvedValue(USER);
    expect((await handleListVaultRecords(req(), {}, { kind })).status).toBe(200);
    expect((await handlePutVaultRecord(req('PUT', { payload: 'x', parentId: 'grp_1' }), {}, { kind, id: 'e1' })).status).toBe(200);
    expect((await handleDeleteVaultRecord(req('DELETE'), {}, { kind, id: 'e1' })).status).toBe(200);
    expect(repo.dbPutVaultRecord).toHaveBeenCalledWith({}, 'u1', kind, 'e1', expect.anything());
  });

  it('stores several expenses in one request (moved to a project), with the vault epoch', async () => {
    getAuthenticatedUser.mockResolvedValue(USER);
    const records = [{ id: 'exp_1', payload: 'c1', parentId: 'grp_2' }, { id: 'exp_2', payload: 'c2', parentId: 'grp_2' }];
    const res = await handlePutVaultRecords(req('PUT', { records, vaultEpoch: 'v1' }), {}, { kind: 'expense' });
    expect(res.status).toBe(200);
    expect((await res.json()).records.map((r) => r.id)).toEqual(['exp_1', 'exp_2']);
    expect(repo.dbPutVaultRecords).toHaveBeenCalledWith({}, 'u1', 'expense', records, { vaultEpoch: 'v1' });
  });

  it('still requires a signed-in user', async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    await expect(handleListVaultRecords(req(), {}, { kind: 'expense' })).rejects.toMatchObject({ statusCode: 401 });
  });

  it('lets an admin store and list them, with the section as parent', async () => {
    getAuthenticatedUser.mockResolvedValue(ADMIN);
    const res = await handlePutVaultRecord(req('PUT', { payload: 'cipher', recordDate: '2026-09-28', parentId: 'grp_1' }), {}, { kind: 'expense', id: 'exp_1' });
    expect(res.status).toBe(200);
    expect(repo.dbPutVaultRecord).toHaveBeenCalledWith({}, 'a1', 'expense', 'exp_1', expect.objectContaining({ parentId: 'grp_1', recordDate: '2026-09-28' }));
    expect((await handleListVaultRecords(req(), {}, { kind: 'expense_group' })).status).toBe(200);
  });

  it('lets a regular user use accounts now that they are public', async () => {
    getAuthenticatedUser.mockResolvedValue(USER);
    expect((await handleListVaultRecords(req(), {}, { kind: 'bank_account' })).status).toBe(200);
  });

  it('answers 404 for a kind whose feature is off for the user', async () => {
    const features = await import('../../src/config/features.js');
    const { resetFeatureRulesMemo } = await import('../../src/lib/features.js');
    const saved = features.FEATURES.bank_accounts.stage;
    features.FEATURES.bank_accounts.stage = 'beta';
    resetFeatureRulesMemo();
    try {
      getAuthenticatedUser.mockResolvedValue(USER);
      await expect(handleListVaultRecords(req(), {}, { kind: 'bank_account' })).rejects.toMatchObject({ statusCode: 404 });
      getAuthenticatedUser.mockResolvedValue(ADMIN);
      expect((await handleListVaultRecords(req(), {}, { kind: 'bank_account' })).status).toBe(200);
    } finally {
      features.FEATURES.bank_accounts.stage = saved;
      resetFeatureRulesMemo();
    }
  });

  it('leaves the other kinds as they were for regular users', async () => {
    getAuthenticatedUser.mockResolvedValue(USER);
    expect((await handleListVaultRecords(req(), {}, { kind: 'cheque' })).status).toBe(200);
  });
});
