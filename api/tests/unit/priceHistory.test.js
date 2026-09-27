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
  migratePriceHistoryKeys,
  HEARTBEAT_SEC,
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
      // The keys are already in today's id form
      if (String(sql).includes("key = 'id_version'")) return { rows: [{ value: '2' }] };
      return { rowCount: sql === INSERT_CHANGED_SQL ? 2 : 0 };
    }),
    end: vi.fn(async () => {}),
  };
}

const env = { HYPERDRIVE: { connectionString: 'postgres://x' } };

describe('toHistoryPoints', () => {
  it('keeps one positive value per key in the book\'s id form, the last one winning', () => {
    const points = toHistoryPoints([
      { id: 'USD', price: 1000 },
      { id: 'usd', price: '1100' },
      { id: 'gold_18k', price: 0 },
      { id: 'eur', price: 'abc' },
      { id: '', price: 5 },
      { id: 'نماد۱', price: 12.5 },
      { id: 'bourse__فملي', price: 680 },
    ]);
    expect(points).toMatchObject({ keys: ['usd', 'نماد1', 'bourse__فملی'], values: ['1100', '12.5', '680'] });
  });

  it('carries each point\'s own time and whether it may be a heartbeat', () => {
    const points = toHistoryPoints([
      { id: 'usd', price: 1, at: '2026-01-01T00:00:00Z', heartbeat: true },
      { id: 'eur', price: 2, at: 'not a date' },
    ]);
    expect(points.ats).toEqual(['2026-01-01T00:00:00.000Z', null]);
    expect(points.heartbeats).toEqual([true, false]);
  });

  it('handles a missing list', () => {
    expect(toHistoryPoints(null)).toEqual({ keys: [], values: [], ats: [], heartbeats: [] });
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
    expect(clients[0].query).toHaveBeenLastCalledWith(INSERT_CHANGED_SQL, [
      ['usd', 'eur'], ['1000', '1200'], '2026-01-01T00:00:00Z', [null, null], [false, false], HEARTBEAT_SEC,
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
    await admin.query('DROP TABLE IF EXISTS price_history; DROP TABLE IF EXISTS price_history_meta');
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

  it('records a price at its source\'s time, never before the latest row, and a heartbeat after an hour', async () => {
    const admin = new Client({ connectionString: PG_URL });
    await admin.connect();
    await admin.query("DELETE FROM price_history WHERE item_key LIKE 'hb_%'");
    const pgEnv = { HYPERDRIVE: { connectionString: PG_URL } };
    const rec = (price, at, now, heartbeat = true) => recordPriceHistory(pgEnv, [{ id: 'hb_gold', price, at, heartbeat }], now);

    // Priced by its source a minute before the sync
    expect(await rec(100, '2026-02-01T09:59:00Z', '2026-02-01T10:00:00Z')).toBe(1);
    // A later change the source dates before the latest row still lands after it
    expect(await rec(101, '2026-02-01T09:00:00Z', '2026-02-01T10:01:00Z')).toBe(1);
    // Unchanged within the hour: nothing; after an hour: a heartbeat row
    expect(await rec(101, null, '2026-02-01T10:30:00Z')).toBe(0);
    expect(await rec(101, null, '2026-02-01T11:30:00Z')).toBe(1);
    // A catalog price (no heartbeat) stays change-only
    expect(await rec(101, null, '2026-02-01T13:30:00Z', false)).toBe(0);

    const { rows } = await admin.query(
      "SELECT to_char(recorded_at AT TIME ZONE 'UTC', 'HH24:MI:SS.MS') AS t, value::text AS value FROM price_history WHERE item_key = 'hb_gold' ORDER BY recorded_at",
    );
    expect(rows).toEqual([
      { t: '09:59:00.000', value: '100' },
      { t: '09:59:00.001', value: '101' },
      { t: '11:30:00.000', value: '101' },
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

  it('moves keys written in older id forms to today\'s, once', async () => {
    const admin = new Client({ connectionString: PG_URL });
    await admin.connect();
    await admin.query('DROP TABLE IF EXISTS price_history; DROP TABLE IF EXISTS price_history_meta');
    await admin.query(PRICE_HISTORY_SCHEMA);
    const old = [
      ['src_def_bourse__فولاد', 540], ['src_def_bourse__عیار', 10], ['src_def_emofid__عیار', 11],
      ['src_def_emofid__پیشتاز', 20], ['src_def_charisma__كهربا', 30], ['src_def_charisma_plans__gold', 40],
      ['src_def_bourse__فملي', 680], ['usd', 1],
    ];
    for (const [key, value] of old) await admin.query('INSERT INTO price_history VALUES ($1, now(), $2)', [key, value]);

    expect(await migratePriceHistoryKeys(admin)).toBe(true);
    expect(await migratePriceHistoryKeys(admin)).toBe(false);
    const { rows } = await admin.query('SELECT item_key, value::text AS value FROM price_history ORDER BY item_key');
    expect(Object.fromEntries(rows.map((r) => [r.item_key, r.value]))).toEqual({
      'bourse__فولاد': '540',
      'bourse__فملی': '680',
      // The exchange's price is the fund's id; the fund house's own copy keeps its series apart
      'bourse__عیار': '10',
      'src_def_emofid__bourse__عیار': '11',
      'bourse__پیشتاز': '20',
      'bourse__کهربا': '30',
      'charisma_plan__gold': '40',
      usd: '1',
    });
    await admin.end();
  });
});

describe('migratePriceHistoryKeys', () => {
  it('runs every statement in one locked transaction and records the version', async () => {
    const sqls = [];
    const client = {
      query: vi.fn(async (sql) => {
        sqls.push(String(sql).trim().split(/\s+/).slice(0, 3).join(' '));
        return { rows: [] };
      }),
    };
    expect(await migratePriceHistoryKeys(client)).toBe(true);
    expect(sqls[2]).toBe('BEGIN');
    expect(sqls[3]).toContain('pg_advisory_xact_lock');
    expect(sqls.at(-2)).toBe('INSERT INTO price_history_meta');
    expect(sqls.at(-1)).toBe('COMMIT');
  });

  it('rolls back and reports a failure', async () => {
    const client = {
      query: vi.fn(async (sql) => {
        if (String(sql).includes('UPDATE price_history')) throw new Error('boom');
        return { rows: [] };
      }),
    };
    await expect(migratePriceHistoryKeys(client)).rejects.toThrow('boom');
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
  });
});
