/**
 * coinStandardBubble.test.js — A coin's standard price is its gold value plus its bubble's mean
 * over the last year, from the price history (never a fixed percent): each day both the coin and
 * its bubble (tgju) closed gives a ratio coin ÷ (coin − bubble); the ratios are averaged by the
 * running sums the price averages keep (priceAverages.js), and the year's mean is put on the coin
 * (`params.targetBubblePct`) — what «قیمت استاندارد» and the calculator use
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sqliteD1 } from '../helpers/sqliteD1.js';
import { resetD1SchemaCache } from '../../src/repositories/d1Schema.js';
import {
  BUBBLE_RATIO_SERIES,
  bubbleRatio,
  withBubbleRatioRows,
  averageStateFromSums,
  advanceAverageState,
  averagesOf,
  applyAverages,
  carryAverages,
  boundaryDaysOf,
  shiftDay,
} from '../../src/domain/priceAverages.js';
import { readAverageSums, readBubbleRatioSums, readDayCloses, importDailyCandles } from '../../src/repositories/priceHistory.repository.js';
import { withAverages } from '../../src/services/market/priceAverages.service.js';
import { metricValue } from '../../src/domain/cardMetrics.js';
import { COIN_SPECS } from '../../src/domain/specs/coin.spec.js';
import { GOLD_SPECS } from '../../src/domain/specs/gold.spec.js';
import { targetBubbleOf } from '../../../web/src/utils/calculator.js';

const close = (day, value) => ({ day, open: value, high: value, low: value, close: value });
const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;
const pct = (coin, bubble) => (bubble / (coin - bubble)) * 100;

describe('a coin\'s bubble ratio', () => {
  it('is one per coin bubble of the specs', () => {
    expect(BUBBLE_RATIO_SERIES).toEqual(expect.arrayContaining([
      { key: 'bubble_full_coin@ratio', bubbleId: 'bubble_full_coin', coinId: 'full_coin' },
      { key: 'bubble_half_coin@ratio', bubbleId: 'bubble_half_coin', coinId: 'half_coin' },
      { key: 'bubble_quarter_coin@ratio', bubbleId: 'bubble_quarter_coin', coinId: 'quarter_coin' },
    ]));
  });

  it('is the coin over its gold value, only with both closes', () => {
    expect(bubbleRatio(115, 15)).toBeCloseTo(1.15, 10);
    expect(bubbleRatio(100, null)).toBeNull();
    expect(bubbleRatio(100, 100)).toBeNull();
    const rows = withBubbleRatioRows([
      { item_key: 'full_coin', day: 'd1', value: 120 },
      { item_key: 'bubble_full_coin', day: 'd1', value: 20 },
      { item_key: 'full_coin', day: 'd2', value: 130 }, // no bubble that day
    ]);
    expect(rows.filter((r) => r.item_key === 'bubble_full_coin@ratio')).toEqual([{ item_key: 'bubble_full_coin@ratio', day: 'd1', value: 1.2 }]);
  });

  it('puts the mean bubble on the bubble and the year\'s on its coin, and carries them', () => {
    const book = { items: {
      full_coin: { id: 'full_coin', price: 1000, params: { intrinsic: 850 } },
      bubble_full_coin: { id: 'bubble_full_coin', price: 150, params: {} },
    } };
    const averages = new Map([['bubble_full_coin@ratio', { '30d': { value: 1.1, days: 30 }, '1y': { value: 1.1234, days: 300 } }]]);
    applyAverages(book, averages, '2026-05-10');
    expect(book.items.full_coin.params).toMatchObject({ targetBubblePct: 12.34, targetBubbleDays: 300 });
    expect(book.items.bubble_full_coin.params.avgPct).toEqual({ '30d': { value: 10, days: 30 }, '1y': { value: 12.34, days: 300 } });
    // The standard price: the gold value plus the year's mean bubble
    expect(metricValue(book.items.full_coin, 'standard')).toEqual({ value: Math.round(850 * 1.1234), currency: 'toman' });

    const next = { items: {
      full_coin: { id: 'full_coin', price: 1010, params: { intrinsic: 850 } },
      bubble_full_coin: { id: 'bubble_full_coin', price: 160, params: {} },
    } };
    carryAverages(next, book);
    expect(next.items.full_coin.params.targetBubblePct).toBe(12.34);
    expect(next.items.bubble_full_coin.params.avgPct['1y'].value).toBe(12.34);
    // An older book's fixed percent (no days) is never carried
    const old = { averagesThrough: '2026-05-09', items: { full_coin: { id: 'full_coin', params: { targetBubblePct: 15 } } } };
    const fresh = { items: { full_coin: { id: 'full_coin', price: 1, params: {} } } };
    carryAverages(fresh, old);
    expect(fresh.items.full_coin.params).not.toHaveProperty('targetBubblePct');
  });

  it('a coin without a year\'s bubble has no standard price; gold\'s is its gold value', () => {
    expect(metricValue({ id: 'full_coin', price: 1000, params: { intrinsic: 850 } }, 'standard')).toBeNull();
    expect(targetBubbleOf({ params: {} }, COIN_SPECS.full_coin)).toBeNull();
    expect(targetBubbleOf({ params: { targetBubblePct: 9.5 } }, COIN_SPECS.half_coin)).toBe(9.5);
    expect(targetBubbleOf({ params: {} }, GOLD_SPECS.gold_18k)).toBe(0);
    // No fixed percent left in the specs
    for (const spec of [...Object.values(COIN_SPECS), ...Object.values(GOLD_SPECS)]) expect(spec).not.toHaveProperty('targetBubblePct');
  });
});

describe('the year\'s mean bubble, on the real SQL', () => {
  let db;
  beforeEach(() => resetD1SchemaCache());
  afterEach(() => {
    db?.close();
    db = null;
  });

  it('is the mean of the daily bubble percents, summed or moved a day at a time alike', async () => {
    db = sqliteD1();
    const env = { DB: db };
    const today = '2026-05-20';
    const now = Date.parse(`${today}T12:00:00+03:30`);
    const last = shiftDay(today, -1);
    // 400 days of a rising coin; the bubble (tgju) only from 200 days ago, some days missing
    const coin = Array.from({ length: 400 }, (_, i) => close(shiftDay(last, -(399 - i)), 100_000 + i * 100));
    const bubble = coin.slice(-200).filter((_, i) => i % 9 !== 4).map((d, i) => close(d.day, 10_000 + (i % 13) * 300));
    await importDailyCandles(env, 'full_coin', coin, { now });
    await importDailyCandles(env, 'bubble_full_coin', bubble, { now });

    const keys = ['full_coin', 'bubble_full_coin'];
    const through = shiftDay(today, -2);
    const summed = async (day) => averageStateFromSums([
      ...(await readAverageSums(env, keys, day)),
      ...(await readBubbleRatioSums(env, BUBBLE_RATIO_SERIES, day)),
    ], day);
    const start = await summed(through);
    const moved = advanceAverageState(start, await readDayCloses(env, keys, boundaryDaysOf(last)), last);
    const whole = await summed(last);
    expect(Object.keys(moved.sums['1y'])).toContain('bubble_full_coin@ratio');
    for (const w of ['30d', '1y']) {
      const [sum, n] = moved.sums[w]['bubble_full_coin@ratio'];
      const [wholeSum, wholeN] = whole.sums[w]['bubble_full_coin@ratio'];
      expect(n).toBe(wholeN);
      expect(sum).toBeCloseTo(wholeSum, 9);
    }

    // The year: every day with both closes, as a mean of the percents
    const coinOn = new Map(coin.map((d) => [d.day, d.close]));
    const yearStart = shiftDay(last, -364);
    const year = bubble.filter((d) => d.day >= yearStart).map((d) => pct(coinOn.get(d.day), d.close));
    const ratio = averagesOf(whole).get('bubble_full_coin@ratio')['1y'];
    expect(ratio.days).toBe(year.length);
    expect((ratio.value - 1) * 100).toBeCloseTo(mean(year), 9);

    // A new day's book gets it on the coin
    const book = { updatedAt: `${today}T09:00:00.000Z`, items: {
      full_coin: { id: 'full_coin', price: 140_000, params: { intrinsic: 120_000 } },
      bubble_full_coin: { id: 'bubble_full_coin', price: 15_000, params: {} },
    } };
    await withAverages(env, book, null, now);
    expect(book.items.full_coin.params.targetBubblePct).toBeCloseTo(mean(year), 2);
    expect(book.items.full_coin.params.targetBubbleDays).toBe(year.length);
  });
});
