/**
 * pricesOnDay.test.js — A price on a past day (GET /api/prices/on-day): that day's close, or the
 * last recorded day before it (on real SQLite)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { recordPriceHistory, readPricesOnDay } from '../../src/repositories/priceHistory.repository.js';
import { resetD1SchemaCache } from '../../src/repositories/d1Schema.js';
import { handleGetPricesOnDay } from '../../src/handlers/apiRoutes.js';
import { sqliteD1 } from '../helpers/sqliteD1.js';

let env;
beforeEach(async () => {
  resetD1SchemaCache();
  env = { DB: sqliteD1() };
  await recordPriceHistory(env, [{ id: 'usd', price: 100 }, { id: 'gold_18k', price: 5000 }], '2026-01-01T08:00:00Z');
  await recordPriceHistory(env, [{ id: 'usd', price: 110 }], '2026-01-01T09:00:00Z');
  await recordPriceHistory(env, [{ id: 'usd', price: 120 }], '2026-01-05T08:00:00Z');
});

describe('readPricesOnDay', () => {
  it("gives the day's close", async () => {
    expect(await readPricesOnDay(env, ['usd'], '2026-01-01')).toEqual({ usd: { value: 110, day: '2026-01-01' } });
    expect(await readPricesOnDay(env, ['usd'], '2026-01-05')).toEqual({ usd: { value: 120, day: '2026-01-05' } });
  });

  it('carries the last recorded day over a gap', async () => {
    expect(await readPricesOnDay(env, ['usd', 'gold_18k'], '2026-01-03')).toEqual({
      usd: { value: 110, day: '2026-01-01' },
      gold_18k: { value: 5000, day: '2026-01-01' },
    });
  });

  it('leaves out keys with nothing on or before the day', async () => {
    expect(await readPricesOnDay(env, ['usd', 'eur'], '2025-12-31')).toEqual({});
  });

  it('is unavailable without a database, empty for a bad day', async () => {
    expect(await readPricesOnDay({}, ['usd'], '2026-01-01')).toBeNull();
    expect(await readPricesOnDay(env, ['usd'], '1404-01-01x')).toEqual({});
  });
});

describe('GET /api/prices/on-day', () => {
  it('answers each key with its price and the day it is from', async () => {
    const res = await handleGetPricesOnDay(env, new Request('https://x/api/prices/on-day?keys=USD,eur&day=2026-01-04'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, available: true, day: '2026-01-04', prices: { usd: { value: 110, day: '2026-01-01' } } });
  });

  it('refuses a day that is not YYYY-MM-DD', async () => {
    const res = await handleGetPricesOnDay(env, new Request('https://x/api/prices/on-day?keys=usd&day=yesterday'));
    expect(res.status).toBe(400);
  });
});
