/**
 * priceHistory.test.js — Price history in Postgres (one table: item key, time, value)
 *
 * The SQL itself runs against a real Postgres when PRICE_HISTORY_TEST_URL is set, e.g.
 *   PRICE_HISTORY_TEST_URL=postgres://postgres@localhost:5432/realrate npx vitest run priceHistory
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Client } from 'pg';
import {
  toHistoryPoints,
  recordPriceHistory,
  resetPriceHistorySchemaCache,
  INSERT_CHANGED_SQL,
  PRICE_HISTORY_SCHEMA,
} from '../../src/repositories/priceHistory.repository.js';
import {
  buildTrendSeries,
  readPriceTrends,
  TREND_BUCKETS_SQL,
  TREND_BASELINE_SQL,
} from '../../src/repositories/priceHistory.repository.js';
import { saveSourceItems } from '../../src/repositories/sourceItems.repository.js';
import { handleGetSparklines } from '../../src/handlers/apiRoutes.js';

function fakeClient({ failQuery = false, failConnect = false } = {}) {
  return {
    connect: vi.fn(async () => { if (failConnect) throw new Error('connection attempt failed'); }),
    query: vi.fn(async (sql) => {
      if (failQuery) throw new Error('db down');
      return { rowCount: sql === INSERT_CHANGED_SQL ? 2 : 0 };
    }),
    end: vi.fn(async () => {}),
  };
}

const env = { HYPERDRIVE: { connectionString: 'postgres://x' } };

describe('toHistoryPoints', () => {
  it('keeps one positive value per lower-cased key, the last one winning', () => {
    const points = toHistoryPoints([
      { id: 'USD', price: 1000 },
      { id: 'usd', price: '1100' },
      { id: 'gold_18k', price: 0 },
      { id: 'eur', price: 'abc' },
      { id: '', price: 5 },
      { id: 'نماد۱', price: 12.5 },
    ]);
    expect(points).toEqual({ keys: ['usd', 'نماد۱'], values: ['1100', '12.5'] });
  });

  it('handles a missing list', () => {
    expect(toHistoryPoints(null)).toEqual({ keys: [], values: [] });
  });
});

describe('recordPriceHistory', () => {
  beforeEach(() => resetPriceHistorySchemaCache());

  it('does nothing without the Hyperdrive binding', async () => {
    const createClient = vi.fn();
    expect(await recordPriceHistory({}, [{ id: 'usd', price: 1 }], null, { createClient })).toBe(0);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('creates the table once, then inserts the changed values in one query', async () => {
    const clients = [];
    const createClient = vi.fn(() => { const c = fakeClient(); clients.push(c); return c; });
    const items = [{ id: 'usd', price: 1000 }, { id: 'eur', price: 1200 }];

    expect(await recordPriceHistory(env, items, '2026-01-01T00:00:00Z', { createClient })).toBe(2);
    await recordPriceHistory(env, items, '2026-01-01T00:01:00Z', { createClient });

    expect(createClient).toHaveBeenCalledWith('postgres://x');
    expect(clients[0].query).toHaveBeenNthCalledWith(1, PRICE_HISTORY_SCHEMA);
    expect(clients[0].query).toHaveBeenNthCalledWith(2, INSERT_CHANGED_SQL, [
      ['usd', 'eur'], ['1000', '1200'], '2026-01-01T00:00:00Z',
    ]);
    // The second update skips the schema
    expect(clients[1].query).toHaveBeenCalledTimes(1);
    expect(clients.every((c) => c.end.mock.calls.length === 1)).toBe(true);
  });

  it('never throws: a failed write is logged and the connection closed', async () => {
    const client = fakeClient({ failQuery: true });
    const n = await recordPriceHistory(env, [{ id: 'usd', price: 1 }], null, { createClient: () => client });
    expect(n).toBe(0);
    expect(client.end).toHaveBeenCalled();
  });

  it('does not close a client that never connected (its end() would hang)', async () => {
    const client = fakeClient({ failConnect: true });
    expect(await recordPriceHistory(env, [{ id: 'usd', price: 1 }], null, { createClient: () => client })).toBe(0);
    expect(client.end).not.toHaveBeenCalled();
  });

  it('saveSourceItems works without Postgres (history is written by the sync, not here)', async () => {
    const env = { REALRATE_KV: { put: async () => {} } };
    await expect(saveSourceItems(env, 'src_x', [{ id: 'usd', price: 1 }])).resolves.toBe(true);
  });
});

describe('buildTrendSeries', () => {
  const hour = 3600e3;
  const bucketSec = 3600;

  it('carries the value at the window start forward through empty buckets', () => {
    const series = buildTrendSeries({
      baseline: 100,
      buckets: new Map([[2, 110], [4, 90]]),
      fromMs: 0,
      nowMs: 5 * hour,
      bucketSec,
    });
    expect(series.points).toEqual([100, 100, 110, 110, 90, 90]);
    expect(series.first).toBe(100);
    expect(series.last).toBe(90);
    expect(series.changePct).toBeCloseTo(-10);
    expect(series.since).toBe(new Date(0).toISOString());
  });

  it('starts at the first known value when the history is younger than the window', () => {
    const series = buildTrendSeries({ buckets: new Map([[3, 50], [4, 55]]), fromMs: 0, nowMs: 4 * hour, bucketSec });
    expect(series.points).toEqual([50, 55]);
    expect(series.changePct).toBeCloseTo(10);
    expect(series.since).toBe(new Date(3 * hour).toISOString());
  });

  it('is null without any value', () => {
    expect(buildTrendSeries({ buckets: new Map(), fromMs: 0, nowMs: hour, bucketSec })).toBeNull();
  });
});

describe('readPriceTrends', () => {
  it('is null without Postgres', async () => {
    expect(await readPriceTrends({}, ['usd'])).toBeNull();
  });

  it('reads buckets and baselines for the lower-cased keys, then builds each series', async () => {
    const now = Date.UTC(2026, 0, 8);
    const client = {
      connect: vi.fn(async () => {}),
      end: vi.fn(async () => {}),
      query: vi.fn(async (sql) => {
        if (sql === TREND_BASELINE_SQL) return { rows: [{ item_key: 'usd', value: 100 }] };
        if (sql === TREND_BUCKETS_SQL) {
          return { rows: [{ item_key: 'usd', bucket: String(Math.floor(now / 3600e3 / 3)), value: 120 }] };
        }
        return { rows: [] };
      }),
    };
    const result = await readPriceTrends(env, ['USD', 'usd', 'nothing'], { range: '7d', now }, { createClient: () => client });
    expect(Object.keys(result)).toEqual(['usd']);
    expect(result.usd.first).toBe(100);
    expect(result.usd.last).toBe(120);
    expect(result.usd.points.length).toBe(57);
    expect(client.query.mock.calls[0][1][0]).toEqual(['usd', 'nothing']);
    expect(client.end).toHaveBeenCalled();
  });

  it('is null (not an error) when the database fails', async () => {
    const client = fakeClient({ failConnect: true });
    expect(await readPriceTrends(env, ['usd'], {}, { createClient: () => client })).toBeNull();
  });
});

describe('GET /api/sparklines', () => {
  it('answers an empty set without touching the database', async () => {
    const res = await handleGetSparklines({}, new Request('https://x/api/sparklines'));
    expect(await res.json()).toEqual({ success: true, available: true, range: '1d', bucketSec: 60, sparklines: {} });
  });

  it('says the history is unavailable when Postgres is not bound', async () => {
    const res = await handleGetSparklines({}, new Request('https://x/api/sparklines?keys=usd,EUR&range=30d'));
    expect(await res.json()).toEqual({ success: true, available: false, range: '30d', bucketSec: 43200, sparklines: {} });
  });
});

const PG_URL = process.env.PRICE_HISTORY_TEST_URL;

describe.skipIf(!PG_URL)('price_history against a real Postgres', () => {
  it('stores every change, skips repeats, and keeps all sources in one series per key', async () => {
    const admin = new Client({ connectionString: PG_URL });
    await admin.connect();
    await admin.query('DROP TABLE IF EXISTS price_history');
    resetPriceHistorySchemaCache();
    const pgEnv = { HYPERDRIVE: { connectionString: PG_URL } };

    expect(await recordPriceHistory(pgEnv, [{ id: 'USD', price: 1000 }, { id: 'eur', price: 1200 }], '2026-01-01T00:00:00Z')).toBe(2);
    // Same values again: nothing new
    expect(await recordPriceHistory(pgEnv, [{ id: 'usd', price: 1000 }, { id: 'eur', price: 1200 }], '2026-01-01T00:01:00Z')).toBe(0);
    // Another source moves usd, eur unchanged
    expect(await recordPriceHistory(pgEnv, [{ id: 'usd', price: 1010.5 }, { id: 'eur', price: 1200 }], '2026-01-01T00:02:00Z')).toBe(1);
    // Back to an earlier value is still a change
    expect(await recordPriceHistory(pgEnv, [{ id: 'usd', price: 1000 }], '2026-01-01T00:03:00Z')).toBe(1);

    const { rows } = await admin.query(
      "SELECT item_key, to_char(recorded_at AT TIME ZONE 'UTC', 'HH24:MI') AS t, value::text AS value FROM price_history ORDER BY item_key, recorded_at",
    );
    expect(rows).toEqual([
      { item_key: 'eur', t: '00:00', value: '1200' },
      { item_key: 'usd', t: '00:00', value: '1000' },
      { item_key: 'usd', t: '00:02', value: '1010.5' },
      { item_key: 'usd', t: '00:03', value: '1000' },
    ]);
    await admin.end();
  });

  it('reads trend series across the window', async () => {
    const pgEnv = { HYPERDRIVE: { connectionString: PG_URL } };
    const now = Date.parse('2026-01-01T00:10:00Z');
    const trends = await readPriceTrends(pgEnv, ['USD', 'eur', 'missing'], { range: '1d', now });
    expect(Object.keys(trends).sort()).toEqual(['eur', 'usd']);
    expect(trends.usd.first).toBe(1000);
    expect(trends.usd.last).toBe(1000);
    expect(trends.eur.last).toBe(1200);
    expect(trends.usd.since).toBe('2026-01-01T00:00:00.000Z');
  });
});
