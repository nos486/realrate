/**
 * priceCandles.test.js — Daily candles (open / high / low / close) in price_daily, the column
 * migration for tables made before them, and the tgju backfill (on real SQLite)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { recordPriceHistory, readPriceTrends, importDailyCandles, tehranDay, addDays } from '../../src/repositories/priceHistory.repository.js';
import { resetD1SchemaCache, ensureD1Schema } from '../../src/repositories/d1Schema.js';
import { parseTgjuRows, backfillPriceHistory as backfill, cellDay, listHistoryKeys, moveHistoryKey, deleteHistoryKey, deleteOrphanKeys, guessUnit, previewTgju, saveMappings, getMappings, recordMappingRun } from '../../src/services/market/historyBackfill.service.js';
import { normalizeTgjuSlug, TGJU_CATALOG } from '../../src/config/tgjuCatalog.js';
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
  // The live price book: the targets a series may be written to
  const book = { items: { usd: { name: 'دلار', price: 101000 }, try: { name: 'لیر', price: 3000 }, ons_gold: { name: 'انس', price: 4000 * 102000 }, full_coin: { name: 'سکه', price: 100000000 } } };
  const getBook = async () => book;
  const backfillPriceHistory = (e, o) => backfill(e, { getBook, ...o });

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

  it('pages through tgju until two years back, then writes to the chosen item', async () => {
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
    const res = await backfillPriceHistory(env, { slug: 'price_dollar_rl', target: 'usd', unit: 'rial', days: 730, fetchImpl, now });
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('/price_dollar_rl?');
    expect(res).toMatchObject({ slug: 'price_dollar_rl', target: 'usd', unit: 'rial', fetched: 800, valid: 730, written: 730, from: addDays(today, -730), to: addDays(today, -1) });
    const { usd } = await readPriceTrends(env, ['usd'], { range: '2y', now, candles: true });
    expect(usd.days[0]).toBe(addDays(today, -729));
    expect(usd.candles[0]).toEqual([100000, 102000, 99000, 101000]);
  });

  it('writes only to an item of the live price book, in a unit that matches its live price', async () => {
    const lira = async () => new Response(JSON.stringify({ data: [['30,000', '29,500', '30,500', '30,100', '2026/01/08']] }));
    await expect(backfillPriceHistory(env, { slug: 'price_try', target: 'price_try', unit: 'rial', fetchImpl: lira, now })).rejects.toThrow(/دفتر قیمت نیست/);
    await expect(backfillPriceHistory(env, { slug: 'price_try', target: '', unit: 'rial', fetchImpl: lira, now })).rejects.toThrow(/دفتر قیمت نیست/);
    await expect(backfillPriceHistory(env, { slug: 'price_try', target: 'usd', unit: 'rial', fetchImpl: lira, now })).rejects.toThrow(/نمی‌خواند/);
    await expect(backfillPriceHistory(env, { slug: 'price_try', target: 'try', unit: 'toman', fetchImpl: lira, now })).rejects.toThrow(/نمی‌خواند/);
    await expect(backfillPriceHistory(env, { slug: 'price_try', target: 'try', unit: 'kg', fetchImpl: lira, now })).rejects.toThrow(/واحد/);
    await expect(backfillPriceHistory(env, { slug: 'bad slug!', target: 'try', unit: 'rial', now })).rejects.toThrow(/نامعتبر/);
    await expect(backfillPriceHistory(env, { slug: 'https://www.tgju.org/profile/price_try', target: 'TRY', unit: 'rial', fetchImpl: lira, now })).resolves.toMatchObject({ slug: 'price_try', target: 'try', written: 1 });
    expect(candleRows().map((r) => r.item_key)).toEqual(['try']);
    const junk = async () => new Response(JSON.stringify({ data: [['x', 'y']] }));
    await expect(backfillPriceHistory(env, { slug: 'price_try', target: 'try', unit: 'rial', fetchImpl: junk, now })).rejects.toThrow(/قابل خواندن/);
    const missing = async () => new Response('not found', { status: 404 });
    await expect(backfillPriceHistory(env, { slug: 'nope', target: 'try', unit: 'rial', fetchImpl: missing, now })).rejects.toThrow(/پیدا نشد/);
  });

  it('turns a dollar series (the ounce) into tomans with each day\'s dollar candle', async () => {
    const ons = async () => new Response(JSON.stringify({ data: [
      ['4,000', '3,950', '4,050', '4,010', '2026/01/08'],
      ['3,900', '3,880', '3,990', '3,980', '2026/01/07'],
      ['3,800', '3,780', '3,890', '3,880', '2026/01/06'],
    ] }));
    await expect(backfillPriceHistory(env, { slug: 'ons', target: 'ons_gold', unit: 'usd', fetchImpl: ons, now })).rejects.toThrow(/دلار/);
    await importDailyCandles(env, 'usd', [
      { day: '2026-01-07', open: 100000, high: 102000, low: 99000, close: 101000 },
      { day: '2026-01-08', open: 101000, high: 103000, low: 100000, close: 102000 },
    ], { now });
    const res = await backfillPriceHistory(env, { slug: 'ons', target: 'ons_gold', unit: 'usd', fetchImpl: ons, now });
    expect(res).toMatchObject({ target: 'ons_gold', written: 2, from: '2026-01-07', to: '2026-01-08' });
    const row = db.sqlite.prepare("SELECT open, high, low, value FROM price_daily WHERE item_key = 'ons_gold' AND day = '2026-01-08'").get();
    expect({ ...row }).toEqual({ open: 4000 * 101000, high: 4050 * 103000, low: 3950 * 100000, value: 4010 * 102000 });
  });

  it('previews a series and finds the unit that matches the item', async () => {
    const lira = async () => new Response(JSON.stringify({ data: [['30,000', '29,500', '30,500', '30,100', '2026/01/08'], ['29,000', '28,500', '29,500', '29,100', '2026/01/07']] }));
    const p = await previewTgju(env, { slug: 'price_try', target: 'try', fetchImpl: lira, getBook });
    expect(p).toMatchObject({ slug: 'price_try', target: 'try', live: 3000, guess: { unit: 'rial' } });
    expect(p.latest.map((c) => c.day)).toEqual(['2026-01-08', '2026-01-07']);
    expect(guessUnit(3010, 3000, 100000)).toMatchObject({ unit: 'toman' });
    expect(guessUnit(4010, 4000 * 102000, 102000)).toMatchObject({ unit: 'usd' });
    expect(guessUnit(5, 3000, 100000)).toBe(null);
  });
});

describe('mappings', () => {
  it('keeps one per slug, valid units only, and the server\'s own last run', async () => {
    await saveMappings(env, [{ slug: 'price_try', target: 'TRY', unit: 'rial', label: 'لیر' }]);
    await recordMappingRun(env, 'price_try', { ok: true, written: 5 });
    const saved = await saveMappings(env, [
      { slug: 'https://tgju.org/profile/price_try', target: 'try', unit: 'rial', lastRun: { ok: false } },
      { slug: 'price_try', target: 'x', unit: 'rial' },
      { slug: 'ons', target: 'ons_gold', unit: 'grams' },
      { slug: '???', target: 'a', unit: 'rial' },
    ]);
    expect(saved.map((m) => [m.slug, m.target, m.unit])).toEqual([['price_try', 'try', 'rial'], ['ons', 'ons_gold', 'rial']]);
    expect(saved[0].lastRun).toMatchObject({ ok: true, written: 5 });
    expect(await getMappings(env)).toEqual(saved);
  });

  it('the catalog has unique, valid slugs', () => {
    const slugs = TGJU_CATALOG.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.every((s) => normalizeTgjuSlug(s) === s)).toBe(true);
    expect(normalizeTgjuSlug('https://www.tgju.org/profile/geram18')).toBe('geram18');
  });
});

describe('fixing the history', () => {
  const getBook = async () => ({ items: { try: { name: 'لیر' } } });
  const now = Date.parse('2026-01-10T08:00:00Z');

  it('lists ids with their days, and moves or deletes the ones the book doesn\'t know', async () => {
    await importDailyCandles(env, 'price_try', [
      { day: '2026-01-07', open: 1, high: 1, low: 1, close: 1 },
      { day: '2026-01-08', open: 2, high: 2, low: 2, close: 2 },
    ], { now });
    await importDailyCandles(env, 'try', [{ day: '2026-01-08', open: 3, high: 3, low: 3, close: 3 }], { now });
    await importDailyCandles(env, 'junk', [{ day: '2026-01-08', open: 3, high: 3, low: 3, close: 3 }], { now });
    expect(await listHistoryKeys(env, { getBook })).toEqual([
      { key: 'junk', name: null, inBook: false, days: 1, first: '2026-01-08', last: '2026-01-08' },
      { key: 'price_try', name: null, inBook: false, days: 2, first: '2026-01-07', last: '2026-01-08' },
      { key: 'try', name: 'لیر', inBook: true, days: 1, first: '2026-01-08', last: '2026-01-08' },
    ]);
    await expect(moveHistoryKey(env, 'price_try', 'nope', { getBook })).rejects.toThrow(/دفتر قیمت نیست/);
    expect(await moveHistoryKey(env, 'price_try', 'try', { getBook })).toEqual({ moved: 1, dropped: 1 });
    expect(candleRows().filter((r) => r.item_key === 'try').map((r) => [r.day, r.value])).toEqual([['2026-01-07', 1], ['2026-01-08', 3]]);
    expect(await deleteHistoryKey(env, 'junk')).toBe(1);
    expect((await listHistoryKeys(env, { getBook })).map((h) => h.key)).toEqual(['try']);
  });

  it('deletes every id the book doesn\'t know, but not while the book is missing', async () => {
    const full = async () => ({ items: { try: {}, usd: {}, eur: {}, gbp: {}, aed: {} } });
    for (const key of ['try', 'usd', 'old_a', 'old_b']) {
      await importDailyCandles(env, key, [{ day: '2026-01-08', open: 3, high: 3, low: 3, close: 3 }], { now });
    }
    await expect(deleteOrphanKeys(env, { getBook: async () => null })).rejects.toThrow(/دفتر قیمت/);
    expect(await deleteOrphanKeys(env, { getBook: full })).toEqual({ keys: ['old_a', 'old_b'], deleted: 2 });
    expect(candleRows().map((r) => r.item_key)).toEqual(['try', 'usd']);
  });
});
