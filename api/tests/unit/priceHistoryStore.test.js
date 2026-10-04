/**
 * priceHistoryStore.test.js — An item's history is served from KV: the past days' snapshot is
 * read from D1 once a day, today comes from the price book (real SQLite, a KV stand-in)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { recordPriceHistory, readPriceTrends, TREND_BASELINE_SQL } from '../../src/repositories/priceHistory.repository.js';
import {
  getItemHistory,
  getPastHistory,
  dropHistorySnapshots,
  historyStoreKey,
  resetHistorySnapshotMemo,
} from '../../src/repositories/priceHistoryStore.repository.js';
import { deleteHistoryKey } from '../../src/services/market/historyBackfill.service.js';
import { handleGetPriceHistory } from '../../src/handlers/apiRoutes.js';
import { resetD1SchemaCache } from '../../src/repositories/d1Schema.js';
import { resetPriceBookMemo } from '../../src/repositories/priceBookStore.repository.js';
import { sqliteD1 } from '../helpers/sqliteD1.js';

/** A KV namespace in memory */
function memoryKv() {
  const map = new Map();
  return {
    map,
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async put(key, value) { map.set(key, String(value)); },
    async delete(key) { map.delete(key); },
  };
}

/** The D1 binding, counting the statements that read price_daily */
function countingDb() {
  const db = sqliteD1();
  const counter = { historyReads: 0 };
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    if (/^\s*SELECT[\s\S]*FROM price_daily/i.test(sql)) counter.historyReads += 1;
    return prepare(sql);
  };
  return { db, counter };
}

// 2026-01-06, 11:30 in Tehran
const now = Date.parse('2026-01-06T08:00:00Z');
const book = (usd) => async () => ({ items: { usd: { id: 'usd', price: usd } } });
let env;
let counter;

beforeEach(async () => {
  resetD1SchemaCache();
  resetHistorySnapshotMemo();
  resetPriceBookMemo();
  const made = countingDb();
  counter = made.counter;
  env = { DB: made.db, KV: memoryKv() };
  await recordPriceHistory(env, [{ id: 'usd', price: 100 }], '2026-01-02T08:00:00Z');
  await recordPriceHistory(env, [{ id: 'usd', price: 120 }], '2026-01-04T08:00:00Z');
  // Today's row in D1: the live book is what today's value is read from
  await recordPriceHistory(env, [{ id: 'usd', price: 125 }], '2026-01-06T07:00:00Z');
  counter.historyReads = 0;
});

describe('getItemHistory', () => {
  it('past days from the snapshot, today from the book', async () => {
    expect(await getItemHistory(env, 'USD', { now, getBook: book(130) })).toEqual({ since: '2026-01-02', values: [100, 100, 120, 120, 130] });
    expect(JSON.parse(env.KV.map.get(historyStoreKey('usd')))).toMatchObject({ v: 1, key: 'usd', since: '2026-01-02', through: '2026-01-05', values: [100, 100, 120, 120] });
  });

  it('reads D1 once a day: later reads, in any isolate, are KV only', async () => {
    await getItemHistory(env, 'usd', { now, getBook: book(130) });
    expect(counter.historyReads).toBe(1);
    // Same isolate, then a fresh one (memory gone): no D1 read
    await getItemHistory(env, 'usd', { now: now + 1000, getBook: book(131) });
    resetHistorySnapshotMemo();
    expect(await getItemHistory(env, 'usd', { now: now + 2000, getBook: book(132) })).toMatchObject({ values: [100, 100, 120, 120, 132] });
    expect(counter.historyReads).toBe(1);
  });

  it('concurrent first reads share one D1 read', async () => {
    await Promise.all([1, 2, 3, 4].map(() => getItemHistory(env, 'usd', { now, getBook: book(130) })));
    expect(counter.historyReads).toBe(1);
  });

  it('the next day rebuilds the snapshot with yesterday in it', async () => {
    await getItemHistory(env, 'usd', { now, getBook: book(130) });
    const tomorrow = now + 86_400_000;
    expect(await getItemHistory(env, 'usd', { now: tomorrow, getBook: book(140) })).toEqual({ since: '2026-01-02', values: [100, 100, 120, 120, 125, 140] });
    expect(counter.historyReads).toBe(2);
  });

  it('without the book, today carries the last close', async () => {
    expect((await getItemHistory(env, 'usd', { now, getBook: async () => null })).values.at(-1)).toBe(120);
  });

  it('an item with no past day: today alone when the book has it, else nothing — and no write', async () => {
    expect(await getItemHistory(env, 'eur', { now, getBook: async () => ({ items: { eur: { price: 50 } } }) })).toEqual({ since: '2026-01-06', values: [50] });
    expect(await getItemHistory(env, 'nope', { now, getBook: book(130) })).toBeUndefined();
    expect([...env.KV.map.keys()].filter((k) => k.startsWith('history:'))).toEqual([]);
  });

  it('null when the history can\'t be read (no database)', async () => {
    expect(await getPastHistory({ KV: memoryKv() }, 'usd', { now })).toBeNull();
  });
});

describe('a change to past days drops the snapshot', () => {
  it('dropHistorySnapshots: the next read rebuilds from D1', async () => {
    await getItemHistory(env, 'usd', { now, getBook: book(130) });
    await dropHistorySnapshots(env, ['USD']);
    expect(env.KV.map.has(historyStoreKey('usd'))).toBe(false);
    await getItemHistory(env, 'usd', { now, getBook: book(130) });
    expect(counter.historyReads).toBe(2);
  });

  it('deleting an item\'s history drops it', async () => {
    await getItemHistory(env, 'usd', { now, getBook: book(130) });
    await deleteHistoryKey(env, 'usd');
    expect(env.KV.map.has(historyStoreKey('usd'))).toBe(false);
    expect(await getItemHistory(env, 'usd', { now, getBook: async () => null })).toBeUndefined();
  });
});

describe('GET /api/prices/history', () => {
  it('serves the snapshot and the book\'s price', async () => {
    env.KV.map.set('prices', JSON.stringify({ items: { usd: { id: 'usd', price: 130 } } }));
    const body = await (await handleGetPriceHistory(env, new Request('https://x/api/prices/history?key=usd'))).json();
    expect(body).toMatchObject({ success: true, available: true, key: 'usd', since: '2026-01-02' });
    expect(body.values.at(-1)).toBe(130);
  });
});

describe('trend baseline', () => {
  it('reads one row per key, on the primary key', () => {
    const plan = env.DB.sqlite.prepare(`EXPLAIN QUERY PLAN ${TREND_BASELINE_SQL}`).all('["usd"]', '2026-01-05').map((r) => r.detail).join(' | ');
    expect(plan).toMatch(/SEARCH p USING PRIMARY KEY \(item_key=\? AND day<\?\)/);
    expect(plan).not.toMatch(/SCAN p\b|TEMP B-TREE/);
  });

  it('carries the last value before the window, and leaves out keys without one', async () => {
    // The window starts the day after the last row
    const trends = await readPriceTrends(env, ['usd', 'eur'], { range: '7d', now: now + 7 * 86_400_000 });
    expect(Object.keys(trends)).toEqual(['usd']);
    expect(trends.usd.points).toEqual([125, 125, 125, 125, 125, 125, 125]);
  });
});
