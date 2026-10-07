/**
 * stateStore.test.js — the app's changing state: counters, overrides and sync state in D1, the
 * price book and source items in KV (D1 without a KV binding): get / put / delete, atomic
 * counters, expiry, and the price book kept in memory for a few seconds
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getStateStore, purgeExpiredState } from '../../src/repositories/stateStore.repository.js';
import { getBlobStore } from '../../src/repositories/kvStore.repository.js';
import { getPriceBookCache, setPriceBookCache, resetPriceBookMemo, PRICE_BOOK_MEMO_MS } from '../../src/repositories/priceBookStore.repository.js';
import { readSourceItemsMany, saveSourceItems } from '../../src/repositories/sourceItems.repository.js';
import { dbGetPriceSources } from '../../src/repositories/priceSource.repository.js';
import { memoryStateDb } from '../helpers/memoryStateDb.js';
import { sqliteD1 } from '../helpers/sqliteD1.js';
import { resetD1SchemaCache } from '../../src/repositories/d1Schema.js';

/** Workers KV as a Map (get / put / delete), counting reads and writes */
function memoryKv() {
  const map = new Map();
  const calls = [];
  return {
    map,
    calls,
    async get(key) { calls.push('get'); return map.has(key) ? map.get(key) : null; },
    async put(key, value) { calls.push('put'); map.set(key, String(value)); },
    async delete(key) { calls.push('delete'); map.delete(key); },
  };
}

const fakeDb = () => memoryStateDb();

beforeEach(() => resetPriceBookMemo());

describe('state store', () => {
  it('is D1, and nothing without a database; big values go to KV when it is bound', () => {
    expect(getStateStore({ DB: fakeDb() }).kind).toBe('d1');
    expect(getStateStore({})).toBeNull();
    expect(getBlobStore({ DB: fakeDb(), KV: memoryKv() }).kind).toBe('kv');
    expect(getBlobStore({ DB: fakeDb() }).kind).toBe('d1');
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

  it('lists the price sources: the admin\'s overrides and every list, one read each', async () => {
    const db = fakeDb();
    const env = { DB: db };
    await saveSourceItems(env, 'src_def_usd', [{ id: 'src_def_usd', price: 95000 }]);
    await db.prepare('INSERT INTO app_state (key, value, expires_at, updated_at) VALUES (?, ?, ?, ?)').bind('price_source_overrides', JSON.stringify({ src_def_usd: { isActive: false } }), null, 0).run();
    db.calls.length = 0;
    const sources = await dbGetPriceSources(env, { book: null });
    expect(db.calls).toEqual(['select', 'select']);
    expect(sources.find((src) => src.id === 'src_def_usd')).toMatchObject({ isActive: false, items: [{ id: 'src_def_usd', price: 95000 }] });
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
    expect(db.calls).toEqual(['select', 'select']); // the book, and the sync state
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

describe('the price book in KV, its sync state in D1', () => {
  it('readers get the book from KV; the cron\'s fresh read takes the sync state from D1', async () => {
    const kv = memoryKv();
    const db = fakeDb();
    const env = { DB: db, KV: kv };
    await setPriceBookCache(env, { items: { usd: { price: 1 } }, sources: { s1: { syncedAt: 'T1' } } });
    expect(JSON.parse(kv.map.get('prices')).items.usd.price).toBe(1);
    expect(db.json('source_states')).toEqual({ s1: { syncedAt: 'T1' } });
    expect(db.value('prices')).toBeNull(); // the book is only in KV

    // KV still serving the previous minute's book: the cron must not act on its old sync state
    kv.map.set('prices', JSON.stringify({ items: { usd: { price: 0.5 } }, sources: { s1: { syncedAt: 'T0' } } }));
    resetPriceBookMemo();
    expect((await getPriceBookCache(env)).sources.s1.syncedAt).toBe('T0');
    resetPriceBookMemo();
    const fresh = await getPriceBookCache(env, { fresh: true });
    expect(fresh.sources.s1.syncedAt).toBe('T1');

    // Source items in KV too
    await saveSourceItems(env, 'src_a', [{ id: 'usd', price: 1 }]);
    expect(kv.map.has('source_items:src_a')).toBe(true);
    expect((await readSourceItemsMany(env, ['src_a'])).get('src_a').items).toEqual([{ id: 'usd', price: 1 }]);
  });
});

describe('state store on real SQLite (D1)', () => {
  it('creates app_state and reads, writes, expires and counts through it', async () => {
    resetD1SchemaCache();
    const db = sqliteD1();
    const env = { DB: db };
    const store = getStateStore(env);    await store.put('prices', JSON.stringify({ items: { usd: { price: 70000 } } }));
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
    db.close();
  });
});
