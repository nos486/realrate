import { describe, it, expect, beforeEach } from 'vitest';
import {
  dbGetUserVault,
  dbSaveUserVault,
  dbListVaultRecords,
  dbPutVaultRecord,
  dbDeleteVaultRecord,
  rejectWhenVaultEnabled,
  dbUserHasPlaintextData,
} from '../../src/repositories/vault.repository.js';
import worker from '../../src/index.js';

const CIPHER = 'enc:e2ee:v1:QUJDREVGR0g=';
const CIPHER_2 = 'enc:e2ee:v1:SUpLTE1OT1A=';

/** Minimal D1 for user_vaults, vault_records and the plaintext tables a conversion touches */
function createDb() {
  const vaults = new Map();
  const records = new Map();
  const plain = { loans: [], loan_installment_states: [], loan_extra_payments: [], incomes: [], cheques: [], portfolios: [], portfolio_holdings: [], transactions: [] };
  const recordKey = (u, k, i) => `${u}|${k}|${i}`;
  let failNextBatch = false;

  /** vault_records rows a list query selects (its optional filters come in a fixed order) */
  const matching = (q, args) => {
    const [user_id, kind, ...rest] = args;
    let i = 0;
    const from = q.includes('record_date >= ?') ? rest[i++] : null;
    const to = q.includes('record_date <= ?') ? rest[i++] : null;
    const parent = q.includes('parent_id = ?') ? rest[i++] : null;
    const undated = q.includes("record_date = '' OR record_date < '1700'");
    const dir = q.includes('record_date ASC') ? 1 : -1;
    return [...records.values()]
      .filter((r) => r.user_id === user_id && r.kind === kind)
      .filter((r) => (from === null || r.recordDate >= from) && (to === null || (r.recordDate && r.recordDate <= to)))
      .filter((r) => parent === null || r.parentId === parent)
      .filter((r) => !undated || r.recordDate === '' || r.recordDate < '1700')
      .sort((a, b) => dir * (a.recordDate.localeCompare(b.recordDate) || a.createdAt.localeCompare(b.createdAt)));
  };

  const db = {
    vaults, records, plain,
    failNextBatch() { failNextBatch = true; },
    prepare(sql) {
      const q = sql.replace(/\s+/g, ' ').trim();
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async run() {
          if (q.startsWith('CREATE') || q.startsWith('ALTER') || q.startsWith('DROP')) return { meta: {} };
          if (q.startsWith('INSERT INTO user_vaults')) {
            const [user_id, salt, wrapped_key, created_at, updated_at] = args;
            vaults.set(user_id, { salt, wrappedKey: wrapped_key, version: 1, createdAt: created_at, updatedAt: updated_at });
            return { meta: { changes: 1 } };
          }
          if (q.startsWith('UPDATE user_vaults')) {
            const [salt, wrapped_key, updated_at, user_id] = args;
            vaults.set(user_id, { ...vaults.get(user_id), salt, wrappedKey: wrapped_key, updatedAt: updated_at });
            return { meta: { changes: 1 } };
          }
          if (q.startsWith('DELETE FROM user_vaults')) {
            vaults.delete(args[0]);
            return { meta: { changes: 1 } };
          }
          if (q.startsWith('INSERT INTO vault_records')) {
            const [user_id, kind, id, payload, record_date, parent_id, created_at, updated_at] = args;
            const key = recordKey(user_id, kind, id);
            const prev = records.get(key);
            records.set(key, { id, kind, payload, recordDate: record_date, parentId: parent_id, createdAt: prev?.createdAt || created_at, updatedAt: updated_at, user_id });
            return { meta: { changes: 1 } };
          }
          if (q.startsWith('DELETE FROM vault_records')) {
            const [user_id, kind, id] = args;
            const existed = records.delete(recordKey(user_id, kind, id));
            return { meta: { changes: existed ? 1 : 0 } };
          }
          const insert = q.match(/^INSERT INTO (\w+)/);
          if (insert) {
            plain[insert[1]].push(args);
            return { meta: { changes: 1 } };
          }
          const del = q.match(/^DELETE FROM (\w+) WHERE (\w+) = \? AND user_id = \?/);
          if (del) {
            const [table, col] = [del[1], del[2]];
            const colIndex = { id: 0, loan_id: 1 }[col];
            plain[table] = plain[table].filter((row) => !(row[colIndex] === args[0] && row[['loans', 'incomes', 'cheques', 'portfolio_holdings', 'transactions'].includes(table) ? 1 : 2] === args[1]));
            return { meta: { changes: 1 } };
          }
          throw new Error(`unexpected run: ${q}`);
        },
        async first() {
          if (q.includes('FROM user_vaults')) return vaults.get(args[0]) || null;
          if (q.includes('COUNT(*) AS n FROM vault_records')) {
            return { n: q.includes('kind = ?') ? matching(q, args).length : [...records.values()].filter((r) => r.user_id === args[0]).length };
          }
          if (q.includes('EXISTS (SELECT 1 FROM')) {
            const tables = [...q.matchAll(/FROM (\w+) WHERE/g)].map((m) => m[1]);
            return { has: tables.some((t) => (plain[t] || []).some((row) => row[1] === args[0])) ? 1 : 0 };
          }
          if (q.includes('COUNT(*) AS n FROM portfolios')) {
            return { n: plain.portfolios.filter((p) => p.user_id === args[0] && p.e2ee_wrapped_key).length };
          }
          return null;
        },
        async all() {
          if (q.includes('FROM vault_records')) {
            const rows = matching(q, args);
            const page = q.includes('LIMIT ? OFFSET ?') ? args.slice(-2) : null;
            return { results: page ? rows.slice(page[1], page[1] + page[0]) : rows };
          }
          return { results: [] };
        },
      };
      return stmt;
    },
    async batch(stmts) {
      if (failNextBatch) {
        failNextBatch = false;
        throw new Error('D1 batch failed');
      }
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
  };
  return db;
}

describe('account vault', () => {
  let env;
  beforeEach(() => { env = { DB: createDb() }; });

  it('turns on, and re-wraps only against the key it replaces', async () => {
    expect(await dbGetUserVault(env, 'u1')).toBeNull();
    await dbSaveUserVault(env, 'u1', { salt: 'c2FsdA==', wrappedKey: CIPHER });
    expect((await dbGetUserVault(env, 'u1')).wrappedKey).toBe(CIPHER);

    await expect(dbSaveUserVault(env, 'u1', { salt: 'bmV3', wrappedKey: CIPHER_2, previousWrappedKey: 'stale' }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect((await dbGetUserVault(env, 'u1')).wrappedKey).toBe(CIPHER);

    await dbSaveUserVault(env, 'u1', { salt: 'bmV3', wrappedKey: CIPHER_2, previousWrappedKey: CIPHER });
    expect(await dbGetUserVault(env, 'u1')).toMatchObject({ salt: 'bmV3', wrappedKey: CIPHER_2 });
  });

  it('never stores a key that is not ciphertext', async () => {
    await expect(dbSaveUserVault(env, 'u1', { salt: 's', wrappedKey: 'raw-key' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(dbSaveUserVault(env, 'u1', { salt: '', wrappedKey: CIPHER })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('tells whether an account without the vault already has data', async () => {
    expect(await dbUserHasPlaintextData(env, 'u1')).toBe(false);
    env.DB.plain.incomes.push(['inc_1', 'u2']);
    expect(await dbUserHasPlaintextData(env, 'u1')).toBe(false);
    env.DB.plain.transactions.push(['tx_1', 'u1']);
    expect(await dbUserHasPlaintextData(env, 'u1')).toBe(true);
  });

  it('blocks plaintext creates only while the vault is on', async () => {
    await expect(rejectWhenVaultEnabled(env, 'u1')).resolves.toBeUndefined();
    await dbSaveUserVault(env, 'u1', { salt: 's', wrappedKey: CIPHER });
    await expect(rejectWhenVaultEnabled(env, 'u1')).rejects.toMatchObject({ statusCode: 409 });
    await expect(rejectWhenVaultEnabled(env, 'u2')).resolves.toBeUndefined();
  });
});

describe('vault records', () => {
  let env;
  beforeEach(async () => {
    env = { DB: createDb() };
    await dbSaveUserVault(env, 'u1', { salt: 's', wrappedKey: CIPHER });
  });

  it('stores only ciphertext, per user and kind', async () => {
    await expect(dbPutVaultRecord(env, 'u1', 'loan', 'loan_1', { payload: '{"amount":1}' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(dbPutVaultRecord(env, 'u1', 'secret', 'x', { payload: CIPHER })).rejects.toMatchObject({ statusCode: 400 });
    await expect(dbPutVaultRecord(env, 'u1', 'loan', '../x', { payload: CIPHER })).rejects.toMatchObject({ statusCode: 400 });
    await expect(dbPutVaultRecord(env, 'u2', 'loan', 'loan_1', { payload: CIPHER })).rejects.toMatchObject({ statusCode: 409 });

    await dbPutVaultRecord(env, 'u1', 'loan', 'loan_1', { payload: CIPHER });
    await dbPutVaultRecord(env, 'u1', 'loan', 'loan_1', { payload: CIPHER_2 });
    const list = await dbListVaultRecords(env, 'u1', 'loan');
    expect(list).toHaveLength(1);
    expect(list[0].payload).toBe(CIPHER_2);
    expect(await dbListVaultRecords(env, 'u1', 'income')).toHaveLength(0);
  });

  it('keeps one plaintext date and parent beside the ciphertext, and filters on them', async () => {
    await expect(dbPutVaultRecord(env, 'u1', 'income', 'inc_x', { payload: CIPHER, recordDate: '2026-13-40' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(dbPutVaultRecord(env, 'u1', 'income', 'inc_x', { payload: CIPHER, recordDate: '1405/07/01' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(dbPutVaultRecord(env, 'u1', 'income', 'inc_x', { payload: CIPHER, parentId: '../p' })).rejects.toMatchObject({ statusCode: 400 });

    await dbPutVaultRecord(env, 'u1', 'income', 'inc_1', { payload: CIPHER, recordDate: '2026-03-21' });
    await dbPutVaultRecord(env, 'u1', 'income', 'inc_2', { payload: CIPHER, recordDate: '2026-06-01' });
    await dbPutVaultRecord(env, 'u1', 'income', 'inc_3', { payload: CIPHER });
    const all = await dbListVaultRecords(env, 'u1', 'income');
    expect(all.map((r) => r.id)).toEqual(['inc_2', 'inc_1', 'inc_3']);
    expect(all[0]).toMatchObject({ recordDate: '2026-06-01', parentId: '' });

    const spring = await dbListVaultRecords(env, 'u1', 'income', { from: '2026-03-01', to: '2026-05-31' });
    expect(spring.map((r) => r.id)).toEqual(['inc_1']);
    await expect(dbListVaultRecords(env, 'u1', 'income', { from: 'yesterday' })).rejects.toMatchObject({ statusCode: 400 });

    await dbPutVaultRecord(env, 'u1', 'income', 'inc_1', { payload: CIPHER_2, recordDate: '2026-03-22', parentId: 'p_1' });
    const byParent = await dbListVaultRecords(env, 'u1', 'income', { parentId: 'p_1' });
    expect(byParent).toEqual([expect.objectContaining({ id: 'inc_1', payload: CIPHER_2, recordDate: '2026-03-22' })]);
  });

  it('pages records by date, oldest or newest first, with the total matching', async () => {
    const days = ['2026-01-05', '2026-02-05', '2026-03-05', '2026-04-05', '2026-05-05'];
    for (const [i, day] of days.entries()) {
      await dbPutVaultRecord(env, 'u1', 'income', `inc_${i}`, { payload: CIPHER, recordDate: day });
    }
    await dbPutVaultRecord(env, 'u1', 'income', 'inc_old', { payload: CIPHER });
    await dbPutVaultRecord(env, 'u1', 'income', 'inc_shamsi', { payload: CIPHER, recordDate: '1404-02-01' });

    const first = await dbListVaultRecords(env, 'u1', 'income', { from: '2026-02-01', limit: 2 });
    expect(first.total).toBe(4);
    expect(first.records.map((r) => r.id)).toEqual(['inc_4', 'inc_3']);
    const second = await dbListVaultRecords(env, 'u1', 'income', { from: '2026-02-01', limit: 2, offset: 2 });
    expect(second.records.map((r) => r.id)).toEqual(['inc_2', 'inc_1']);
    const oldest = await dbListVaultRecords(env, 'u1', 'income', { order: 'asc', limit: 1, from: '2026-01-01' });
    expect(oldest.records.map((r) => r.id)).toEqual(['inc_0']);

    const undated = await dbListVaultRecords(env, 'u1', 'income', { undated: true });
    expect(undated.map((r) => r.id).sort()).toEqual(['inc_old', 'inc_shamsi']);

    await expect(dbListVaultRecords(env, 'u1', 'income', { limit: 0 })).rejects.toMatchObject({ statusCode: 400 });
    await expect(dbListVaultRecords(env, 'u1', 'income', { limit: 500 })).rejects.toMatchObject({ statusCode: 400 });
    await expect(dbListVaultRecords(env, 'u1', 'income', { limit: 10, offset: -1 })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('encrypting an existing record removes its plaintext in the same batch', async () => {
    env.DB.plain.loans.push(['loan_1', 'u1']);
    env.DB.plain.loan_installment_states.push(['s1', 'loan_1', 'u1']);
    env.DB.plain.loan_extra_payments.push(['e1', 'loan_1', 'u1']);
    env.DB.plain.loans.push(['loan_2', 'u1']);

    env.DB.failNextBatch();
    await expect(dbPutVaultRecord(env, 'u1', 'loan', 'loan_1', { payload: CIPHER, replacePlain: true })).rejects.toThrow();
    expect(env.DB.plain.loans).toHaveLength(2);
    expect(await dbListVaultRecords(env, 'u1', 'loan')).toHaveLength(0);

    await dbPutVaultRecord(env, 'u1', 'loan', 'loan_1', { payload: CIPHER, replacePlain: true });
    expect(env.DB.plain.loans.map((r) => r[0])).toEqual(['loan_2']);
    expect(env.DB.plain.loan_installment_states).toHaveLength(0);
    expect(env.DB.plain.loan_extra_payments).toHaveLength(0);
  });

});

describe('encrypted cheques', () => {
  let env;
  beforeEach(async () => {
    env = { DB: createDb() };
    await dbSaveUserVault(env, 'u1', { salt: 's', wrappedKey: CIPHER });
  });

  it('replaces the plaintext cheque in the same batch', async () => {
    env.DB.plain.cheques.push(['chq_1', 'u1'], ['chq_2', 'u1']);
    await dbPutVaultRecord(env, 'u1', 'cheque', 'chq_1', { payload: CIPHER, replacePlain: true });
    expect(env.DB.plain.cheques.map((r) => r[0])).toEqual(['chq_2']);
  });
});

describe('encrypted portfolio items', () => {
  let env;
  beforeEach(async () => {
    env = { DB: createDb() };
    await dbSaveUserVault(env, 'u1', { salt: 's', wrappedKey: CIPHER });
  });

  it('keeps holdings and transactions under their portfolio, and dated', async () => {
    await expect(dbPutVaultRecord(env, 'u1', 'holding', 'h_1', { payload: CIPHER })).rejects.toMatchObject({ statusCode: 400 });

    env.DB.plain.portfolio_holdings.push(['h_1', 'u1'], ['h_2', 'u1']);
    env.DB.plain.transactions.push(['tx_1', 'u1']);
    await dbPutVaultRecord(env, 'u1', 'holding', 'h_1', { payload: CIPHER, recordDate: '2025-01-01', parentId: 'p_1', replacePlain: true });
    await dbPutVaultRecord(env, 'u1', 'transaction', 'tx_1', { payload: CIPHER, recordDate: '2025-04-21', parentId: 'p_1', replacePlain: true });
    expect(env.DB.plain.portfolio_holdings.map((r) => r[0])).toEqual(['h_2']);
    expect(env.DB.plain.transactions).toHaveLength(0);
    expect(await dbListVaultRecords(env, 'u1', 'holding', { parentId: 'p_1' })).toEqual([
      expect.objectContaining({ id: 'h_1', recordDate: '2025-01-01', parentId: 'p_1' }),
    ]);
    expect(await dbListVaultRecords(env, 'u1', 'holding', { parentId: 'p_2' })).toHaveLength(0);

  });
});

describe('vault routes', () => {
  it.each([
    ['GET', '/api/vault'],
    ['PUT', '/api/vault'],
    ['GET', '/api/vault/records/loan'],
    ['PUT', '/api/vault/records/loan/loan_1'],
    ['DELETE', '/api/vault/records/income/inc_1'],
    ['GET', '/api/vault/records/cheque'],
    ['GET', '/api/cheques'],
    ['POST', '/api/cheques'],
    ['PUT', '/api/cheques/chq_1'],
    ['DELETE', '/api/cheques/chq_1'],
    ['GET', '/api/loans/loan_1/document'],
  ])('%s %s requires a signed-in user', async (method, path) => {
    const res = await worker.fetch(new Request(`https://api.realrate.ir${path}`, { method }), {}, {});
    expect(res.status).toBe(401);
  });

  it.each([
    ['DELETE', '/api/vault'],
    ['POST', '/api/vault/records/income/inc_1/restore'],
  ])('%s %s is gone: encryption cannot be turned off', async (method, path) => {
    const res = await worker.fetch(new Request(`https://api.realrate.ir${path}`, { method }), {}, {});
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('ENCRYPTION_MANDATORY');
  });
});
