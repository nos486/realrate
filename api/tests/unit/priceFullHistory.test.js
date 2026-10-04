/**
 * priceFullHistory.test.js — One asset's whole daily history (GET /api/prices/history): a close
 * per day from its first recorded day to today, quiet days carrying the last close (real SQLite)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { recordPriceHistory, readFullHistory } from '../../src/repositories/priceHistory.repository.js';
import { resetD1SchemaCache } from '../../src/repositories/d1Schema.js';
import { handleGetPriceHistory } from '../../src/handlers/apiRoutes.js';
import { sqliteD1 } from '../helpers/sqliteD1.js';

let env;
const now = Date.parse('2026-01-06T08:00:00Z');
beforeEach(async () => {
  resetD1SchemaCache();
  env = { DB: sqliteD1() };
  await recordPriceHistory(env, [{ id: 'usd', price: 100 }], '2026-01-02T08:00:00Z');
  await recordPriceHistory(env, [{ id: 'usd', price: 110 }], '2026-01-02T09:00:00Z');
  await recordPriceHistory(env, [{ id: 'usd', price: 120 }], '2026-01-04T08:00:00Z');
});

describe('readFullHistory', () => {
  it('gives a close per day up to today, carrying quiet days', async () => {
    expect(await readFullHistory(env, 'USD', { now })).toEqual({ since: '2026-01-02', values: [110, 110, 120, 120, 120] });
  });

  it('is undefined for a key without history, null without a database', async () => {
    expect(await readFullHistory(env, 'eur', { now })).toBeUndefined();
    expect(await readFullHistory({}, 'usd', { now })).toBeNull();
  });
});

describe('GET /api/prices/history', () => {
  it('answers the series', async () => {
    const res = await handleGetPriceHistory(env, new Request('https://x/api/prices/history?key=usd'));
    const body = await res.json();
    expect(body).toMatchObject({ success: true, available: true, key: 'usd', since: '2026-01-02' });
    expect(body.values.slice(0, 3)).toEqual([110, 110, 120]);
  });

  it('an unknown key has no values; a missing key is refused', async () => {
    const res = await handleGetPriceHistory(env, new Request('https://x/api/prices/history?key=nope'));
    expect(await res.json()).toMatchObject({ available: true, since: null, values: [] });
    expect((await handleGetPriceHistory(env, new Request('https://x/api/prices/history'))).status).toBe(400);
  });
});
