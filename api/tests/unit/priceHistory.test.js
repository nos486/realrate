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
import { saveSourceItems, setPriceHistoryWriter } from '../../src/repositories/sourceItems.repository.js';

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

  it('is skipped by saveSourceItems when Postgres is not bound', async () => {
    await expect(saveSourceItems({ DB: null }, 'src_x', [{ id: 'usd', price: 1 }])).resolves.toBe(true);
  });

  it('saveSourceItems hands every save to the registered writer', async () => {
    const writer = vi.fn(async () => 0);
    setPriceHistoryWriter(writer);
    try {
      const items = [{ id: 'usd', price: 1 }];
      await saveSourceItems({ DB: null }, 'src_x', items, { datetime: '2026-01-01T00:00:00Z' });
      expect(writer).toHaveBeenCalledWith({ DB: null }, items, '2026-01-01T00:00:00Z');
    } finally {
      setPriceHistoryWriter(null);
    }
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
});
