/**
 * priceHistory.test.js — The daily price history in D1 (table price_daily: one row per item and
 * Tehran day, the day's last price), run on real SQLite
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  toHistoryPoints,
  recordPriceHistory,
  readPriceTrends,
  buildDailySeries,
  resolveTrendRange,
  tehranDay,
  addDays,
} from '../../src/repositories/priceHistory.repository.js';
import { resetD1SchemaCache } from '../../src/repositories/d1Schema.js';
import { ensureSchema } from '../../src/repositories/schema.repository.js';
import { saveSourceItems } from '../../src/repositories/sourceItems.repository.js';
import { handleGetSparklines } from '../../src/handlers/apiRoutes.js';
import { memoryStateDb } from '../helpers/memoryStateDb.js';
import { sqliteD1 } from '../helpers/sqliteD1.js';

let db;
let env;
beforeEach(() => {
  resetD1SchemaCache();
  db = sqliteD1();
  env = { DB: db };
});

const rows = () => db.sqlite.prepare('SELECT item_key, day, value FROM price_daily ORDER BY item_key, day').all()
  .map((r) => ({ ...r }));

describe('days on Tehran\'s clock', () => {
  it('a Tehran day starts at 20:30 UTC the evening before', () => {
    expect(tehranDay(Date.parse('2026-01-01T20:29:00Z'))).toBe('2026-01-01');
    expect(tehranDay(Date.parse('2026-01-01T20:31:00Z'))).toBe('2026-01-02');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('ranges: 7d / 30d / 90d / 1y; the old per-minute "1d" is a week, anything else the default', () => {
    expect(resolveTrendRange('1y')).toBe('1y');
    expect(resolveTrendRange('1d')).toBe('7d');
    expect(resolveTrendRange('nope')).toBe('30d');
    expect(resolveTrendRange(null)).toBe('30d');
  });
});

describe('toHistoryPoints', () => {
  it('keeps one positive value per key in the book\'s id form, the last one winning', () => {
    expect(toHistoryPoints([
      { id: 'USD', price: 1000 },
      { id: 'usd', price: 1010 },
      { id: 'eur', price: 0 },
      { id: 'gbp', price: 'abc' },
      { id: '', price: 5 },
      { id: 'try', price: '42.5' },
    ])).toEqual([['usd', 1010], ['try', 42.5]]);
    expect(toHistoryPoints(null)).toEqual([]);
  });
});

describe('recordPriceHistory', () => {
  it('does nothing without a database, and never throws', async () => {
    expect(await recordPriceHistory({}, [{ id: 'usd', price: 1 }])).toBe(0);
    const broken = { DB: { prepare: () => { throw new Error('db down'); } } };
    expect(await recordPriceHistory(broken, [{ id: 'usd', price: 1 }])).toBe(0);
  });

  it('one row per item and day: the first price of the day inserts, a change updates, a repeat writes nothing', async () => {
    // 10:00 Tehran
    expect(await recordPriceHistory(env, [{ id: 'USD', price: 1000 }, { id: 'eur', price: 1200 }], '2026-01-01T06:30:00Z')).toBe(2);
    const before = db.queries;
    expect(await recordPriceHistory(env, [{ id: 'usd', price: 1000 }, { id: 'eur', price: 1200 }], '2026-01-01T06:31:00Z')).toBe(0);
    expect(db.queries - before).toBe(1); // one statement for every item
    expect(await recordPriceHistory(env, [{ id: 'usd', price: 1010.5 }, { id: 'eur', price: 1200 }], '2026-01-01T06:32:00Z')).toBe(1);
    // Next Tehran day (21:00 UTC): a new row for each item, even unchanged
    expect(await recordPriceHistory(env, [{ id: 'usd', price: 1010.5 }, { id: 'eur', price: 1200 }], '2026-01-01T21:00:00Z')).toBe(2);
    expect(rows()).toEqual([
      { item_key: 'eur', day: '2026-01-01', value: 1200 },
      { item_key: 'eur', day: '2026-01-02', value: 1200 },
      { item_key: 'usd', day: '2026-01-01', value: 1010.5 },
      { item_key: 'usd', day: '2026-01-02', value: 1010.5 },
    ]);
  });

  it('records thousands of items in one statement', async () => {
    const many = Array.from({ length: 3000 }, (_, i) => ({ id: `bourse__s${i}`, price: 1000 + i }));
    await ensureSchema(env); // once per isolate
    const before = db.queries;
    expect(await recordPriceHistory(env, many, '2026-01-01T06:30:00Z')).toBe(3000);
    expect(db.queries - before).toBe(1);
  });

  it('saveSourceItems only stores the list (history is written by the sync, not here)', async () => {
    const state = { DB: memoryStateDb() };
    await saveSourceItems(state, 'src_a', [{ id: 'usd', price: 1 }]);
    expect([...state.DB.rows.keys()]).toEqual(['source_items:src_a']);
  });
});

describe('buildDailySeries', () => {
  it('carries the value before the window through days without a row', () => {
    const byDay = new Map([['2026-01-03', 12], ['2026-01-05', 15]]);
    expect(buildDailySeries({ baseline: 10, byDay, fromDay: '2026-01-02', today: '2026-01-05' })).toEqual({
      points: [10, 12, 12, 15],
      days: ['2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'],
      first: 10,
      last: 15,
      changePct: 50,
      since: '2026-01-02T00:00:00+03:30',
    });
  });

  it('starts at the first known day when the history is younger than the window; null without values', () => {
    const series = buildDailySeries({ byDay: new Map([['2026-01-04', 7]]), fromDay: '2026-01-01', today: '2026-01-05' });
    expect(series.days).toEqual(['2026-01-04', '2026-01-05']);
    expect(series.points).toEqual([7, 7]);
    expect(buildDailySeries({ byDay: new Map(), fromDay: '2026-01-01', today: '2026-01-05' })).toBeNull();
  });
});

describe('readPriceTrends', () => {
  it('is null without a database', async () => {
    expect(await readPriceTrends({}, ['usd'])).toBeNull();
  });

  it('a daily series per key over the window, with the value from before it carried in', async () => {
    const at = (day) => `${addDays(day, -1)}T21:00:00Z`; // early on that Tehran day
    await recordPriceHistory(env, [{ id: 'usd', price: 900 }], at('2025-12-20')); // before the week
    await recordPriceHistory(env, [{ id: 'usd', price: 1000 }, { id: 'eur', price: 1200 }], at('2026-01-03'));
    await recordPriceHistory(env, [{ id: 'usd', price: 1100 }], at('2026-01-06'));
    const now = Date.parse('2026-01-07T08:00:00Z'); // Jan 7 in Tehran
    const trends = await readPriceTrends(env, ['USD', 'eur', 'missing'], { range: '7d', now });
    expect(Object.keys(trends).sort()).toEqual(['eur', 'usd']);
    expect(trends.usd.days).toEqual(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07']);
    expect(trends.usd.points).toEqual([900, 900, 1000, 1000, 1000, 1100, 1100]);
    expect(trends.eur.days[0]).toBe('2026-01-03');
    expect(trends.eur.last).toBe(1200);
  });

  it('is null (not an error) when the database fails', async () => {
    const broken = { DB: { prepare: () => ({ bind: () => ({}) }), batch: async () => { throw new Error('db down'); } } };
    expect(await readPriceTrends(broken, ['usd'])).toBeNull();
  });
});

describe('GET /api/sparklines', () => {
  it('answers an empty set without touching the database', async () => {
    const res = await handleGetSparklines({}, new Request('https://x/api/sparklines'));
    expect(await res.json()).toEqual({ success: true, available: true, range: '30d', bucketSec: 86400, sparklines: {} });
  });

  it('says the history is unavailable without a database', async () => {
    const res = await handleGetSparklines({}, new Request('https://x/api/sparklines?keys=usd,EUR&range=1d'));
    expect(await res.json()).toEqual({ success: true, available: false, range: '7d', bucketSec: 86400, sparklines: {} });
  });

  it('serves the daily series from D1', async () => {
    await recordPriceHistory(env, [{ id: 'usd', price: 1000 }]);
    const res = await handleGetSparklines(env, new Request('https://x/api/sparklines?keys=usd&range=30d'));
    const body = await res.json();
    expect(body).toMatchObject({ available: true, range: '30d', bucketSec: 86400 });
    expect(body.sparklines.usd).toMatchObject({ points: [1000], days: [tehranDay()], last: 1000 });
  });
});
