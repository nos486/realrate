/**
 * priceChangedAt.test.js — An item's `updatedAt` in the price book is when its price last changed,
 * not when its source was last fetched: a card shows «۳ ساعت پیش» for a number that hasn't moved
 */
import { describe, it, expect } from 'vitest';
import { withChangedAt } from '../../src/services/market/sourceSync.service.js';

const item = (id, price, updatedAt, extra = {}) => ({ id, price, updatedAt, params: {}, ...extra });
const book = (...items) => ({ items: Object.fromEntries(items.map((i) => [i.id, i])) });

describe('withChangedAt', () => {
  it('keeps the previous time while the price is the same, and takes the new one when it moves', () => {
    const prev = book(item('usd', 100_000, '2026-01-05T08:00:00Z'), item('full_coin', 76_000_000, '2026-01-05T08:00:00Z'));
    const next = withChangedAt(book(item('usd', 100_000, '2026-01-05T11:00:00Z'), item('full_coin', 76_100_000, '2026-01-05T11:00:00Z')), prev);
    expect(next.items.usd.updatedAt).toBe('2026-01-05T08:00:00Z');
    expect(next.items.full_coin.updatedAt).toBe('2026-01-05T11:00:00Z');
  });

  it('judges a dollar-priced asset by its dollar price, not its toman price', () => {
    const usd = { currency: 'usd' };
    const prev = book(item('ons', 400_000_000, '2026-01-05T08:00:00Z', { ...usd, priceUsd: 4000 }));
    const sameOunce = withChangedAt(book(item('ons', 404_000_000, '2026-01-05T09:00:00Z', { ...usd, priceUsd: 4000 })), prev);
    expect(sameOunce.items.ons.updatedAt).toBe('2026-01-05T08:00:00Z');
    const moved = withChangedAt(book(item('ons', 401_000_000, '2026-01-05T09:00:00Z', { ...usd, priceUsd: 4010 })), prev);
    expect(moved.items.ons.updatedAt).toBe('2026-01-05T09:00:00Z');
  });

  it('keeps the fetch time for a new item or a first book', () => {
    expect(withChangedAt(book(item('eth', 1, 't1')), null).items.eth.updatedAt).toBe('t1');
    expect(withChangedAt(book(item('eth', 1, 't1')), book(item('btc', 1, 't0'))).items.eth.updatedAt).toBe('t1');
  });
});
