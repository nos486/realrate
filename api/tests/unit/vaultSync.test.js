/**
 * vaultSync.test.js — Incremental sync of encrypted records (GET /api/vault/sync): every change
 * after a cursor, stored and deleted, page by page, for devices keeping a copy (offline app)
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { resetD1SchemaCache } from '../../src/repositories/d1Schema.js';
import { sqliteD1 } from '../helpers/sqliteD1.js';
import { ensureSchema } from '../../src/repositories/schema.repository.js';
import {
  parseSyncCursor,
  dbSaveUserVault,
  dbPutVaultRecord,
  dbDeleteVaultRecord,
  dbSyncVaultRecords,
  vaultTombstoneParentStatements,
  VAULT_RECORD_KINDS,
  VAULT_TOMBSTONE_RETENTION_DAYS,
} from '../../src/repositories/vault.repository.js';

const CIPHER = (n) => `enc:e2ee:v1:${n}`;

describe('sync cursor', () => {
  it('reads "time|kind|id", empty = from the start', () => {
    expect(parseSyncCursor('')).toBeNull();
    expect(parseSyncCursor('2026-09-01T10:00:00.000Z|income|inc_1')).toEqual({ time: '2026-09-01T10:00:00.000Z', kind: 'income', id: 'inc_1' });
    expect(parseSyncCursor('2026-09-01T10:00:00.000Z||')).toEqual({ time: '2026-09-01T10:00:00.000Z', kind: '', id: '' });
  });

  it('refuses anything else', () => {
    expect(() => parseSyncCursor('yesterday|income|x')).toThrow();
    expect(() => parseSyncCursor('2026-09-01T10:00:00.000Z|users|x')).toThrow();
    expect(() => parseSyncCursor("2026-09-01T10:00:00.000Z|income|x';--")).toThrow();
  });
});

describe('sync route', () => {
  it('asks only for the kinds the user may see', async () => {
    vi.resetModules();
    const sync = vi.fn(async () => ({ epoch: 'e', records: [], deleted: [], cursor: '', more: false }));
    vi.doMock('../../src/lib/auth.js', () => ({ getAuthenticatedUser: async () => ({ id: 'u1', role: 'user' }) }));
    vi.doMock('../../src/config/features.js', async (orig) => ({ ...(await orig()), isFeatureEnabled: (key) => key !== 'expenses' }));
    vi.doMock('../../src/repositories/vault.repository.js', async (orig) => ({ ...(await orig()), dbSyncVaultRecords: sync }));
    const { handleSyncVaultRecords } = await import('../../src/handlers/vaultRoutes.js');
    const res = await handleSyncVaultRecords(new Request('https://api/api/vault/sync?cursor=&limit=50'), {});
    expect(res.status).toBe(200);
    const [, userId, opts] = sync.mock.calls[0];
    expect(userId).toBe('u1');
    expect(opts.limit).toBe('50');
    expect(opts.kinds).toContain('income');
    expect(opts.kinds).not.toContain('expense');
    expect(opts.kinds).not.toContain('expense_group');
    vi.doUnmock('../../src/lib/auth.js');
    vi.doUnmock('../../src/config/features.js');
    vi.doUnmock('../../src/repositories/vault.repository.js');
  });
});

describe('sync on real SQLite (D1)', () => {
  let env;
  const kinds = VAULT_RECORD_KINDS;
  const sync = (cursor = '', limit) => dbSyncVaultRecords(env, 'u1', { cursor, limit, kinds });
  const all = async (cursor = '', limit = 2) => {
    const out = { records: [], deleted: [], pages: 0 };
    let res;
    do {
      res = await sync(cursor, limit);
      out.records.push(...res.records);
      out.deleted.push(...res.deleted);
      out.pages++;
      cursor = res.cursor;
    } while (res.more && out.pages < 50);
    return { ...out, cursor, epoch: res.epoch };
  };
  const tick = () => new Promise((r) => setTimeout(r, 5));

  beforeAll(async () => {
    resetD1SchemaCache();
    env = { DB: sqliteD1() };
    await ensureSchema(env);
    await dbSaveUserVault(env, 'u1', { salt: 's', wrappedKey: CIPHER('key') });
    await dbSaveUserVault(env, 'u2', { salt: 's', wrappedKey: CIPHER('key2') });
  });
  afterAll(() => env.DB.close());

  it('from the start: every record, in pages, no deletions', async () => {
    for (const [i, kind] of [['1', 'income'], ['2', 'expense'], ['3', 'bank_account'], ['4', 'income'], ['5', 'cheque']]) {
      await dbPutVaultRecord(env, 'u1', kind, `r${i}`, { payload: CIPHER(i), recordDate: '2026-09-0' + i, parentId: kind === 'expense' ? 'exg_1' : '' });
      await tick();
    }
    await dbPutVaultRecord(env, 'u2', 'income', 'other', { payload: CIPHER('x') });
    const res = await all('', 2);
    expect(res.records.map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
    expect(res.pages).toBe(3);
    expect(res.deleted).toEqual([]);
    expect(res.records[1]).toMatchObject({ kind: 'expense', payload: CIPHER('2'), recordDate: '2026-09-02', parentId: 'exg_1' });
    // Enough to list them on the device exactly as the server does (date, then creation)
    expect(res.records[1].createdAt).toBeTruthy();
    expect(res.records[1].updatedAt).toBeTruthy();
    expect(res.epoch).toBeTruthy();
  });

  it('after a cursor: only what changed — updates and deletions, in order', async () => {
    const { cursor } = await all('', 50);
    await dbPutVaultRecord(env, 'u1', 'income', 'r1', { payload: CIPHER('1b'), recordDate: '2026-09-01' });
    await tick();
    expect(await dbDeleteVaultRecord(env, 'u1', 'cheque', 'r5')).toBe(true);
    const res = await all(cursor, 50);
    expect(res.records.map((r) => [r.id, r.payload])).toEqual([['r1', CIPHER('1b')]]);
    expect(res.deleted.map((d) => [d.kind, d.id])).toEqual([['cheque', 'r5']]);
    // Nothing new: an empty page, same cursor
    const again = await sync(res.cursor);
    expect(again).toMatchObject({ records: [], deleted: [], more: false, cursor: res.cursor });
  });

  it('a record stored again after its deletion is no longer deleted', async () => {
    const { cursor } = await all('', 50);
    await dbPutVaultRecord(env, 'u1', 'cheque', 'r5', { payload: CIPHER('5b') });
    const res = await all(cursor, 50);
    expect(res.records.map((r) => r.id)).toEqual(['r5']);
    expect(res.deleted).toEqual([]);
  });

  it('only the kinds asked for', async () => {
    const res = await dbSyncVaultRecords(env, 'u1', { cursor: '', kinds: ['income'] });
    expect(new Set(res.records.map((r) => r.kind))).toEqual(new Set(['income']));
  });

  it('deleting a portfolio\'s items leaves tombstones', async () => {
    await dbPutVaultRecord(env, 'u1', 'holding', 'h1', { payload: CIPHER('h'), parentId: 'pf_1' });
    const { cursor } = await all('', 50);
    await tick();
    await env.DB.batch([
      ...vaultTombstoneParentStatements(env, 'u1', 'pf_1', ['holding', 'transaction']),
      env.DB.prepare(`DELETE FROM vault_records WHERE user_id = ? AND parent_id = ? AND kind IN ('holding', 'transaction')`).bind('u1', 'pf_1'),
    ]);
    const res = await all(cursor, 50);
    expect(res.deleted.map((d) => d.id)).toEqual(['h1']);
  });

  it('a cursor older than the kept tombstones starts over', async () => {
    const old = new Date(Date.now() - (VAULT_TOMBSTONE_RETENTION_DAYS + 1) * 86_400_000).toISOString();
    expect(await sync(`${old}||`)).toMatchObject({ reset: true, cursor: '', records: [] });
  });
});
