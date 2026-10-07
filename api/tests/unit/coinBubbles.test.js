/**
 * coinBubbles.test.js — Coin bubbles from tgju: a source of tgju series (each series' latest
 * value), items in tomans with their percent of the coin's gold value, a category that is shown
 * but never held, and the series offered for the history backfill
 */
import { describe, it, expect } from 'vitest';
import { tgjuIndicatorsSourceAdapter as adapter } from '../../src/services/market/sources/tgjuIndicators.source.adapter.js';
import { getAdapterForSource } from '../../src/services/market/sources/index.js';
import { PRICE_SOURCES_CONFIG } from '../../src/config/sources.config.js';
import { TGJU_CATALOG } from '../../src/config/tgjuCatalog.js';
import { isHoldableCategory, CATEGORY_MAP } from '../../src/config/categories.config.js';
import { PORTFOLIO_CATEGORIES } from '../../src/domain/specs/registry.js';
import { BUBBLE_SPECS } from '../../src/domain/specs/bubble.spec.js';
import { buildPriceBook } from '../../src/domain/priceBook.js';
import { toAsset } from '../../../web/src/features/market/priceBookAssets.js';

const source = PRICE_SOURCES_CONFIG.find((s) => s.id === 'src_def_tgju_bubbles');

/** tgju's summary table: the newest day first, prices in rials */
const tgju = (bySlug) => async (url) => {
  const slug = new URL(url).pathname.split('/').pop();
  if (!bySlug[slug]) return new Response('', { status: 404 });
  return new Response(JSON.stringify({ data: [[...bySlug[slug], '2026/10/06']] }));
};

describe('the tgju bubbles source', () => {
  it('is configured as tgju series of coin bubbles, in rials', () => {
    expect(source).toMatchObject({ sourceType: 'tgju_indicators', quote: 'rial', category: 'bubble', isActive: true });
    expect(source.series.map((s) => s.id)).toEqual(Object.keys(BUBBLE_SPECS));
    expect(getAdapterForSource(source)).toBe(adapter);
  });

  it('reads each series\' latest close; a series that fails is left out, the rest still update', async () => {
    const raw = await adapter.fetchRaw(source, null, tgju({
      coin_blubber: ['9,000,000', '8,500,000', '9,500,000', '9,200,000'],
      nim_blubber: ['6,000,000', '5,800,000', '6,100,000', '6,050,000'],
    }));
    const { items } = adapter.parse(raw);
    expect(items).toEqual([
      { id: 'bubble_full_coin', name: 'حباب سکه امامی', price: 9200000 },
      { id: 'bubble_half_coin', name: 'حباب نیم سکه', price: 6050000 },
    ]);
    expect(raw.find((r) => r.slug === 'rob_blubber').error).toBeTruthy();
  });

  it('fails only when no series answered', async () => {
    await expect(adapter.fetchRaw(source, null, tgju({}))).rejects.toThrow(/هیچ سری tgju خوانده نشد/);
    await expect(adapter.fetchRaw({ ...source, series: [] }, null, tgju({}))).rejects.toThrow(/تعریف نشده/);
  });
});

describe('coin bubbles in the price book', () => {
  const book = buildPriceBook([
    { id: 'src_def_full_coin', priceType: 'full_coin', isActive: true, isPrimary: true, category: 'coin', items: [{ id: 'src_def_full_coin', price: 100000000 }] },
    { ...source, items: [{ id: 'bubble_full_coin', name: 'حباب سکه امامی', price: 92000000 }] },
  ]);

  it('is a toman item of the bubble category with its percent of the coin\'s gold value', () => {
    // 9,200,000 tomans above a coin of 100,000,000: its gold is worth 90,800,000 → 10.13%
    expect(book.items.bubble_full_coin).toMatchObject({
      price: 9200000,
      category: 'bubble',
      name: 'حباب سکه امامی',
      params: { bubblePct: 10.13, bubbleOf: 'full_coin' },
    });
    expect(toAsset(book.items.bubble_full_coin)).toMatchObject({ badge: 'حباب', subText: expect.stringContaining('٪') });
  });

  it('has no percent without its coin\'s price', () => {
    const alone = buildPriceBook([{ ...source, items: [{ id: 'bubble_half_coin', price: 50000000 }] }]);
    expect(alone.items.bubble_half_coin.params.bubblePct).toBeUndefined();
  });
});

describe('a bubble is shown, never held', () => {
  it('its category is not holdable and is not a portfolio category', () => {
    expect(CATEGORY_MAP.bubble).toBeTruthy();
    expect(isHoldableCategory('bubble')).toBe(false);
    expect(isHoldableCategory('coin')).toBe(true);
    expect(isHoldableCategory('unknown')).toBe(true);
    expect(PORTFOLIO_CATEGORIES.map((c) => c.key)).not.toContain('bubble');
  });
});

describe('the history backfill offers the bubbles', () => {
  it('every bubble has its tgju series in the catalog, in rials, suggested for its item', () => {
    for (const s of source.series) {
      expect(TGJU_CATALOG.find((c) => c.slug === s.slug)).toMatchObject({ unit: 'rial', suggest: s.id });
    }
  });
});
