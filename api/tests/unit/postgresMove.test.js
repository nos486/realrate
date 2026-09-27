/**
 * postgresMove.test.js — The app on Postgres: SQL written for D1 runs there unchanged, the switch
 * is one KV value, and the move copies every table from D1 and only switches when all match
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import { translateSql, createPgDatabase } from '../../src/lib/pgDatabase.js';
import { withDatabase, forgetDatabaseBackend, DATABASE_BACKEND_KV_KEY } from '../../src/lib/database.js';
import { deleteLegacyKvKeys, LEGACY_KV_KEYS } from '../../src/services/database/kvCleanup.js';
import { runMigrationStep, MAINTENANCE_SETTLE_MS } from '../../src/services/database/d1ToPostgres.js';
import { APP_TABLES, resetPgSchemaCache } from '../../src/repositories/pgSchema.js';
import { ensureD1Tables } from '../../src/repositories/migration.repository.js';

/** A Worker KV namespace in memory (with list) */
function memoryKv(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    get: vi.fn(async (key, type) => {
      const v = store.has(key) ? store.get(key) : null;
      return v !== null && type === 'json' ? JSON.parse(v) : v;
    }),
    put: vi.fn(async (key, value) => { store.set(key, String(value)); }),
    delete: vi.fn(async (key) => { store.delete(key); }),
    list: vi.fn(async ({ prefix = '' } = {}) => ({
      keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })),
      list_complete: true,
    })),
  };
}

/** D1's interface over a real SQLite database */
function sqliteD1() {
  const db = new DatabaseSync(':memory:');
  const statement = (sql, params = []) => ({
    sql,
    params,
    bind: (...args) => statement(sql, args),
    async first(column) {
      const row = db.prepare(sql).get(...params) ?? null;
      return column ? (row?.[column] ?? null) : row;
    },
    async all() {
      return { success: true, results: db.prepare(sql).all(...params), meta: {} };
    },
    async run() {
      const res = db.prepare(sql).run(...params);
      return { success: true, meta: { changes: Number(res.changes) } };
    },
  });
  return { prepare: (sql) => statement(sql), batch: async (sts) => Promise.all(sts.map((s) => s.run())), sqlite: db };
}

describe('translateSql', () => {
  it('numbers placeholders, keeps literals, quotes camelCase aliases, LIKE ignores case', () => {
    expect(translateSql("SELECT user_id AS userId FROM t WHERE a = ? AND b LIKE ? AND c = 'is it?'"))
      .toBe("SELECT user_id AS \"userId\" FROM t WHERE a = $1 AND b ILIKE $2 AND c = 'is it?'");
    expect(translateSql('SELECT COUNT(*) AS activeSessions FROM s WHERE u = ?1 AND e > ?2 OR u = ?1'))
      .toBe('SELECT COUNT(*) AS "activeSessions" FROM s WHERE u = $1 AND e > $2 OR u = $1');
    expect(translateSql("SELECT 'AS fooBar LIKE' AS lower_case")).toBe("SELECT 'AS fooBar LIKE' AS lower_case");
  });

  it('rewrites the SQLite-only forms still in use', () => {
    expect(translateSql('INSERT OR IGNORE INTO a (x) VALUES (?)')).toBe('INSERT INTO a (x) VALUES ($1) ON CONFLICT DO NOTHING');
    expect(translateSql("UPDATE s SET t = datetime('now')")).toContain("to_char(now() AT TIME ZONE 'UTC'");
  });
});

describe('createPgDatabase (D1\'s interface)', () => {
  const fakeClient = (rows = [{ id: 'a', n: 1 }]) => {
    const client = {
      queries: [],
      connect: vi.fn(async () => {}),
      query: vi.fn(async (sql, params) => { client.queries.push([sql, params]); return { rows, rowCount: rows.length }; }),
      end: vi.fn(async () => {}),
    };
    return client;
  };

  it('answers first / all / run like D1, and batches in one transaction', async () => {
    const client = fakeClient();
    const db = createPgDatabase('postgres://x', { createClient: () => client });
    expect(await db.prepare('SELECT * FROM t WHERE id = ?').bind('a').first()).toEqual({ id: 'a', n: 1 });
    expect(await db.prepare('SELECT n FROM t').first('n')).toBe(1);
    expect((await db.prepare('SELECT * FROM t').all()).results).toHaveLength(1);
    expect((await db.prepare('DELETE FROM t').run()).meta.changes).toBe(1);
    await db.batch([db.prepare('UPDATE t SET n = ?').bind(2), db.prepare('DELETE FROM u')]);
    expect(client.queries.map(([sql]) => sql.split(' ')[0])).toEqual(['SELECT', 'SELECT', 'SELECT', 'DELETE', 'BEGIN', 'UPDATE', 'DELETE', 'COMMIT']);
    expect(client.queries[0]).toEqual(['SELECT * FROM t WHERE id = $1', ['a']]);
    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it('rolls a failed batch back', async () => {
    const client = fakeClient();
    client.query.mockImplementation(async (sql) => { if (sql.startsWith('DELETE')) throw new Error('boom'); return { rows: [], rowCount: 0 }; });
    const db = createPgDatabase('postgres://x', { createClient: () => client });
    await expect(db.batch([db.prepare('UPDATE t SET n = 1'), db.prepare('DELETE FROM u')])).rejects.toThrow('boom');
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('closes the connection once the request is done and nothing runs on it, reopening if needed', async () => {
    const clients = [];
    const db = createPgDatabase('postgres://x', { createClient: () => { const c = fakeClient(); clients.push(c); return c; } });
    await db.prepare('SELECT 1').first();
    await db.close();
    expect(clients[0].end).toHaveBeenCalledTimes(1);
    // Work still running after the response (waitUntil) gets a new connection, closed the same way
    await db.prepare('SELECT 1').first();
    await new Promise((r) => setTimeout(r, 0));
    expect(clients).toHaveLength(2);
    expect(clients[1].end).toHaveBeenCalledTimes(1);
  });
});

describe('withDatabase', () => {
  beforeEach(() => forgetDatabaseBackend());

  it('stays on D1 until the switch, then gives every request Postgres (and D1 as env.D1)', async () => {
    const d1 = { prepare: vi.fn() };
    const kv = memoryKv();
    const env = { DB: d1, REALRATE_KV: kv, HYPERDRIVE: { connectionString: 'postgres://x' } };
    let { env: e } = await withDatabase(env);
    expect(e.DB).toBe(d1);
    kv.store.set(DATABASE_BACKEND_KV_KEY, 'postgres');
    forgetDatabaseBackend();
    ({ env: e } = await withDatabase(env));
    expect(e.DB.isPostgres).toBe(true);
    expect(e.D1).toBe(d1);
  });

  it('never falls back to D1 once switched', async () => {
    forgetDatabaseBackend();
    const env = { DB: {}, REALRATE_KV: memoryKv({ [DATABASE_BACKEND_KV_KEY]: 'postgres' }) };
    await expect(withDatabase(env)).rejects.toThrow('HYPERDRIVE');
  });
});

describe('deleteLegacyKvKeys', () => {
  it('deletes the keys the app no longer uses, and only those', async () => {
    const kv = memoryKv({
      latest_rates: '{}',
      emofid_funds_v1: '[]',
      'source_price:src_def_usd': '{}',
      'source_items_backup:src_def_usd': '[]',
      'source_items_last_sync:src_def_usd': '1',
      prices: '{}',
      'source_items:src_def_usd': '[]',
      'session:abc': '{}',
      global_settings: '{}',
    });
    const { deleted } = await deleteLegacyKvKeys({ REALRATE_KV: kv });
    expect(deleted.sort()).toEqual(['emofid_funds_v1', 'latest_rates', 'source_items_backup:src_def_usd', 'source_items_last_sync:src_def_usd', 'source_price:src_def_usd']);
    expect([...kv.store.keys()].sort()).toEqual(['global_settings', 'prices', 'session:abc', 'source_items:src_def_usd']);
    expect(LEGACY_KV_KEYS).not.toContain('prices');
  });
});

const PG_URL = process.env.PRICE_HISTORY_TEST_URL;

describe.skipIf(!PG_URL)('moving D1 to a real Postgres', () => {
  it('copies every table, switches only when all counts match, and the data reads the same', async () => {
    // A fresh Postgres
    const admin = new pg.Client({ connectionString: PG_URL });
    await admin.connect();
    for (const { name } of APP_TABLES) await admin.query(`DROP TABLE IF EXISTS ${name}`);
    resetPgSchemaCache();
    forgetDatabaseBackend();

    // D1 with its real schema and some rows (Persian text, NULLs, fractions, ms timestamps)
    const d1 = sqliteD1();
    await ensureD1Tables({ DB: d1 });
    d1.sqlite.exec(`
      INSERT INTO users (id, email, name, role, created_at, last_login, home_layout) VALUES
        ('u1', 'a@example.com', 'علی', 'user', '2026-01-01', '2026-09-01', '{"sections":[]}'),
        ('u2', 'b@example.com', NULL, 'admin', '2026-02-01', '2026-09-02', '');
      INSERT INTO sessions (token, user_id, email, role, created_at, expires_at) VALUES ('t1', 'u1', 'a@example.com', 'user', '2026-09-01', 4102444800000);
      INSERT INTO incomes (id, user_id, title, amount, income_date, created_at, updated_at) VALUES ('i1', 'u1', 'حقوق', 45000000.5, '2026-09-01', 'c', 'u');
      INSERT INTO vault_records (user_id, kind, id, payload, record_date, created_at, updated_at) VALUES ('u1', 'loan', 'l1', 'enc:e2ee:v1:x', '2026-09-01', 'c', 'u');
    `);
    for (let i = 0; i < 450; i++) {
      d1.sqlite.prepare('INSERT INTO user_activity (user_id, day) VALUES (?, ?)').run('u1', `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + Math.floor(i / 12)).padStart(2, '0')}x${i}`);
    }

    const kv = memoryKv();
    const env = { DB: d1, REALRATE_KV: kv, HYPERDRIVE: { connectionString: PG_URL } };
    let clock = Date.parse('2026-09-27T00:00:00Z');
    const now = () => clock;

    // 1. Maintenance on; nothing copied until every Worker has seen it
    let res = await runMigrationStep(env, { now });
    expect(res.state.phase).toBe('waiting');
    expect(JSON.parse(kv.store.get('global_settings')).maintenance_mode).toBeTruthy();
    res = await runMigrationStep(env, { now });
    expect(res.state.phase).toBe('waiting');

    // 2–3. Copied (user_activity takes more than one page) and switched
    clock += MAINTENANCE_SETTLE_MS + 1;
    res = await runMigrationStep(env, { now });
    expect(res.state.phase).toBe('done');
    expect(res.backend).toBe('postgres');
    expect(kv.store.get(DATABASE_BACKEND_KV_KEY)).toBe('postgres');
    expect(res.state.counts.find((c) => c.table === 'user_activity')).toMatchObject({ d1: 450, postgres: 450, match: true });

    // The data reads the same through the app's interface
    const { env: onPg, close } = await withDatabase({ ...env, DB: d1 });
    expect(await onPg.DB.prepare('SELECT name, home_layout FROM users WHERE id = ?').bind('u1').first())
      .toEqual({ name: 'علی', home_layout: '{"sections":[]}' });
    expect(await onPg.DB.prepare('SELECT name FROM users WHERE id = ?').bind('u2').first('name')).toBeNull();
    expect(await onPg.DB.prepare('SELECT amount FROM incomes WHERE id = ?').bind('i1').first('amount')).toBe(45000000.5);
    expect(await onPg.DB.prepare('SELECT expires_at AS expiresAt FROM sessions WHERE token = ?').bind('t1').first())
      .toEqual({ expiresAt: 4102444800000 });
    expect(await onPg.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE email LIKE 'A@%'").first('n')).toBe(1);
    await close();

    // Once switched, another step does nothing
    res = await runMigrationStep(env, { now });
    expect(res.state.phase).toBe('done');
    await admin.end();
  });
});
