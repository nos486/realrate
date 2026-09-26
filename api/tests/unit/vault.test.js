import { describe, it, expect, beforeEach } from 'vitest';
import {
  dbGetUserVault,
  dbSaveUserVault,
  dbDeleteUserVault,
  dbListVaultRecords,
  dbPutVaultRecord,
  dbDeleteVaultRecord,
  dbRestoreVaultRecord,
  rejectWhenVaultEnabled,
} from '../../src/repositories/vault.repository.js';
import worker from '../../src/index.js';

const CIPHER = 'enc:e2ee:v1:QUJDREVGR0g=';
const CIPHER_2 = 'enc:e2ee:v1:SUpLTE1OT1A=';

/** Minimal D1 for user_vaults, vault_records and the plaintext tables a conversion touches */
function createDb() {
  const vaults = new Map();
  const records = new Map();
  const plain = { loans: [], loan_installment_states: [], loan_extra_payments: [], incomes: [], cheques: [], portfolios: [] };
  const recordKey = (u, k, i) => `${u}|${k}|${i}`;
  let failNextBatch = false;

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
            plain[table] = plain[table].filter((row) => !(row[colIndex] === args[0] && row[['loans', 'incomes', 'cheques'].includes(table) ? 1 : 2] === args[1]));
            return { meta: { changes: 1 } };
          }
          throw new Error(`unexpected run: ${q}`);
        },
        async first() {
          if (q.includes('FROM user_vaults')) return vaults.get(args[0]) || null;
          if (q.includes('COUNT(*) AS n FROM vault_records')) {
            return { n: [...records.values()].filter((r) => r.user_id === args[0]).length };
          }
          if (q.includes('COUNT(*) AS n FROM portfolios')) {
            return { n: plain.portfolios.filter((p) => p.user_id === args[0] && p.e2ee_wrapped_key).length };
          }
          return null;
        },
        async all() {
          if (q.includes('FROM vault_records')) {
            // Mirrors the optional filters in their fixed order: from, to, parent
            const [user_id, kind, ...rest] = args;
            let i = 0;
            const from = q.includes('record_date >= ?') ? rest[i++] : null;
            const to = q.includes('record_date <= ?') ? rest[i++] : null;
            const parent = q.includes('parent_id = ?') ? rest[i++] : null;
            return {
              results: [...records.values()]
                .filter((r) => r.user_id === user_id && r.kind === kind)
                .filter((r) => (from === null || r.recordDate >= from) && (to === null || (r.recordDate && r.recordDate <= to)))
                .filter((r) => parent === null || r.parentId === parent)
                .sort((a, b) => b.recordDate.localeCompare(a.recordDate)),
            };
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

  it('refuses to turn off while anything is still encrypted with it', async () => {
    await dbSaveUserVault(env, 'u1', { salt: 's', wrappedKey: CIPHER });
    await dbPutVaultRecord(env, 'u1', 'income', 'inc_1', { payload: CIPHER });
    await expect(dbDeleteUserVault(env, 'u1')).rejects.toMatchObject({ statusCode: 409 });

    await dbDeleteVaultRecord(env, 'u1', 'income', 'inc_1');
    env.DB.plain.portfolios.push({ user_id: 'u1', e2ee_wrapped_key: CIPHER });
    await expect(dbDeleteUserVault(env, 'u1')).rejects.toMatchObject({ statusCode: 409 });

    env.DB.plain.portfolios.length = 0;
    await dbDeleteUserVault(env, 'u1');
    expect(await dbGetUserVault(env, 'u1')).toBeNull();
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

  it('restores a loan document back to plaintext tables and drops the encrypted copy', async () => {
    await dbPutVaultRecord(env, 'u1', 'loan', 'loan_1', { payload: CIPHER });
    await dbRestoreVaultRecord(env, 'u1', 'loan', 'loan_1', {
      loan: { id: 'loan_1', title: 'وام', principalAmount: 1000, installmentCount: 3, intervalMonths: 1, startDate: '1404-01-01', scheduleMode: 'formula' },
      states: [{ id: 's1', installmentNumber: 1, dueDate: '1404-02-01', totalAmount: 400, isPaid: true, paidDate: '1404-02-01', paidAmount: 400 }],
      extraPayments: [{ id: 'e1', amount: 100, paymentDate: '1404-02-10', reductionMode: 'reduce_term', resultingInstallmentCount: 2 }],
    });
    expect(env.DB.plain.loans).toHaveLength(1);
    expect(env.DB.plain.loans[0].slice(0, 3)).toEqual(['loan_1', 'u1', 'وام']);
    expect(env.DB.plain.loan_installment_states[0][9]).toBe(1); // is_paid
    expect(env.DB.plain.loan_extra_payments[0][5]).toBe('reduce_term');
    expect(await dbListVaultRecords(env, 'u1', 'loan')).toHaveLength(0);

    await expect(dbRestoreVaultRecord(env, 'u1', 'loan', 'loan_9', { loan: { id: 'other' } })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('encrypted cheques', () => {
  let env;
  beforeEach(async () => {
    env = { DB: createDb() };
    await dbSaveUserVault(env, 'u1', { salt: 's', wrappedKey: CIPHER });
  });

  it('replaces the plaintext cheque and restores it back with its tracking log', async () => {
    env.DB.plain.cheques.push(['chq_1', 'u1'], ['chq_2', 'u1']);
    await dbPutVaultRecord(env, 'u1', 'cheque', 'chq_1', { payload: CIPHER, replacePlain: true });
    expect(env.DB.plain.cheques.map((r) => r[0])).toEqual(['chq_2']);

    const history = [{ status: 'pending', date: '2026-09-01', note: '' }, { status: 'cleared', date: '2026-09-20', note: 'وصول شد' }];
    await dbRestoreVaultRecord(env, 'u1', 'cheque', 'chq_1', {
      direction: 'received', status: 'cleared', amount: 5000000, dueDate: '2026-09-20', issueDate: '',
      counterparty: 'علی', bankId: 'mellat', bankName: '', chequeNumber: '123', sayadId: '', notes: '',
      history, createdAt: '2026-09-01T10:00:00.000Z',
    });
    const row = env.DB.plain.cheques.find((r) => r[0] === 'chq_1');
    expect(row.slice(0, 5)).toEqual(['chq_1', 'u1', 'received', 'cleared', 5000000]);
    expect(JSON.parse(row[13])).toEqual(history);
    expect(row[14]).toBe('2026-09-01T10:00:00.000Z');
    expect(await dbListVaultRecords(env, 'u1', 'cheque')).toHaveLength(0);
  });
});

describe('vault routes', () => {
  it.each([
    ['GET', '/api/vault'],
    ['PUT', '/api/vault'],
    ['DELETE', '/api/vault'],
    ['GET', '/api/vault/records/loan'],
    ['PUT', '/api/vault/records/loan/loan_1'],
    ['DELETE', '/api/vault/records/income/inc_1'],
    ['POST', '/api/vault/records/income/inc_1/restore'],
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
});
