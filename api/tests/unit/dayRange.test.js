/**
 * dayRange.test.js — Every sync carries today's open / high / low of each item in the price book,
 * from the previous book (no database read); a new Tehran day starts over
 */
import { describe, it, expect } from 'vitest';
import { withDayRange } from '../../src/services/market/sourceSync.service.js';

const book = (prices) => ({ items: Object.fromEntries(Object.entries(prices).map(([id, price]) => [id, { id, price, params: { sourceName: 'x' } }])) });

describe('day range', () => {
  it('opens, stretches and resets with the Tehran day', () => {
    const t = Date.parse('2026-01-05T08:00:00Z');
    let b = withDayRange(book({ usd: 100 }), null, t);
    expect(b.items.usd.params).toMatchObject({ day: '2026-01-05', dayOpen: 100, dayHigh: 100, dayLow: 100, sourceName: 'x' });
    b = withDayRange(book({ usd: 120 }), b, t + 60000);
    b = withDayRange(book({ usd: 90 }), b, t + 120000);
    b = withDayRange(book({ usd: 110 }), b, t + 180000);
    expect(b.items.usd.params).toMatchObject({ dayOpen: 100, dayHigh: 120, dayLow: 90 });
    // 20:31 UTC is the next Tehran day
    const next = withDayRange(book({ usd: 105 }), b, Date.parse('2026-01-05T20:31:00Z'));
    expect(next.items.usd.params).toMatchObject({ day: '2026-01-06', dayOpen: 105, dayHigh: 105, dayLow: 105 });
  });

  it('the last session\'s change: kept while the source is quiet, a new base at the first move of a day', () => {
    const t = Date.parse('2026-01-05T08:00:00Z');
    let b = withDayRange(book({ usd: 100 }), null, t);
    expect(b.items.usd.params.changePercent).toBeUndefined();
    // No base yet: today's first price
    b = withDayRange(book({ usd: 102 }), b, t + 60000);
    expect(b.items.usd.params).toMatchObject({ prevClose: 100, closeDay: '2026-01-05', changePercent: 2 });
    b = withDayRange(book({ usd: 104 }), b, t + 120000);
    expect(b.items.usd.params).toMatchObject({ prevClose: 100, changePercent: 4 });
    // The next days: the feed is quiet for hours — still the last session's change
    const day2 = Date.parse('2026-01-06T08:00:00Z');
    b = withDayRange(book({ usd: 104 }), b, day2);
    b = withDayRange(book({ usd: 104 }), b, day2 + 3_600_000);
    expect(b.items.usd.params).toMatchObject({ prevClose: 100, closeDay: '2026-01-05', changePercent: 4 });
    // Its first move of the day: the price before it is the base
    b = withDayRange(book({ usd: 99.84 }), b, day2 + 7_200_000);
    expect(b.items.usd.params).toMatchObject({ prevClose: 104, closeDay: '2026-01-06', changePercent: -4 });
    b = withDayRange(book({ usd: 106.08 }), b, day2 + 7_260_000);
    expect(b.items.usd.params).toMatchObject({ prevClose: 104, changePercent: 2 });
  });

  it('keeps a source\'s own change (the bourse\'s)', () => {
    const t = Date.parse('2026-01-05T08:00:00Z');
    const own = (price) => ({ items: { x: { id: 'x', price, params: { changePercent: 1.5 } } } });
    let b = withDayRange(own(100), null, t);
    b = withDayRange(own(110), b, t + 60000);
    expect(b.items.x.params.changePercent).toBe(1.5);
    expect(b.items.x.params.prevClose).toBeUndefined();
  });
});
