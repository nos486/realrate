/**
 * cardMetrics.test.js — What a home card can show: linked items read from the specs, each metric's
 * value from the price book item (its own currency, averages, the bubble analysis), the slot
 * options of a card and its links, and the layout's per-card settings
 */

import { describe, it, expect } from 'vitest';
import {
  linksOf,
  linkedItemId,
  parseSlotKey,
  metricValue,
  slotOptionsOf,
  cardSlotsOf,
  MAIN_METRICS,
  ANALYSIS_SLOTS,
  CARD_SLOT_LIMIT,
} from '../../src/domain/cardMetrics.js';
import { sanitizeHomeLayout } from '../../src/domain/homeLayout.js';

const coin = {
  id: 'full_coin', price: 100_000_000, sourceId: 'src_def_coin',
  params: { intrinsic: 80_000_000, targetBubblePct: 10, bubblePct: 25, changePercent: 1.2, avg: { '30d': { value: 95_000_000, days: 30 } } },
};
const bubble = {
  id: 'bubble_full_coin', price: 20_000_000, sourceId: 'src_def_tgju_bubbles',
  params: { bubblePct: 25, bubbleOf: 'full_coin', avg: { '30d': { value: 18_000_000, days: 30 }, '1y': { value: 15_000_000, days: 300 } } },
};
const ounce = {
  id: 'ons_gold', price: 400_000_000, currency: 'usd', priceUsd: 4000,
  params: { dayCurrency: 'usd', avg: { '30d': { value: 3900, days: 30 } }, toman: { avg: { '30d': { value: 380_000_000, days: 30 } }, changePercent: 2 }, changePercent: 1 },
};
const items = { full_coin: coin, bubble_full_coin: bubble, ons_gold: ounce };
const itemOf = (id) => items[id] || null;

describe('links between items', () => {
  it('a coin links to its bubble and the bubble to its coin, from the specs alone', () => {
    expect(linksOf('full_coin')).toEqual([{ kind: 'bubble', id: 'bubble_full_coin' }]);
    expect(linkedItemId('bubble_half_coin', 'coin')).toBe('half_coin');
    expect(linksOf('usd')).toEqual([]);
  });

  it('reads slot keys: own metrics and a linked item\'s', () => {
    expect(parseSlotKey('avg:30d')).toEqual({ link: null, metric: 'avg:30d' });
    expect(parseSlotKey('bubble/price')).toEqual({ link: 'bubble', metric: 'price' });
    expect(parseSlotKey('nope/price')).toBeNull();
    expect(parseSlotKey('avg:5y')).toBeNull();
  });
});

describe('metric values', () => {
  it('an average with how many days it is of', () => {
    expect(metricValue(coin, 'avg:30d')).toEqual({ value: 95_000_000, currency: 'toman', days: 30 });
    expect(metricValue(coin, 'avg:1y')).toBeNull();
  });

  it('a dollar-priced asset in dollars, or in tomans when its card says so', () => {
    expect(metricValue(ounce, 'price')).toEqual({ value: 4000, currency: 'usd' });
    expect(metricValue(ounce, 'avg:30d')).toEqual({ value: 3900, currency: 'usd', days: 30 });
    expect(metricValue(ounce, 'avg:30d', { display: 'toman' })).toEqual({ value: 380_000_000, currency: 'toman', days: 30 });
    expect(metricValue(ounce, 'change', { display: 'toman' })).toEqual({ value: 2 });
  });

  it('the bubble analysis at the book\'s rates, or at the user\'s (the calculator\'s row)', () => {
    expect(metricValue(coin, 'intrinsic')).toEqual({ value: 80_000_000, currency: 'toman' });
    expect(metricValue(coin, 'standard')).toEqual({ value: 88_000_000, currency: 'toman' });
    expect(metricValue(coin, 'deviation').value).toBeCloseTo(13.6, 1);
    const analysis = { intrinsic: 70_000_000, target_bubble_pct: 10, expected_price: 77_000_000, market: 100_000_000, diff_from_expected_pct: 29.9, bubble_pct: 42.9 };
    expect(metricValue(coin, 'standard', { analysis }).value).toBe(77_000_000);
    expect(metricValue(coin, 'bubblePct', { analysis }).value).toBe(42.9);
    expect(metricValue(ounce, 'intrinsic')).toBeNull();
  });

  it('a card offers its own metrics and its linked items\', only those with a value', () => {
    const keys = slotOptionsOf('full_coin', itemOf).map((o) => o.key);
    expect(keys).toEqual(expect.arrayContaining(['avg:30d', 'change', 'intrinsic', 'standard', 'deviation', 'bubblePct',
      'bubble/price', 'bubble/avg:30d', 'bubble/avg:1y', 'bubble/bubblePct']));
    expect(keys).not.toContain('price');
    expect(keys).not.toContain('avg:1y');
    expect(slotOptionsOf('full_coin', itemOf).find((o) => o.key === 'bubble/price').linkedId).toBe('bubble_full_coin');
  });

  it('until chosen, a gold or coin card shows the bubble analysis', () => {
    expect(cardSlotsOf(undefined, { market: 1 })).toEqual(ANALYSIS_SLOTS);
    expect(cardSlotsOf(undefined, { market: null })).toEqual(['standard', 'deviation']);
    expect(cardSlotsOf(undefined, null)).toEqual([]);
    expect(cardSlotsOf([], { market: 1 })).toEqual([]);
  });
});

describe('the layout keeps each card\'s settings', () => {
  it('a main average and valid slots, only for the section\'s items', () => {
    const layout = sanitizeHomeLayout({ sections: [{
      id: 's1', title: 'سکه', style: 'detailed', items: ['full_coin', 'usd'],
      cards: {
        full_coin: { main: 'avg:1y', slots: ['bubble/price', 'bubble/price', 'avg:30d', 'nope', 'intrinsic', 'change'] },
        usd: { main: 'price' },
        gone: { main: 'avg:30d' },
      },
    }] });
    expect(layout.sections[0].cards).toEqual({ full_coin: { main: 'avg:1y', slots: ['bubble/price', 'avg:30d', 'intrinsic'] } });
    expect(layout.sections[0].cards.full_coin.slots).toHaveLength(CARD_SLOT_LIMIT);
    expect(MAIN_METRICS).toContain('avg:30d');
  });

  it('an empty slot list is kept (no slots), and a section without settings has no `cards`', () => {
    const layout = sanitizeHomeLayout({ sections: [
      { id: 's1', style: 'detailed', items: ['full_coin'], cards: { full_coin: { slots: [] } } },
      { id: 's2', style: 'compact', items: ['usd'] },
    ] });
    expect(layout.sections[0].cards).toEqual({ full_coin: { slots: [] } });
    expect(layout.sections[1].cards).toBeUndefined();
  });
});
