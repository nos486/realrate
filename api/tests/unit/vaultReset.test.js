/**
 * vaultReset.test.js — Forgotten E2EE passphrase: POST /api/vault/reset deletes the vault and every
 * financial record of the user (and nobody else's), after the confirmation and the account
 * password; records encrypted with a reset vault's key are refused afterwards
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = vi.hoisted(() => ({ user: null, account: null }));
vi.mock('../../src/lib/auth.js', () => ({
  getAuthenticatedUser: vi.fn(async () => auth.user),
}));
vi.mock('../../src/repositories/account.repository.js', () => ({
  dbGetUserAuthById: vi.fn(async () => auth.account),
}));

import { handleResetVault, VAULT_RESET_CONFIRM } from '../../src/handlers/vaultRoutes.js';
import { dbPutVaultRecord } from '../../src/repositories/vault.repository.js';
import { hashPassword } from '../../src/lib/security.js';

const CIPHER = 'enc:e2ee:v1:QUJDREVGR0g=';
const TABLES = [
  'portfolios', 'portfolio_holdings', 'transactions', 'loans', 'loan_installment_states', 'loan_extra_payments',
  'incomes', 'recurring_incomes', 'cheques', 'custom_banks', 'vault_records', 'vault_tombstones', 'user_vaults',
];

/** Rows per table, each with its user_id; deletes by user_id only */
function createDb() {
  const rows = Object.fromEntries(TABLES.map((t) => [t, [{ user_id: 'u1' }, { user_id: 'u2' }]]));
  const vaults = new Map([['u1', { salt: 's', wrappedKey: CIPHER, version: 1, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '' }]]);
  const db = {
    rows,
    vaults,
    prepare(sql) {
      const q = sql.replace(/\s+/g, ' ').trim();
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async run() {
          const del = q.match(/^DELETE FROM (\w+) WHERE user_id = \?$/);
          if (del) {
            rows[del[1]] = rows[del[1]].filter((r) => r.user_id !== args[0]);
            if (del[1] === 'user_vaults') vaults.delete(args[0]);
            return { meta: {} };
          }
          if (q.startsWith('DELETE FROM vault_tombstones') || q.startsWith('INSERT INTO vault_records')) return { meta: {} };
          if (q.startsWith('CREATE') || q.startsWith('ALTER')) return { meta: {} };
          throw new Error(`unexpected run: ${q}`);
        },
        async first() {
          if (q.includes('FROM user_vaults')) return vaults.get(args[0]) || null;
          return null;
        },
        async all() { return { results: [] }; },
      };
      return stmt;
    },
    async batch(stmts) {
      for (const s of stmts) await s.run();
    },
  };
  return db;
}

function kv() {
  const map = new Map();
  return {
    async get(k) { return map.get(k) ?? null; },
    async put(k, v) { map.set(k, v); },
    async delete(k) { map.delete(k); },
  };
}

const post = (body) => new Request('https://api.realrate.ir/api/vault/reset', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

let env;
beforeEach(() => {
  env = { DB: createDb(), CACHE: kv(), PRICE_CACHE: kv() };
  auth.user = { userId: 'u1', email: 'a@x.ir' };
  auth.account = { id: 'u1', passwordHash: '' };
});

describe('vault reset', () => {
  it('deletes the vault and all the user\'s data, nobody else\'s', async () => {
    const res = await handleResetVault(post({ confirm: VAULT_RESET_CONFIRM }), env);
    expect(res.status).toBe(200);
    for (const table of TABLES) {
      expect(env.DB.rows[table].map((r) => r.user_id)).toEqual(['u2']);
    }
    expect(env.DB.vaults.has('u1')).toBe(false);
  });

  it('needs the confirmation', async () => {
    await expect(handleResetVault(post({}), env)).rejects.toMatchObject({ statusCode: 400, code: 'CONFIRM_REQUIRED' });
    expect(env.DB.vaults.has('u1')).toBe(true);
  });

  it('an account with a password must give it', async () => {
    auth.account = { id: 'u1', passwordHash: await hashPassword('correct horse') };
    await expect(handleResetVault(post({ confirm: VAULT_RESET_CONFIRM, password: 'wrong' }), env))
      .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_PASSWORD' });
    expect(env.DB.vaults.has('u1')).toBe(true);
    const res = await handleResetVault(post({ confirm: VAULT_RESET_CONFIRM, password: 'correct horse' }), env);
    expect(res.status).toBe(200);
    expect(env.DB.vaults.has('u1')).toBe(false);
  });

  it('not for the demo account, nor signed out', async () => {
    auth.user = { userId: 'u1', kind: 'demo_edit' };
    await expect(handleResetVault(post({ confirm: VAULT_RESET_CONFIRM }), env)).rejects.toMatchObject({ statusCode: 403 });
    auth.user = null;
    await expect(handleResetVault(post({ confirm: VAULT_RESET_CONFIRM }), env)).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('records encrypted with a reset vault\'s key', () => {
  it('are refused once a new vault exists (a device that was offline)', async () => {
    const epoch = env.DB.vaults.get('u1').createdAt;
    await expect(dbPutVaultRecord(env, 'u1', 'income', 'inc_1', { payload: CIPHER, vaultEpoch: epoch })).resolves.toBeTruthy();
    env.DB.vaults.set('u1', { ...env.DB.vaults.get('u1'), createdAt: '2026-09-29T00:00:00.000Z' });
    // The next request (each request has its own database handle)
    const next = { ...env, DB: Object.create(env.DB) };
    await expect(dbPutVaultRecord(next, 'u1', 'income', 'inc_1', { payload: CIPHER, vaultEpoch: epoch }))
      .rejects.toMatchObject({ statusCode: 409, code: 'VAULT_CHANGED' });
    // Without an epoch (older clients): as before
    await expect(dbPutVaultRecord(next, 'u1', 'income', 'inc_1', { payload: CIPHER })).resolves.toBeTruthy();
  });
});
