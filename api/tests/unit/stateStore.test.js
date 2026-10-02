/**
 * stateStore.test.js — the app's changing state (prices, source items, counters) in Postgres
 * instead of Workers KV: KV's shape, a one-time copy from KV, expiry, and the price book kept in
 * memory for a few seconds
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import pg from 'pg';
import { getStateStore, purgeExpiredState } from '../../src/repositories/stateStore.repository.js';
import { getPriceBookCache, setPriceBookCache, resetPriceBookMemo, PRICE_BOOK_MEMO_MS } from '../../src/repositories/kvCache.repository.js';
import { readSourceItemsMany, saveSourceItems } from '../../src/repositories/sourceItems.repository.js';
import { withDatabase } from '../../src/lib/database.js';
import { resetPgSchemaCache } from '../../src/repositories/pgSchema.js';

/** An in-memory stand-in for the app_state statements */
function fakeDb() {
  const rows = new Map();
  const calls = [];
  const db = {
    rows,
    calls,
    prepare(sql) {
      const make = (params = []) => ({
        bind: (...p) => make(p),
        first: async () => null,
        all: async () => {
          calls.push('select');
          const now = params[params.length - 1];
          const keys = params.slice(0, -1);
          return { results: keys.filter((k) => rows.has(k) && (rows.get(k).expiresAt === null || rows.get(k).expiresAt > now)).map((k) => ({ key: k, value: rows.get(k).value })) };
        },
        run: async () => {
          if (/INSERT INTO app_state/.test(sql)) {
            calls.push('put');
            rows.set(params[0], { value: params[1], expiresAt: params[2] });
          } else if (/DELETE FROM app_state WHERE key/.test(sql)) {
            rows.delete(params[0]);
          } else if (/DELETE FROM app_state WHERE expires_at/.test(sql)) {
            for (const [k, r] of rows) if (r.expiresAt !== null && r.expiresAt <= params[0]) rows.delete(k);
          }
          return {};
        },
      });
      return make();
    },
  };
  return db;
}

const kvWith = (entries = {}) => {
  const map = new Map(Object.entries(entries));
  return { map, get: vi.fn(async (k, type) => (map.has(k) ? (type === 'json' ? JSON.parse(map.get(k)) : map.get(k)) : null)), put: vi.fn(), delete: vi.fn() };
};

beforeEach(() => resetPriceBookMemo());

describe('state store', () => {
  it('uses Postgres when there is a database, KV otherwise', () => {
    expect(getStateStore({ DB: fakeDb(), REALRATE_KV: kvWith() }).kind).toBe('postgres');
    expect(getStateStore({ REALRATE_KV: kvWith() }).kind).toBe('kv');
    expect(getStateStore({})).toBeNull();
  });

  it('reads and writes like KV, never touching KV', async () => {
    const kv = kvWith();
    const store = getStateStore({ DB: fakeDb(), REALRATE_KV: kv });
    await store.put('a', JSON.stringify({ x: 1 }));
    expect(await store.get('a', 'json')).toEqual({ x: 1 });
    expect(await store.get('a')).toBe('{"x":1}');
    await store.delete('a');
    expect(await store.get('a')).toBeNull();
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('copies the price book and source items from KV once, nothing else', async () => {
    const kv = kvWith({ prices: '{"items":{"usd":{}}}', 'source_items:src_a': '[1]', 'rl:x': '3' });
    const db = fakeDb();
    const store = getStateStore({ DB: db, REALRATE_KV: kv });
    expect(await store.get('prices', 'json')).toEqual({ items: { usd: {} } });
    expect(db.rows.has('prices')).toBe(true);
    await store.get('prices');
    expect(kv.get).toHaveBeenCalledTimes(1);
    expect(await store.get('rl:x')).toBeNull(); // counters start empty
  });

  it('forgets expired values, and the cron purges them', async () => {
    const db = fakeDb();
    const store = getStateStore({ DB: db });
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      await store.put('rl:a', '1', { expirationTtl: 60 });
      expect(await store.get('rl:a')).toBe('1');
      vi.setSystemTime(61_000);
      expect(await store.get('rl:a')).toBeNull();
      await purgeExpiredState({ DB: db });
      expect(db.rows.has('rl:a')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads every source\'s items in one query', async () => {
    const db = fakeDb();
    const env = { DB: db };
    await saveSourceItems(env, 'src_a', [{ id: 'usd', price: 1 }]);
    db.calls.length = 0;
    const many = await readSourceItemsMany(env, ['src_a', 'src_b']);
    expect(db.calls).toEqual(['select']);
    expect(many.get('src_a').items).toEqual([{ id: 'usd', price: 1 }]);
    expect(many.get('src_b').items).toEqual([]);
  });

  it('keeps the price book in memory for a few seconds; the cron reads it fresh', async () => {
    const db = fakeDb();
    const env = { DB: db };
    await setPriceBookCache(env, { items: { usd: { price: 1 } } });
    db.calls.length = 0;
    expect((await getPriceBookCache(env)).items.usd.price).toBe(1);
    expect(db.calls).toEqual([]); // from memory
    await getPriceBookCache(env, { fresh: true });
    expect(db.calls).toEqual(['select']);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + PRICE_BOOK_MEMO_MS + 1);
      db.calls.length = 0;
      await getPriceBookCache(env);
      expect(db.calls).toEqual(['select']);
    } finally {
      vi.useRealTimers();
    }
  });
});

const PG_URL = process.env.PRICE_HISTORY_TEST_URL;

describe.skipIf(!PG_URL)('state store on a real Postgres', () => {
  it('creates app_state and reads, writes, expires through it', async () => {
    const admin = new pg.Client({ connectionString: PG_URL });
    await admin.connect();
    await admin.query('DROP TABLE IF EXISTS app_state');
    await admin.query('DELETE FROM app_schema').catch(() => {});
    await admin.end();
    resetPgSchemaCache();

    const { env, close } = withDatabase({ HYPERDRIVE: { connectionString: PG_URL } });
    const store = getStateStore(env);
    await store.put('prices', JSON.stringify({ items: { usd: { price: 70000 } } }));
    await store.put('prices', JSON.stringify({ items: { usd: { price: 71000 } } }));
    await store.put('rl:old', '5', { expirationTtl: -1 });
    await store.put('source_items:a', '[1]');
    expect(await store.get('prices', 'json')).toEqual({ items: { usd: { price: 71000 } } });
    expect(await store.get('rl:old')).toBeNull();
    const many = await store.getMany(['source_items:a', 'source_items:b']);
    expect(many.get('source_items:a')).toBe('[1]');
    expect(many.get('source_items:b')).toBeNull();
    await purgeExpiredState(env);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM app_state').first('n')).toBe(2);
    await store.delete('source_items:a');
    expect(await store.get('source_items:a')).toBeNull();
    await close();
  });
});
