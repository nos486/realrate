/**
 * priceAverages.test.js — Each item's 30-day and one-year average in the book: the running sums
 * moved a day at a time agree with summing the windows again, on the real SQL; the book carries
 * them between ticks; a dollar-priced asset's are in dollars (and in tomans under `toman`)
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { sqliteD1 } from '../helpers/sqliteD1.js';
import { resetD1SchemaCache } from '../../src/repositories/d1Schema.js';
import {
  AVERAGE_WINDOWS,
  averageStateFromSums,
  advanceAverageState,
  averagesOf,
  applyAverages,
  carryAverages,
  boundaryDaysOf,
  canAdvance,
  shiftDay,
  AVERAGE_REBUILD_DAYS,
} from '../../src/domain/priceAverages.js';
import { readAverageSums, readDayCloses, importDailyCandles } from '../../src/repositories/priceHistory.repository.js';
import { averageStateThrough, withAverages, resetPriceAverages, AVERAGES_STATE_KEY } from '../../src/services/market/priceAverages.service.js';

const close = (day, value) => ({ day, open: value, high: value, low: value, close: value });

/** `count` days of closes ending on `last`, the value of day i being f(i) */
const series = (last, count, f) => Array.from({ length: count }, (_, i) => close(shiftDay(last, -(count - 1 - i)), f(i)));

const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;

describe('averages: pure', () => {
  it('a move reads the day that enters and the days that leave the windows', () => {
    expect(boundaryDaysOf('2026-05-10')).toEqual(['2026-05-10', '2026-04-10', '2025-05-10']);
  });

  it('moves the running sums a day forward', () => {
    const state = { v: 1, through: '2026-05-09', rebuiltOn: '2026-05-09', sums: { '30d': { usd: [300, 3] }, '1y': { usd: [300, 3] } } };
    const next = advanceAverageState(state, [
      { item_key: 'usd', day: '2026-05-10', value: 130 },
      { item_key: 'usd', day: '2026-04-10', value: 90 }, // leaves the 30 days
    ], '2026-05-10');
    expect(next.sums['30d'].usd).toEqual([340, 3]);
    expect(next.sums['1y'].usd).toEqual([430, 4]);
    expect(next.through).toBe('2026-05-10');
    expect(next.rebuiltOn).toBe('2026-05-09');
  });

  it('sums again when the state is missing, behind by more than a day, or too old', () => {
    const state = { v: 1, through: '2026-05-09', rebuiltOn: '2026-05-01', sums: {} };
    expect(canAdvance(state, '2026-05-10')).toBe(true);
    expect(canAdvance(state, '2026-05-11')).toBe(false);
    expect(canAdvance(null, '2026-05-10')).toBe(false);
    expect(canAdvance({ ...state, rebuiltOn: shiftDay('2026-05-10', -AVERAGE_REBUILD_DAYS) }, '2026-05-10')).toBe(false);
  });

  it('puts the averages on the items in their own currency, and carries them to the next book', () => {
    const book = { items: {
      usd: { id: 'usd', price: 100000, params: {} },
      ons_gold: { id: 'ons_gold', price: 400000000, currency: 'usd', priceUsd: 4000, params: { dayCurrency: 'usd', toman: { dayLow: 1 } } },
    } };
    const averages = new Map([
      ['usd', { '30d': { value: 95000.4, days: 30 } }],
      ['ons_gold@usd', { '30d': { value: 3900.456, days: 30 }, '1y': { value: 3000, days: 200 } }],
      ['ons_gold', { '30d': { value: 370000000, days: 30 } }],
    ]);
    applyAverages(book, averages, '2026-05-09');
    expect(book.items.usd.params.avg).toEqual({ '30d': { value: 95000, days: 30 } });
    expect(book.items.ons_gold.params.avg).toEqual({ '30d': { value: 3900.46, days: 30 }, '1y': { value: 3000, days: 200 } });
    expect(book.items.ons_gold.params.toman.avg).toEqual({ '30d': { value: 370000000, days: 30 } });
    expect(book.averagesThrough).toBe('2026-05-09');
    // The fingerprint (ETag) covers the averages
    const version = book.version;
    applyAverages(book, new Map([['usd', { '30d': { value: 96000, days: 30 } }]]), '2026-05-10');
    expect(book.version).not.toBe(version);
    applyAverages(book, averages, '2026-05-09');

    const next = { items: {
      usd: { id: 'usd', price: 100100, params: {} },
      ons_gold: { id: 'ons_gold', price: 1, currency: 'usd', priceUsd: 4001, params: { dayCurrency: 'usd', toman: {} } },
    } };
    carryAverages(next, book);
    expect(next.items.usd.params.avg).toEqual(book.items.usd.params.avg);
    expect(next.items.ons_gold.params.toman.avg).toEqual(book.items.ons_gold.params.toman.avg);
    expect(next.averagesThrough).toBe('2026-05-09');
  });

  it('never carries averages measured in another currency', () => {
    const prev = { averagesThrough: 'd', items: { x: { id: 'x', params: { avg: { '30d': { value: 5, days: 1 } } } } } };
    const next = { items: { x: { id: 'x', params: { dayCurrency: 'usd' } } } };
    carryAverages(next, prev);
    expect(next.items.x.params.avg).toBeUndefined();
  });
});

describe('averages: on the real SQL', () => {
  let db;
  // Each test has its own database: the schema is created in each
  beforeEach(() => resetD1SchemaCache());
  afterEach(() => db?.close());

  it('moved a day at a time, the sums agree with summing the windows again', async () => {
    db = sqliteD1();
    const env = { DB: db };
    const today = '2026-05-20';
    const now = Date.parse(`${today}T12:00:00+03:30`);
    // 400 days of a rising price, with a holiday every 7th day (no row)
    const days = series(shiftDay(today, -1), 400, (i) => 1000 + i).filter((_, i) => i % 7 !== 3);
    await importDailyCandles(env, 'usd', days, { now });
    await importDailyCandles(env, 'eur', series(shiftDay(today, -1), 10, () => 50), { now });

    const through = shiftDay(today, -2);
    const start = averageStateFromSums(await readAverageSums(env, ['usd', 'eur'], through), through);
    const nextDay = shiftDay(through, 1);
    const moved = advanceAverageState(start, await readDayCloses(env, ['usd', 'eur'], boundaryDaysOf(nextDay)), nextDay);
    const summed = averageStateFromSums(await readAverageSums(env, ['usd', 'eur'], nextDay), nextDay);
    expect(moved.sums).toEqual(summed.sums);

    const avg = averagesOf(summed).get('usd');
    const inWindow = (w) => days.filter((d) => d.day > shiftDay(nextDay, -AVERAGE_WINDOWS[w].days) && d.day <= nextDay).map((d) => d.close);
    expect(avg['30d'].days).toBe(inWindow('30d').length);
    expect(avg['30d'].value).toBeCloseTo(mean(inWindow('30d')), 6);
    expect(avg['1y'].value).toBeCloseTo(mean(inWindow('1y')), 6);
    // A newer item: its average is of the days it has
    expect(averagesOf(summed).get('eur')['1y']).toEqual({ value: 50, days: 10 });
  });

  it('a tick moves the stored state a day forward, reading only the boundary days', async () => {
    db = sqliteD1();
    const env = { DB: db };
    const today = '2026-05-20';
    const now = Date.parse(`${today}T12:00:00+03:30`);
    await importDailyCandles(env, 'usd', series(shiftDay(today, -1), 60, (i) => 100 + i), { now });

    const first = await averageStateThrough(env, ['usd'], shiftDay(today, -2));
    expect(first.through).toBe(shiftDay(today, -2));
    const second = await averageStateThrough(env, ['usd'], shiftDay(today, -1));
    expect(second.rebuiltOn).toBe(first.rebuiltOn); // moved, not summed again
    expect(averagesOf(second).get('usd')['30d'].value).toBeCloseTo(mean(Array.from({ length: 30 }, (_, i) => 130 + i)), 6);

    // A book built on a new day gets them; the next tick in the same hour only carries them
    const book = { updatedAt: `${today}T09:00:00.000Z`, items: { usd: { id: 'usd', price: 160, params: {} } } };
    await withAverages(env, book, null, now);
    expect(book.averagesThrough).toBe(shiftDay(today, -1));
    expect(book.items.usd.params.avg['30d'].days).toBe(30);

    await resetPriceAverages(env);
    expect(await env.DB.prepare('SELECT key FROM app_state WHERE key = ?').bind(AVERAGES_STATE_KEY).first()).toBeNull();
    const later = { updatedAt: `${today}T09:01:00.000Z`, items: { usd: { id: 'usd', price: 161, params: {} } } };
    await withAverages(env, later, book, now + 60_000);
    expect(later.items.usd.params.avg).toEqual(book.items.usd.params.avg);
    // Still forgotten: summed again on the next hour's first tick
    expect(await env.DB.prepare('SELECT key FROM app_state WHERE key = ?').bind(AVERAGES_STATE_KEY).first()).toBeNull();
  });
});
