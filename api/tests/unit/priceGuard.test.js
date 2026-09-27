/**
 * priceGuard.test.js — A sudden implausible price is held back until it repeats; a price whose
 * source stopped syncing is marked stale, and so is everything computed from it
 */

import { describe, it, expect } from 'vitest';
import { guardSourceItems, DEFAULT_CONFIRM_TICKS } from '../../src/domain/priceGuard.js';
import { buildPriceBook, staleAfterSecOf } from '../../src/domain/priceBook.js';

const usdItems = (price) => [{ id: 'src_def_usd', price }];

describe('guardSourceItems', () => {
  it('takes normal moves, new items and a first value as they are', () => {
    const next = [...usdItems(240000), { id: 'NEW', price: 5 }];
    const { items, rejected } = guardSourceItems(usdItems(234000), next);
    expect(items).toEqual(next);
    expect(rejected).toEqual([]);
    expect(guardSourceItems([], usdItems(1)).items).toEqual(usdItems(1));
  });

  it('holds back a jump (rials instead of tomans) and keeps the last value', () => {
    const { items, held, rejected } = guardSourceItems(usdItems(234000), usdItems(2340000));
    expect(items).toEqual(usdItems(234000));
    expect(held.src_def_usd).toEqual({ value: 2340000, ticks: 1 });
    expect(rejected).toEqual([{ key: 'src_def_usd', previous: 234000, value: 2340000 }]);
  });

  it('accepts a jump once it repeats for a few syncs in a row (a real move)', () => {
    let held = {};
    let accepted = null;
    for (let tick = 1; tick <= DEFAULT_CONFIRM_TICKS; tick++) {
      const r = guardSourceItems(usdItems(234000), usdItems(330000 + tick * 100), { held });
      held = r.held;
      accepted = r.items[0].price;
    }
    expect(accepted).toBe(330000 + DEFAULT_CONFIRM_TICKS * 100);
    expect(held).toEqual({});
  });

  it('starts counting again when the jumped value changes (a glitch, not a move)', () => {
    const first = guardSourceItems(usdItems(234000), usdItems(1), {});
    const second = guardSourceItems(usdItems(234000), usdItems(500000), { held: first.held });
    expect(second.held.src_def_usd.ticks).toBe(1);
    expect(second.items).toEqual(usdItems(234000));
  });

  it('guards catalog items by symbol, whichever price field they use, with the source\'s limit', () => {
    const before = [{ s: 'فولاد', p: 540 }, { s: 'فملی', p: 680 }];
    const next = [{ s: 'فولاد', p: 600 }, { s: 'فملی', p: 6800 }];
    const { items } = guardSourceItems(before, next, { maxJumpPct: 10 });
    expect(items).toEqual([{ s: 'فولاد', p: 540 }, { s: 'فملی', p: 680 }]);
    expect(guardSourceItems(before, next, { maxJumpPct: 15 }).items[0]).toEqual({ s: 'فولاد', p: 600 });
  });
});

describe('stale prices', () => {
  const NOW = '2026-01-01T12:00:00.000Z';
  const ago = (min) => new Date(Date.parse(NOW) - min * 60e3).toISOString();
  const src = (id, priceType, items, extra = {}) => ({ id, priceType, items, isActive: true, isPrimary: true, name: id, fetchIntervalSec: 60, ...extra });
  const sources = [
    src('src_usd', 'usd', [{ id: 'src_usd', price: 100000 }]),
    src('src_gold', 'gold_18k', [{ id: 'src_gold', price: 8000000 }]),
    src('src_ons', 'ons_gold', [{ id: 'src_ons', price: 2400 }], { quote: 'usd' }),
    src('src_fx', 'forex', [{ id: 'EUR', price: 1.1 }], { quote: 'usd_cross', fetchIntervalSec: 300 }),
  ];

  it('marks the items of a source that hasn\'t synced for a while, and what is computed from it', () => {
    const book = buildPriceBook(sources, {
      now: NOW,
      sourceStates: {
        src_usd: { syncedAt: ago(45) }, // 60s source: stale after 30 minutes
        src_gold: { syncedAt: ago(2) },
        src_ons: { syncedAt: ago(2) },
        src_fx: { syncedAt: ago(20) },
      },
    });
    expect(book.items.usd.params).toMatchObject({ stale: true, staleSince: ago(45) });
    expect(book.items.gold_18k.params.stale).toBeUndefined();
    // Computed from the stale dollar
    expect(book.items.eur.params.stale).toBe(true);
    expect(book.items.ons_gold.params.stale).toBe(true);
    expect(book.items.gold_24k.params.stale).toBe(true);
    expect(book.items.toman.params.stale).toBeUndefined();
  });

  it('never judges a source it has no sync time for, and takes a source\'s own limit', () => {
    const book = buildPriceBook(sources, { now: NOW });
    expect(Object.values(book.items).some((item) => item.params.stale)).toBe(false);
    expect(staleAfterSecOf({ fetchIntervalSec: 3600 })).toBe(5 * 3600);
    expect(staleAfterSecOf({ fetchIntervalSec: 60 })).toBe(1800);
    expect(staleAfterSecOf({ staleAfterSec: 120 })).toBe(120);
  });
});
