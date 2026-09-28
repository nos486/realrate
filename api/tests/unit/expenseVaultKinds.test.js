/**
 * expenseVaultKinds.test.js — expense sections and expenses are vault records open only to users
 * of the `expenses` feature (beta: admins); everyone else gets 404, as if they did not exist
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/auth.js', () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock('../../src/repositories/index.js', () => ({
  dbGetUserVault: vi.fn(),
  dbUserHasPlaintextData: vi.fn(),
  dbSaveUserVault: vi.fn(),
  dbListVaultRecords: vi.fn(async () => []),
  dbPutVaultRecord: vi.fn(async (_env, _user, kind, id) => ({ id, kind })),
  dbDeleteVaultRecord: vi.fn(async () => true),
  dbGetLoanDocument: vi.fn(),
}));

import { getAuthenticatedUser } from '../../src/lib/auth.js';
import * as repo from '../../src/repositories/index.js';
import { handleListVaultRecords, handlePutVaultRecord, handleDeleteVaultRecord } from '../../src/handlers/vaultRoutes.js';

const ADMIN = { userId: 'a1', role: 'admin' };
const USER = { userId: 'u1', role: 'user' };
const req = (method = 'GET', body) => new Request('https://api.realrate.ir/api/vault/records/expense', {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
});

describe('expense vault kinds', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['expense_group', 'expense'])('hides %s from a regular user with 404', async (kind) => {
    getAuthenticatedUser.mockResolvedValue(USER);
    await expect(handleListVaultRecords(req(), {}, { kind })).rejects.toMatchObject({ statusCode: 404 });
    await expect(handlePutVaultRecord(req('PUT', { payload: 'x' }), {}, { kind, id: 'e1' })).rejects.toMatchObject({ statusCode: 404 });
    await expect(handleDeleteVaultRecord(req('DELETE'), {}, { kind, id: 'e1' })).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.dbListVaultRecords).not.toHaveBeenCalled();
    expect(repo.dbPutVaultRecord).not.toHaveBeenCalled();
    expect(repo.dbDeleteVaultRecord).not.toHaveBeenCalled();
  });

  it('lets an admin store and list them, with the section as parent', async () => {
    getAuthenticatedUser.mockResolvedValue(ADMIN);
    const res = await handlePutVaultRecord(req('PUT', { payload: 'cipher', recordDate: '2026-09-28', parentId: 'grp_1' }), {}, { kind: 'expense', id: 'exp_1' });
    expect(res.status).toBe(200);
    expect(repo.dbPutVaultRecord).toHaveBeenCalledWith({}, 'a1', 'expense', 'exp_1', expect.objectContaining({ parentId: 'grp_1', recordDate: '2026-09-28' }));
    expect((await handleListVaultRecords(req(), {}, { kind: 'expense_group' })).status).toBe(200);
  });

  it('hides the accounts kind from a regular user and lets an admin use it', async () => {
    getAuthenticatedUser.mockResolvedValue(USER);
    await expect(handleListVaultRecords(req(), {}, { kind: 'bank_account' })).rejects.toMatchObject({ statusCode: 404 });
    getAuthenticatedUser.mockResolvedValue(ADMIN);
    expect((await handleListVaultRecords(req(), {}, { kind: 'bank_account' })).status).toBe(200);
  });

  it('leaves the other kinds as they were for regular users', async () => {
    getAuthenticatedUser.mockResolvedValue(USER);
    expect((await handleListVaultRecords(req(), {}, { kind: 'cheque' })).status).toBe(200);
  });
});
