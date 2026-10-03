/**
 * pgMigration.test.js — The one-time copy from Postgres into D1 runs by itself on the cron, page by
 * page across ticks, and the API waits ("maintenance") until it's done
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { sqliteD1 } from '../helpers/sqliteD1.js';
import { resetD1SchemaCache } from '../../src/repositories/d1Schema.js';
import {
  runMigrationTick,
  isMigrationPending,
  getMigrationStatus,
  resetMigrationStatusCache,
  toD1Value,
} from '../../src/services/pgMigration.service.js';

/** A Postgres client answering the copy's queries from in-memory tables */
function fakePg({ users, history, appState }) {
  const client = {
    queries: 0,
    ended: false,
    async query(sql, params = []) {
      client.queries += 1;
      if (sql.includes('information_schema.columns')) {
        const cols = (t, list) => list.map((c) => ({ table_name: t, column_name: c }));
        return { rows: [...cols('users', ['id', 'email', 'name', 'created_at', 'last_login', 'share_enabled', 'legacy_col']), ...cols('app_state', ['key', 'value', 'expires_at', 'updated_at']), ...cols('price_history', ['item_key', 'recorded_at', 'value'])] };
      }
      if (sql.includes('pg_index')) return { rows: params[0] === 'users' ? [{ attname: 'id' }] : [] };
      if (sql.includes('FROM "users"')) {
        const [, limit, offset] = sql.match(/LIMIT (\d+) OFFSET (\d+)/).map(Number);
        return { rows: users.slice(offset, offset + limit) };
      }
      if (sql.includes('FROM app_state')) return { rows: appState.filter((r) => r.key === 'price_source_overrides') };
      if (sql.includes('SELECT DISTINCT item_key')) {
        const keys = [...new Set(history.map((h) => h.item_key))].sort().filter((k) => k > params[0]);
        return { rows: keys.slice(0, Number(sql.match(/LIMIT (\d+)/)[1])).map((item_key) => ({ item_key })) };
      }
      if (sql.includes('DISTINCT ON')) {
        const last = new Map();
        for (const h of history.filter((x) => params[0].includes(x.item_key))) {
          const k = `${h.item_key}|${h.day}`;
          if (!last.has(k) || last.get(k).updated_at < h.updated_at) last.set(k, h);
        }
        return { rows: [...last.values()] };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
    async end() {
      client.ended = true;
    },
  };
  return client;
}

const users = Array.from({ length: 4500 }, (_, i) => ({
  id: `u${i}`, email: `u${i}@x.com`, name: `نام '${i}`, created_at: new Date(Date.UTC(2025, 0, 1)), last_login: '2026-01-01', share_enabled: i % 2 === 0,
}));
const history = [
  { item_key: 'usd', day: '2026-01-01', value: 100, updated_at: 1 },
  { item_key: 'usd', day: '2026-01-01', value: 110, updated_at: 2 },
  { item_key: 'usd', day: '2026-01-02', value: 120, updated_at: 3 },
  { item_key: 'gold', day: '2026-01-02', value: 5, updated_at: 3 },
];
const appState = [
  { key: 'price_source_overrides', value: '{"x":1}', expires_at: null, updated_at: 1 },
  { key: 'prices', value: '{}', expires_at: null, updated_at: 1 },
];

describe('copy from Postgres', () => {
  let db, env, pgClient, connect;
  beforeEach(() => {
    resetD1SchemaCache();
    resetMigrationStatusCache();
    db = sqliteD1();
    env = { DB: db, HYPERDRIVE: { connectionString: 'postgres://hyperdrive' } };
    pgClient = fakePg({ users, history, appState });
    connect = async () => pgClient;
  });

  it('is not pending without the Hyperdrive binding', async () => {
    expect(await isMigrationPending({ DB: db })).toBe(false);
    expect(await runMigrationTick({ DB: db }, { connect })).toBe(null);
    expect(await getMigrationStatus({ DB: db })).toEqual({ pending: false, phase: 'not-configured' });
  });

  it('copies every table across ticks, then stops waiting', async () => {
    expect(await isMigrationPending(env)).toBe(true);
    const first = await runMigrationTick(env, { connect, budgetMs: 0 });
    expect(first.phase).toBe('running');
    expect(first.counts.users).toBe(2000);
    expect(pgClient.ended).toBe(true);

    let state = first;
    for (let i = 0; i < 20 && state.phase !== 'done'; i++) state = await runMigrationTick(env, { connect, budgetMs: 0 });
    expect(state.phase).toBe('done');
    expect(state.counts).toEqual({ users: 4500, app_state: 1, price_daily: 3 });

    const q = (sql) => db.sqlite.prepare(sql).all();
    expect(q('SELECT count(*) AS n FROM users')[0].n).toBe(4500);
    expect(q("SELECT name, share_enabled, created_at FROM users WHERE id = 'u2'")[0]).toEqual({ name: "نام '2", share_enabled: 1, created_at: '2025-01-01T00:00:00.000Z' });
    expect(q("SELECT item_key, day, value FROM price_daily ORDER BY item_key, day")).toEqual([
      { item_key: 'gold', day: '2026-01-02', value: 5 },
      { item_key: 'usd', day: '2026-01-01', value: 110 },
      { item_key: 'usd', day: '2026-01-02', value: 120 },
    ]);
    expect(q('SELECT key FROM app_state')).toEqual([{ key: 'price_source_overrides' }]);

    expect(await isMigrationPending(env)).toBe(false);
    expect(await runMigrationTick(env, { connect })).toBe(null);
    const status = await getMigrationStatus(env);
    expect(status).toMatchObject({ pending: false, phase: 'done', current: null, running: false });
  });

  it('keeps its progress when a tick fails, and repeats only the failed page', async () => {
    await runMigrationTick(env, { connect, budgetMs: 0 });
    const failing = { ...pgClient, query: async () => { throw new Error('connection reset'); }, end: async () => {} };
    const failed = await runMigrationTick(env, { connect: async () => failing });
    expect(failed).toMatchObject({ lastError: 'connection reset', failures: 1, cursor: 2000 });
    let state = failed;
    for (let i = 0; i < 20 && state.phase !== 'done'; i++) state = await runMigrationTick(env, { connect });
    expect(state.counts.users).toBe(4500);
    expect(db.sqlite.prepare('SELECT count(*) AS n FROM users').all()[0].n).toBe(4500);
  });

  it('a tick holding the lease keeps a second one out', async () => {
    const now = Date.now();
    await db.prepare('CREATE TABLE IF NOT EXISTS pg_migration (id INTEGER PRIMARY KEY, state TEXT NOT NULL, lock_until INTEGER NOT NULL DEFAULT 0)').run();
    await db.prepare("INSERT INTO pg_migration (id, state, lock_until) VALUES (1, '{\"phase\":\"running\"}', ?)").bind(now + 60000).run();
    expect(await runMigrationTick(env, { connect })).toBe(null);
    expect(pgClient.queries).toBe(0);
  });

  it('stores values the way D1 does', () => {
    expect([true, false, null, undefined, 3, NaN, new Date(0), { a: 1 }, 'a\u0000b'].map(toD1Value)).toEqual([1, 0, null, null, 3, null, '1970-01-01T00:00:00.000Z', '{"a":1}', 'ab']);
  });
});

describe('the API while the copy runs', () => {
  it('answers maintenance, except the progress route', async () => {
    resetD1SchemaCache();
    resetMigrationStatusCache();
    const { default: worker } = await import('../../src/index.js');
    const env = { DB: sqliteD1(), HYPERDRIVE: { connectionString: 'postgres://hyperdrive' } };
    const res = await worker.fetch(new Request('https://api.realrate.ir/api/auth/me'), env, { waitUntil() {} });
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('MAINTENANCE');
    const status = await worker.fetch(new Request('https://api.realrate.ir/api/migration-status'), env, { waitUntil() {} });
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({ success: true, pending: true, phase: 'pending' });
  });
});
