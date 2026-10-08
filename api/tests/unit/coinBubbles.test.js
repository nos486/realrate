/**
 * coinBubbles.test.js — Gold, coins and coin bubbles from tgju: one multi-output source of tgju
 * series (each series' latest value) whose items take their category from their spec (a coin, a
 * bubble), bubbles in tomans with their percent of the coin's gold value and a jump limit of their
 * own, a category that is shown but never held, and the series offered for the history backfill
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
import { guardOf } from '../../src/domain/priceSources.js';
import { guardSourceItems } from '../../src/domain/priceGuard.js';
import { toAsset } from '../../../web/src/features/market/priceBookAssets.js';

const source = PRICE_SOURCES_CONFIG.find((s) => s.id === 'src_def_tgju');

/** tgju's summary table: the newest day first, prices in rials */
const tgju = (bySlug) => async (url) => {
  const slug = new URL(url).pathname.split('/').pop();
  if (!bySlug[slug]) return new Response('', { status: 404 });
  return new Response(JSON.stringify({ data: [[...bySlug[slug], '2026/10/06']] }));
};

describe('the tgju source', () => {
  it('is one multi-output source of tgju series in rials: gold, coins and every coin bubble', () => {
    expect(source).toMatchObject({ sourceType: 'tgju_indicators', quote: 'rial', outputs: 'multi', isActive: true, isPrimary: true });
    const ids = source.series.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['gold_18k', 'mesghal', 'full_coin', 'half_coin', 'quarter_coin', 'gerami_coin', ...Object.keys(BUBBLE_SPECS)]));
    expect(getAdapterForSource(source)).toBe(adapter);
    // No other source gives these prices
    for (const other of PRICE_SOURCES_CONFIG.filter((s) => s !== source)) {
      expect(ids).not.toContain(String(other.priceType || '').toLowerCase());
    }
  });

  it('a bubble has a jump limit of its own; a price keeps the source\'s', () => {
    const guard = guardOf(source);
    expect(guard.maxJumpPctByKey).toEqual(Object.fromEntries(Object.keys(BUBBLE_SPECS).map((id) => [id, 100])));
    const prev = [{ id: 'full_coin', price: 1000 }, { id: 'bubble_full_coin', price: 100 }];
    const next = [{ id: 'full_coin', price: 1500 }, { id: 'bubble_full_coin', price: 170 }];
    const { items, rejected } = guardSourceItems(prev, next, guard);
    expect(items).toEqual([{ id: 'full_coin', price: 1000 }, { id: 'bubble_full_coin', price: 170 }]);
    expect(rejected.map((r) => r.key)).toEqual(['full_coin']);
  });

  it('reads each series\' latest close; a series that fails is left out, the rest still update', async () => {
    const raw = await adapter.fetchRaw(source, null, tgju({
      sekee: ['1,000,000,000', '990,000,000', '1,010,000,000', '1,005,000,000'],
      coin_blubber: ['9,000,000', '8,500,000', '9,500,000', '9,200,000'],
    }));
    const { items } = adapter.parse(raw);
    expect(items).toEqual([
      { id: 'full_coin', name: 'سکه امامی', price: 1005000000 },
      { id: 'bubble_full_coin', name: 'حباب سکه امامی', price: 9200000 },
    ]);
    expect(raw.find((r) => r.slug === 'geram18').error).toBeTruthy();
  });

  it('a request to tgju has a time limit: a slow tgju never holds the minute\'s sync up', async () => {
    const signals = [];
    await adapter.fetchRaw({ ...source, series: [source.series[0]] }, null, async (url, init) => {
      signals.push(init?.signal);
      return new Response(JSON.stringify({ data: [['1', '1', '1', '1', '2026/10/06']] }));
    });
    expect(signals).toHaveLength(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
  });

  it('fails only when no series answered', async () => {
    await expect(adapter.fetchRaw(source, null, tgju({}))).rejects.toThrow(/هیچ سری tgju خوانده نشد/);
    await expect(adapter.fetchRaw({ ...source, series: [] }, null, tgju({}))).rejects.toThrow(/تعریف نشده/);
  });
});

describe('gold, coins and bubbles in the price book', () => {
  // One source: the coin and its bubble, in rials
  const book = buildPriceBook([
    { ...source, items: [{ id: 'full_coin', name: 'سکه امامی', price: 1000000000 }, { id: 'bubble_full_coin', name: 'حباب سکه امامی', price: 92000000 }] },
  ]);

  it('the coin is a coin and the bubble a bubble, each from its spec, in tomans', () => {
    expect(book.items.full_coin).toMatchObject({ price: 100000000, category: 'coin', sourceId: 'src_def_tgju' });
  });

  it('a bubble is a toman item of the bubble category with its percent of the coin\'s gold value', () => {
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

describe('the history backfill offers every series', () => {
  it('each series has its tgju slug in the catalog, in rials, suggested for its item', () => {
    for (const s of source.series) {
      expect(TGJU_CATALOG.find((c) => c.slug === s.slug)).toMatchObject({ unit: 'rial', suggest: s.id });
    }
  });
});
