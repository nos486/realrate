/**
 * stateStore.test.js — the app's changing state (prices, source items, counters) in Postgres:
 * get / put / delete, atomic counters, expiry, and the price book kept in memory for a few seconds
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import pg from 'pg';
import { getStateStore, purgeExpiredState } from '../../src/repositories/stateStore.repository.js';
import { getPriceBookCache, setPriceBookCache, resetPriceBookMemo, PRICE_BOOK_MEMO_MS } from '../../src/repositories/priceBookStore.repository.js';
import { readSourceItemsMany, saveSourceItems } from '../../src/repositories/sourceItems.repository.js';
import { memoryStateDb } from '../helpers/memoryStateDb.js';
import { withDatabase } from '../../src/lib/database.js';
import { resetPgSchemaCache } from '../../src/repositories/pgSchema.js';

const fakeDb = () => memoryStateDb();

beforeEach(() => resetPriceBookMemo());

describe('state store', () => {
  it('is Postgres, and nothing without a database', () => {
    expect(getStateStore({ DB: fakeDb() }).kind).toBe('postgres');
    expect(getStateStore({})).toBeNull();
  });

  it('reads, writes and deletes', async () => {
    const store = getStateStore({ DB: fakeDb() });
    await store.put('a', JSON.stringify({ x: 1 }));
    expect(await store.get('a', 'json')).toEqual({ x: 1 });
    expect(await store.get('a')).toBe('{"x":1}');
    await store.delete('a');
    expect(await store.get('a')).toBeNull();
  });

  it('counts in one statement; an expired counter starts over; never below zero', async () => {
    const db = fakeDb();
    const store = getStateStore({ DB: db });
    expect(await store.increment('rl:a', 1, { expirationTtl: 60 })).toBe(1);
    expect(await store.increment('rl:a', 1, { expirationTtl: 60 })).toBe(2);
    expect(db.calls.filter((c) => c === 'increment')).toHaveLength(2);
    expect(db.calls).not.toContain('select');
    expect(await store.increment('rl:a', -5)).toBe(0);
    db.rows.set('rl:a', { value: '9', expiresAt: 1 });
    expect(await store.increment('rl:a', 1, { expirationTtl: 60 })).toBe(1);
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

  it('reads the price book once for requests arriving together', async () => {
    const db = fakeDb();
    const env = { DB: db };
    await setPriceBookCache(env, { items: { usd: { price: 1 } } });
    resetPriceBookMemo();
    db.calls.length = 0;
    const books = await Promise.all([getPriceBookCache(env), getPriceBookCache(env), getPriceBookCache(env)]);
    expect(books.every((b) => b.items.usd.price === 1)).toBe(true);
    expect(db.calls).toEqual(['select']);
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
    // Counters: atomic, expired ones start over, never below zero
    expect(await store.increment('rl:n', 1, { expirationTtl: 60 })).toBe(1);
    expect(await Promise.all([1, 2, 3].map(() => store.increment('rl:n', 1, { expirationTtl: 60 })))).toHaveLength(3);
    expect(await store.get('rl:n')).toBe('4');
    expect(await store.increment('rl:n', -10)).toBe(0);
    await store.put('rl:gone', '7', { expirationTtl: -1 });
    expect(await store.increment('rl:gone', 1, { expirationTtl: 60 })).toBe(1);
    await close();
  });
});
