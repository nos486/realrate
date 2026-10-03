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
});
