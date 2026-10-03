/**
 * priceCandles.test.js — Daily candles (open / high / low / close) in price_daily, the column
 * migration for tables made before them, and the tgju backfill (on real SQLite)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { recordPriceHistory, readPriceTrends, importDailyCandles, tehranDay, addDays } from '../../src/repositories/priceHistory.repository.js';
import { resetD1SchemaCache, ensureD1Schema } from '../../src/repositories/d1Schema.js';
import { parseTgjuRows, backfillPriceHistory, cellDay } from '../../src/services/market/historyBackfill.service.js';
import { sqliteD1 } from '../helpers/sqliteD1.js';

let db;
let env;
beforeEach(() => {
  resetD1SchemaCache();
  db = sqliteD1();
  env = { DB: db };
});
const candleRows = () => db.sqlite.prepare('SELECT item_key, day, open, high, low, value FROM price_daily ORDER BY item_key, day').all().map((r) => ({ ...r }));

describe('a day is a candle', () => {
  it('opens at the first price, stretches high / low, closes at the last', async () => {
    const t = Date.parse('2026-01-01T08:00:00Z');
    for (const [i, price] of [100, 120, 90, 110, 110].entries()) {
      await recordPriceHistory(env, [{ id: 'usd', price }], new Date(t + i * 60000).toISOString());
    }
    expect(candleRows()).toEqual([{ item_key: 'usd', day: '2026-01-01', open: 100, high: 120, low: 90, value: 110 }]);
  });

  it('reads candles when asked, flat ones for carried days', async () => {
    const now = Date.parse('2026-01-03T08:00:00Z');
    await recordPriceHistory(env, [{ id: 'usd', price: 100 }], '2026-01-01T08:00:00Z');
    await recordPriceHistory(env, [{ id: 'usd', price: 130 }], '2026-01-01T09:00:00Z');
    await recordPriceHistory(env, [{ id: 'usd', price: 125 }], '2026-01-03T07:00:00Z');
    const plain = await readPriceTrends(env, ['usd'], { range: '7d', now });
    expect(plain.usd.candles).toBeUndefined();
    const { usd } = await readPriceTrends(env, ['usd'], { range: '7d', now, candles: true });
    expect(usd.days).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    expect(usd.candles).toEqual([[100, 130, 100, 130], [130, 130, 130, 130], [125, 125, 125, 125]]);
  });

  it('a table made before the candle columns gets them, its days as flat candles', async () => {
    db.sqlite.exec(`CREATE TABLE price_daily (item_key TEXT NOT NULL, day TEXT NOT NULL, value REAL NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (item_key, day)) WITHOUT ROWID;
      INSERT INTO price_daily VALUES ('usd', '2025-12-30', 95, 1);`);
    await ensureD1Schema(db);
    expect(candleRows()).toEqual([{ item_key: 'usd', day: '2025-12-30', open: 95, high: 95, low: 95, value: 95 }]);
    await recordPriceHistory(env, [{ id: 'usd', price: 100 }], '2026-01-01T08:00:00Z');
    expect(candleRows()[1]).toMatchObject({ open: 100, high: 100, low: 100, value: 100 });
  });
});

describe('backfill', () => {
  const now = Date.parse('2026-01-10T08:00:00Z');
  const today = tehranDay(now);

  it('imports past days, keeps recorded ones unless overwriting, never today', async () => {
    await recordPriceHistory(env, [{ id: 'usd', price: 105 }], '2026-01-09T08:00:00Z');
    const candles = [
      { day: '2026-01-08', open: 100, high: 104, low: 99, close: 103 },
      { day: '2026-01-09', open: 1, high: 1, low: 1, close: 1 },
      { day: today, open: 1, high: 1, low: 1, close: 1 },
      { day: 'bad', open: 1, high: 1, low: 1, close: 1 },
      { day: '2026-01-07', open: 0, high: 1, low: 1, close: 1 },
    ];
    expect(await importDailyCandles(env, 'usd', candles, { now })).toEqual({ written: 1, valid: 2 });
    expect(candleRows().map((r) => [r.day, r.value])).toEqual([['2026-01-08', 103], ['2026-01-09', 105]]);
    expect(await importDailyCandles(env, 'usd', candles, { now, overwrite: true })).toEqual({ written: 2, valid: 2 });
    expect(candleRows().map((r) => [r.day, r.value])).toEqual([['2026-01-08', 103], ['2026-01-09', 1]]);
  });

  it('reads tgju rows (rials, HTML cells, Persian digits, Jalali-only dates)', () => {
    const rows = [
      ['1,050,000', '1,040,000', '1,070,000', '1,060,000', '<span class="high">10,000</span>', '0.95%', '2026/01/08', '1404/10/18'],
      { 0: '۱,۰۰۰,۰۰۰', 1: '۹۹۰,۰۰۰', 2: '۱,۰۲۰,۰۰۰', 3: '۱,۰۱۰,۰۰۰', 4: '۱۴۰۴/۱۰/۱۷' },
      ['-', '-', '2026/01/06'],
    ];
    expect(parseTgjuRows(rows, 10)).toEqual([
      { day: '2026-01-08', open: 105000, high: 107000, low: 104000, close: 106000 },
      { day: '2026-01-07', open: 100000, high: 102000, low: 99000, close: 101000 },
    ]);
    expect(cellDay(['1404/01/01'])).toBe('2025-03-21');
  });

  it('pages through tgju until two years back, then writes', async () => {
    await recordPriceHistory(env, [{ id: 'usd', price: 101000 }], new Date(now).toISOString());
    const rowFor = (i) => {
      const day = addDays(today, -1 - i);
      return ['1,000,000', '990,000', '1,020,000', '1,010,000', '0', '0%', day.replace(/-/g, '/'), ''];
    };
    const urls = [];
    const fetchImpl = async (url) => {
      urls.push(url);
      const start = Number(new URL(url).searchParams.get('start'));
      const data = Array.from({ length: 500 }, (_, i) => rowFor(start + i)).filter((_, i) => start + i < 800);
      return new Response(JSON.stringify({ data }), { status: 200 });
    };
    const res = await backfillPriceHistory(env, { key: 'usd', days: 730, fetchImpl, now });
    expect(urls).toHaveLength(2);
    expect(res).toMatchObject({ key: 'usd', fetched: 800, valid: 730, written: 730, from: addDays(today, -730), to: addDays(today, -1) });
    const { usd } = await readPriceTrends(env, ['usd'], { range: '2y', now, candles: true });
    expect(usd.days[0]).toBe(addDays(today, -729));
    expect(usd.candles[0]).toEqual([100000, 102000, 99000, 101000]);
  });

  it('refuses a unit slip, an unknown item and an unreadable answer', async () => {
    await recordPriceHistory(env, [{ id: 'usd', price: 1000000 }], new Date(now).toISOString());
    const rials = async () => new Response(JSON.stringify({ data: [['10,000,000', '9,900,000', '10,200,000', '10,100,000', '2026/01/08']] }));
    await expect(backfillPriceHistory(env, { fetchImpl: rials, now, key: 'usd' })).resolves.toBeDefined();
    resetD1SchemaCache();
    db = sqliteD1(); env = { DB: db };
    await recordPriceHistory(env, [{ id: 'usd', price: 10100 }], new Date(now).toISOString());
    await expect(backfillPriceHistory(env, { fetchImpl: rials, now })).rejects.toThrow(/نمی‌خواند/);
    await expect(backfillPriceHistory(env, { key: 'nope', now })).rejects.toThrow(/منبع/);
    const junk = async () => new Response(JSON.stringify({ data: [['x', 'y']] }));
    await expect(backfillPriceHistory(env, { fetchImpl: junk, now })).rejects.toThrow(/قابل خواندن/);
  });

  it('turns a dollar-priced item (the ounce) into tomans with each day\'s dollar candle', async () => {
    await importDailyCandles(env, 'usd', [
      { day: '2026-01-07', open: 100000, high: 102000, low: 99000, close: 101000 },
      { day: '2026-01-08', open: 101000, high: 103000, low: 100000, close: 102000 },
    ], { now });
    await recordPriceHistory(env, [{ id: 'ons_gold', price: 4000 * 102000 }], new Date(now).toISOString());
    const ons = async () => new Response(JSON.stringify({ data: [
      ['4,000', '3,950', '4,050', '4,010', '2026/01/08'],
      ['3,900', '3,880', '3,990', '3,980', '2026/01/07'],
      ['3,800', '3,780', '3,890', '3,880', '2026/01/06'],
    ] }));
    const res = await backfillPriceHistory(env, { key: 'ons_gold', fetchImpl: ons, now });
    expect(res).toMatchObject({ key: 'ons_gold', label: 'انس طلا', written: 2, from: '2026-01-07', to: '2026-01-08' });
    const row = db.sqlite.prepare("SELECT open, high, low, value FROM price_daily WHERE item_key = 'ons_gold' AND day = '2026-01-08'").get();
    expect({ ...row }).toEqual({ open: 4000 * 101000, high: 4050 * 103000, low: 3950 * 100000, value: 4010 * 102000 });
  });

  it('needs the dollar\'s history first, and a live price to check against', async () => {
    const ons = async () => new Response(JSON.stringify({ data: [['4,000', '3,950', '4,050', '4,010', '2026/01/08']] }));
    await expect(backfillPriceHistory(env, { key: 'ons_gold', fetchImpl: ons, now })).rejects.toThrow(/دلار/);
    const coin = async () => new Response(JSON.stringify({ data: [['1,000,000,000', '990,000,000', '1,010,000,000', '1,005,000,000', '2026/01/08']] }));
    await expect(backfillPriceHistory(env, { key: 'full_coin', fetchImpl: coin, now })).rejects.toThrow(/هنوز قیمتی ثبت نشده/);
    await recordPriceHistory(env, [{ id: 'full_coin', price: 100000000 }], new Date(now).toISOString());
    await expect(backfillPriceHistory(env, { key: 'full_coin', fetchImpl: coin, now })).resolves.toMatchObject({ written: 1 });
  });
});
