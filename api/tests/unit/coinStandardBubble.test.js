/**
 * coinStandardBubble.test.js — A coin's standard price is its gold value plus its bubble's mean
 * over the last year, from the price history (never a fixed percent): each day both the coin and
 * its bubble closed gives a ratio coin ÷ (coin − bubble); the ratios are averaged by the
 * running sums the price averages keep (priceAverages.js), and the year's mean is put on the coin
 * (`params.targetBubblePct`) — what «قیمت استاندارد» and the calculator use. The bubble is the price
 * book's own (coin − its gold value), so the ratio is the coin over its gold value
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
import { ensureBubbleHistory, invalidateBubbleHistory, recomputeDerivedHistory } from '../../src/services/market/bubbleHistory.service.js';
import { TROY_OUNCE_GRAMS } from '../../src/domain/specs/gold.spec.js';

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

describe('a coin bubble\'s past days, from our own history', () => {
  let db;
  beforeEach(() => resetD1SchemaCache());
  afterEach(() => {
    db?.close();
    db = null;
  });

  it('are the coin\'s close less its gold value at that day\'s ounce and dollar, once per version', async () => {
    db = sqliteD1();
    const env = { DB: db };
    const now = Date.parse('2026-05-20T12:00:00+03:30');
    const days = ['2026-05-15', '2026-05-16', '2026-05-17'];
    const ounce = [4000, 4100, 4050];
    const dollar = [100_000, 101_000, 102_000];
    const coinCloses = [110_000_000, 112_000_000, 113_000_000];
    await importDailyCandles(env, 'full_coin', days.map((d, i) => close(d, coinCloses[i])), { now });
    await importDailyCandles(env, 'ons_gold@usd', days.map((d, i) => close(d, ounce[i])), { now });
    // No dollar on the last day: that day gets no bubble
    await importDailyCandles(env, 'usd', days.slice(0, 2).map((d, i) => close(d, dollar[i])), { now });
    // What tgju had: dropped
    await importDailyCandles(env, 'bubble_full_coin', [close('2026-05-14', 9_000_000), close('2026-05-15', 9_100_000)], { now });

    expect(await ensureBubbleHistory(env, now)).toEqual({ written: 2 });
    const { results } = await db.prepare("SELECT day, value FROM price_daily WHERE item_key = 'bubble_full_coin' ORDER BY day").all();
    const weight = COIN_SPECS.full_coin.gold24kWeight;
    const gold = (i) => Math.round(weight * (ounce[i] / TROY_OUNCE_GRAMS) * dollar[i]);
    expect(results).toEqual([
      { day: '2026-05-15', value: coinCloses[0] - gold(0) },
      { day: '2026-05-16', value: coinCloses[1] - gold(1) },
    ]);
    // Done for this version
    expect(await ensureBubbleHistory(env, now)).toBeNull();
  });
});

describe('a backfill of what a bubble is computed from', () => {
  let db;
  beforeEach(() => resetD1SchemaCache());
  afterEach(() => {
    db?.close();
    db = null;
  });

  it('has the bubbles\' past days computed again; another item\'s does not', async () => {
    db = sqliteD1();
    const env = { DB: db };
    await ensureBubbleHistory(env, Date.parse('2026-05-20T12:00:00Z'));
    const stored = () => db.prepare("SELECT key FROM app_state WHERE key = 'bubble_history_version'").first();
    expect(await stored()).toBeTruthy();
    await invalidateBubbleHistory(env, ['eur']);
    expect(await stored()).toBeTruthy();
    await invalidateBubbleHistory(env, ['ons_gold@usd']);
    expect(await stored()).toBeNull();
  });
});

describe('«محاسبه‌ی دوباره» (an admin, now)', () => {
  let db;
  beforeEach(() => resetD1SchemaCache());
  afterEach(() => {
    db?.close();
    db = null;
  });

  it('computes the bubbles and every average now, puts them on the book, and reports each bubble against its inputs', async () => {
    db = sqliteD1();
    const env = { DB: db };
    const now = Date.parse('2026-05-20T12:00:00+03:30');
    const last = shiftDay('2026-05-20', -1);
    const days = Array.from({ length: 40 }, (_, i) => shiftDay(last, -(39 - i)));
    await importDailyCandles(env, 'full_coin', days.map((d, i) => close(d, 120_000_000 + i * 100_000)), { now });
    await importDailyCandles(env, 'ons_gold@usd', days.map((d) => close(d, 4000)), { now });
    // The dollar only for the last 30 days: the coin's first 10 days have no bubble
    await importDailyCandles(env, 'usd', days.slice(10).map((d) => close(d, 100_000)), { now });

    let saved = null;
    const book = { updatedAt: '2026-05-20T08:00:00Z', items: {
      full_coin: { id: 'full_coin', name: 'سکه امامی', price: 124_000_000, sourceId: 'src_def_tgju', params: { intrinsic: 94_000_000 } },
      bubble_full_coin: { id: 'bubble_full_coin', name: 'حباب سکه امامی', price: 30_000_000, sourceId: null, params: {} },
      usd: { id: 'usd', price: 100_000, params: {} },
    } };
    const report = await recomputeDerivedHistory(env, { now, getBook: async () => book, setBook: async (_, b) => { saved = b; } });

    expect(report.written).toBe(30);
    expect(report.averagesThrough).toBe(last);
    expect(report.inputs.usd).toMatchObject({ key: 'usd', days: 30 });
    expect(report.inputs.ounce).toMatchObject({ key: 'ons_gold@usd', days: 40 });
    const full = report.bubbles.find((b) => b.id === 'bubble_full_coin');
    expect(full).toMatchObject({ name: 'حباب سکه امامی', history: { days: 30, first: days[10], last }, coin: { id: 'full_coin', days: 40 }, targetBubbleDays: 30 });
    expect(full.targetBubblePct).toBeGreaterThan(0);
    // On the book at once (not on the next hour)
    expect(saved.averagesThrough).toBe(last);
    expect(saved.items.full_coin.params.targetBubblePct).toBe(full.targetBubblePct);
    expect(saved.items.usd.params.avg['30d'].days).toBe(30);
    // The hourly job has nothing left to do
    expect(await ensureBubbleHistory(env, now)).toBeNull();
  });
});
