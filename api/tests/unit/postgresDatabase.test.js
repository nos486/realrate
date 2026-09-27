/**
 * postgresDatabase.test.js — The app's database on Postgres: the repositories' SQL runs there
 * through one small interface, every request gets it, and the KV keys the app no longer uses
 * can be deleted
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import { translateSql, createPgDatabase } from '../../src/lib/pgDatabase.js';
import { withDatabase } from '../../src/lib/database.js';
import { deleteLegacyKvKeys, LEGACY_KV_KEYS } from '../../src/services/database/kvCleanup.js';
import { APP_TABLES, resetPgSchemaCache } from '../../src/repositories/pgSchema.js';
import { ensureSchema } from '../../src/repositories/migration.repository.js';

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

describe('createPgDatabase', () => {
  const fakeClient = (rows = [{ id: 'a', n: 1 }]) => {
    const client = {
      queries: [],
      connect: vi.fn(async () => {}),
      query: vi.fn(async (sql, params) => { client.queries.push([sql, params]); return { rows, rowCount: rows.length }; }),
      end: vi.fn(async () => {}),
    };
    return client;
  };

  it('answers first / all / run, and batches in one transaction', async () => {
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
  it('gives every request Postgres; without Hyperdrive the environment stays as it is', async () => {
    const { env, close } = withDatabase({ HYPERDRIVE: { connectionString: 'postgres://x' }, REALRATE_KV: {} });
    expect(env.DB.isPostgres).toBe(true);
    expect(typeof close).toBe('function');
    const injected = { prepare: vi.fn() };
    expect(withDatabase({ DB: injected }).env.DB).toBe(injected);
    await expect(withDatabase({}).close()).resolves.toBeUndefined();
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
    expect(LEGACY_KV_KEYS).toEqual(expect.arrayContaining(['database_backend', 'database_migration']));
  });
});

const PG_URL = process.env.PRICE_HISTORY_TEST_URL;

describe.skipIf(!PG_URL)('the app\'s tables on a real Postgres', () => {
  it('creates every table, and the repositories\' SQL reads and writes through the interface', async () => {
    const admin = new pg.Client({ connectionString: PG_URL });
    await admin.connect();
    for (const { name } of APP_TABLES) await admin.query(`DROP TABLE IF EXISTS ${name}`);
    await admin.end();
    resetPgSchemaCache();

    const { env, close } = withDatabase({ HYPERDRIVE: { connectionString: PG_URL } });
    await ensureSchema(env);
    const db = env.DB;
    await db.prepare('INSERT INTO users (id, email, name, role, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?)')
      .bind('u1', 'A@example.com', 'علی', 'user', '2026-01-01', '2026-09-01').run();
    await db.prepare('INSERT OR IGNORE INTO user_activity (user_id, day) VALUES (?, ?)').bind('u1', '2026-09-01').run();
    await db.prepare('INSERT OR IGNORE INTO user_activity (user_id, day) VALUES (?, ?)').bind('u1', '2026-09-01').run();
    await db.batch([
      db.prepare('INSERT INTO sessions (token, user_id, email, role, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind('t1', 'u1', 'a@example.com', 'user', 'c', 4102444800000),
      db.prepare('INSERT INTO incomes (id, user_id, title, amount, income_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind('i1', 'u1', 'حقوق', 45000000.5, '2026-09-01', 'c', 'u'),
    ]);

    expect(await db.prepare('SELECT name, created_at AS createdAt FROM users WHERE id = ?1').bind('u1').first())
      .toEqual({ name: 'علی', createdAt: '2026-01-01' });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM users WHERE email LIKE 'a@%'").first('n')).toBe(1);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM user_activity').first('n')).toBe(1);
    expect(await db.prepare('SELECT expires_at AS expiresAt FROM sessions WHERE token = ?').bind('t1').first())
      .toEqual({ expiresAt: 4102444800000 });
    expect(await db.prepare('SELECT amount FROM incomes WHERE id = ?').bind('i1').first('amount')).toBe(45000000.5);
    expect((await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()).run()).meta.changes).toBe(0);
    await close();
  });
});
