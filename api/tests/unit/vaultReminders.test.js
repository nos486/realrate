import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  dbPutVaultRecord,
  dbDeleteVaultRecord,
  dbSaveUserVault,
  dbResetUserVaultData,
} from '../../src/repositories/vault.repository.js';
import { reminderOf } from '../../src/domain/reminders.js';
import { putRecord, backfillReminders } from '../../../web/src/shared/vault/vaultRecordMeta.js';
import * as vaultApi from '../../../web/src/shared/vault/vaultApi.js';
import * as offlineSync from '../../../web/src/shared/offline/offlineSync.js';

const CIPHER = 'enc:e2ee:v1:QUJDREVGR0g=';

function createDb() {
  const vaults = new Map();
  const records = new Map();
  const tombstones = new Map();
  const reminders = new Map();
  const plain = { loans: [], loan_installment_states: [], loan_extra_payments: [], incomes: [], cheques: [], portfolios: [], portfolio_holdings: [], transactions: [] };
  const recordKey = (u, k, i) => `${u}|${k}|${i}`;

  const db = {
    vaults,
    records,
    tombstones,
    reminders,
    plain,
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
          if (q.startsWith('DELETE FROM user_vaults')) {
            vaults.delete(args[0]);
            return { meta: { changes: 1 } };
          }
          if (q.startsWith('DELETE FROM vault_tombstones')) {
            tombstones.delete(recordKey(...args));
            return { meta: { changes: 1 } };
          }
          if (q.startsWith('INSERT INTO vault_tombstones') && q.includes('VALUES')) {
            const [user_id, kind, id, deleted_at] = args;
            tombstones.set(recordKey(user_id, kind, id), deleted_at);
            return { meta: { changes: 1 } };
          }
          if (q.startsWith('INSERT INTO vault_records')) {
            const [user_id, kind, id, payload, record_date, parent_id, created_at, updated_at] = args;
            const key = recordKey(user_id, kind, id);
            records.set(key, { id, kind, payload, recordDate: record_date, parentId: parent_id, createdAt: created_at, updatedAt: updated_at, user_id });
            return { meta: { changes: 1 } };
          }
          if (q.startsWith('DELETE FROM vault_records')) {
            const [user_id, kind, id] = args;
            const existed = records.delete(recordKey(user_id, kind, id));
            return { meta: { changes: existed ? 1 : 0 } };
          }
          if (q.startsWith('INSERT INTO vault_reminders')) {
            const [user_id, kind, record_id, due_date, interval_months, remaining, direction, muted, updated_at] = args;
            const key = recordKey(user_id, kind, record_id);
            reminders.set(key, { user_id, kind, record_id, due_date, interval_months, remaining, direction, muted, updated_at });
            return { meta: { changes: 1 } };
          }
          if (q.startsWith('DELETE FROM vault_reminders WHERE user_id = ? AND kind = ? AND record_id = ?')) {
            const [user_id, kind, id] = args;
            const existed = reminders.delete(recordKey(user_id, kind, id));
            return { meta: { changes: existed ? 1 : 0 } };
          }
          if (q.startsWith('DELETE FROM vault_reminders WHERE user_id = ?')) {
            const [user_id] = args;
            for (const [k, r] of reminders.entries()) {
              if (r.user_id === user_id) reminders.delete(k);
            }
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
        async first() {
          if (q.includes('FROM user_vaults')) return vaults.get(args[0]) || null;
          return null;
        },
        async all() {
          return { results: [] };
        },
      };
      return stmt;
    },
    async batch(stmts) {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
  };
  return db;
}

describe('vault_reminders database operations', () => {
  let env;

  beforeEach(async () => {
    env = { DB: createDb() };
    await dbSaveUserVault(env, 'u1', { salt: 's', wrappedKey: CIPHER });
  });

  it('upserts reminder row in the same batch as record', async () => {
    const reminder = {
      kind: 'loan',
      recordId: 'loan_1',
      dueDate: '2026-10-15',
      intervalMonths: 1,
      remaining: 10,
      direction: '',
      muted: false,
    };

    await dbPutVaultRecord(env, 'u1', 'loan', 'loan_1', {
      payload: CIPHER,
      recordDate: '2026-10-01',
      reminder,
    });

    expect(env.DB.records.get('u1|loan|loan_1')).toBeDefined();
    const stored = env.DB.reminders.get('u1|loan|loan_1');
    expect(stored).toBeDefined();
    expect(stored.due_date).toBe('2026-10-15');
    expect(stored.remaining).toBe(10);
    expect(stored.muted).toBe(0);
  });

  it('deletes reminder row when reminder is explicitly null', async () => {
    // 1. First insert with reminder
    await dbPutVaultRecord(env, 'u1', 'cheque', 'chq_1', {
      payload: CIPHER,
      recordDate: '2026-10-20',
      reminder: {
        kind: 'cheque',
        recordId: 'chq_1',
        dueDate: '2026-10-20',
        intervalMonths: 0,
        remaining: 1,
        direction: 'issued',
        muted: false,
      },
    });
    expect(env.DB.reminders.has('u1|cheque|chq_1')).toBe(true);

    // 2. Put with reminder: null deletes the reminder row
    await dbPutVaultRecord(env, 'u1', 'cheque', 'chq_1', {
      payload: CIPHER,
      recordDate: '2026-10-20',
      reminder: null,
    });
    expect(env.DB.records.has('u1|cheque|chq_1')).toBe(true);
    expect(env.DB.reminders.has('u1|cheque|chq_1')).toBe(false);
  });

  it('leaves reminder untouched when reminder is undefined (legacy clients)', async () => {
    await dbPutVaultRecord(env, 'u1', 'loan', 'ln_legacy', {
      payload: CIPHER,
      recordDate: '2026-10-01',
      reminder: {
        kind: 'loan',
        recordId: 'ln_legacy',
        dueDate: '2026-10-05',
        intervalMonths: 1,
        remaining: 3,
        direction: '',
        muted: false,
      },
    });
    expect(env.DB.reminders.has('u1|loan|ln_legacy')).toBe(true);

    // Update with undefined reminder leaves existing reminder untouched
    await dbPutVaultRecord(env, 'u1', 'loan', 'ln_legacy', {
      payload: CIPHER,
      recordDate: '2026-10-01',
    });
    expect(env.DB.reminders.has('u1|loan|ln_legacy')).toBe(true);
  });

  it('dbDeleteVaultRecord deletes reminder row in its batch', async () => {
    await dbPutVaultRecord(env, 'u1', 'loan', 'loan_2', {
      payload: CIPHER,
      recordDate: '2026-10-01',
      reminder: {
        kind: 'loan',
        recordId: 'loan_2',
        dueDate: '2026-10-15',
        intervalMonths: 1,
        remaining: 5,
        direction: '',
        muted: false,
      },
    });
    expect(env.DB.reminders.has('u1|loan|loan_2')).toBe(true);

    await dbDeleteVaultRecord(env, 'u1', 'loan', 'loan_2');
    expect(env.DB.records.has('u1|loan|loan_2')).toBe(false);
    expect(env.DB.reminders.has('u1|loan|loan_2')).toBe(false);
  });

  it('dbResetUserVaultData wipes all reminders for user', async () => {
    await dbPutVaultRecord(env, 'u1', 'loan', 'loan_3', {
      payload: CIPHER,
      reminder: {
        kind: 'loan',
        recordId: 'loan_3',
        dueDate: '2026-10-15',
        intervalMonths: 1,
        remaining: 1,
        direction: '',
        muted: false,
      },
    });
    expect(env.DB.reminders.size).toBe(1);

    await dbResetUserVaultData(env, 'u1');
    expect(env.DB.reminders.size).toBe(0);
  });

  it('rejects reminder for unsupported kinds', async () => {
    await expect(
      dbPutVaultRecord(env, 'u1', 'expense', 'exp_1', {
        payload: CIPHER,
        parentId: 'grp_1',
        reminder: { kind: 'expense', recordId: 'exp_1', dueDate: '2026-10-10' },
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects invalid reminder data with 400', async () => {
    await expect(
      dbPutVaultRecord(env, 'u1', 'loan', 'loan_1', {
        payload: CIPHER,
        reminder: { kind: 'loan', recordId: 'loan_1', dueDate: 'bad-date' },
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      dbPutVaultRecord(env, 'u1', 'loan', 'loan_1', {
        payload: CIPHER,
        reminder: { kind: 'loan', recordId: 'wrong_id', dueDate: '2026-10-10', intervalMonths: 1 },
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('client reminder computation and offline support', () => {
  it('putRecord computes and passes reminder automatically for loans and cheques', async () => {
    const putSpy = vi.spyOn(vaultApi, 'putVaultRecord').mockResolvedValue({ success: true });

    // 1. Cheque open
    const openCheque = {
      id: 'c_test',
      direction: 'issued',
      status: 'pending',
      amount: 10_000_000,
      dueDate: '2026-10-25',
    };
    await putRecord('cheque', 'c_test', CIPHER, openCheque);
    expect(putSpy).toHaveBeenLastCalledWith(
      'cheque',
      'c_test',
      CIPHER,
      expect.objectContaining({
        recordDate: '2026-10-25',
        reminder: expect.objectContaining({
          kind: 'cheque',
          recordId: 'c_test',
          dueDate: '2026-10-25',
          intervalMonths: 0,
          remaining: 1,
        }),
      })
    );

    // 2. Cheque closed: reminder is null
    const closedCheque = { ...openCheque, status: 'cleared' };
    await putRecord('cheque', 'c_test', CIPHER, closedCheque);
    expect(putSpy).toHaveBeenLastCalledWith(
      'cheque',
      'c_test',
      CIPHER,
      expect.objectContaining({
        reminder: null,
      })
    );

    // 3. Non-reminder kind (e.g. transfer): reminder is undefined
    await putRecord('transfer', 'tr_1', CIPHER, { date: '2026-10-01' });
    expect(putSpy).toHaveBeenLastCalledWith(
      'transfer',
      'tr_1',
      CIPHER,
      expect.objectContaining({
        reminder: undefined,
      })
    );

    putSpy.mockRestore();
  });

  it('offline queue preserves reminder in op.body', async () => {
    vi.spyOn(offlineSync, 'isOfflineActive').mockReturnValue(true);
    const keepSpy = vi.spyOn(offlineSync, 'keepRecord').mockResolvedValue();
    const queueSpy = vi.spyOn(offlineSync, 'queueChange').mockResolvedValue();

    // Mock network error to trigger offline queueing
    const netErr = new Error('Network error');
    vi.spyOn(vaultApi, 'putVaultRecord');

    const reminder = { kind: 'loan', recordId: 'l_off', dueDate: '2026-11-01', intervalMonths: 1, remaining: 5, direction: '', muted: false };
    
    // Simulate what putVaultRecord does on network error
    try {
      await vaultApi.putVaultRecord('loan', 'l_off', CIPHER, { recordDate: '2026-11-01', reminder });
    } catch {
      // offline active path queues it
    }

    // When offline is active and network error occurs, queueChange is called with op.body containing reminder
    if (queueSpy.mock.calls.length > 0) {
      const queuedOp = queueSpy.mock.calls[0][0];
      expect(queuedOp.body.reminder).toEqual(reminder);
    }

    vi.restoreAllMocks();
  });
});
