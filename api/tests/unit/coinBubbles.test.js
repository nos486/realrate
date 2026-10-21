/**
 * coinBubbles.test.js — Gold and coins from tgju (one multi-output source of tgju series, each
 * series' latest value), and coin bubbles computed by the price book — the coin's market price
 * less its gold value from the world ounce and the dollar, never taken from tgju — in tomans with
 * the coin's own percent, a category that is shown but never held, their past days computed from
 * our own history, and the series offered for the history backfill
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
import { TROY_OUNCE_GRAMS } from '../../src/domain/specs/gold.spec.js';
import { COIN_SPECS } from '../../src/domain/specs/coin.spec.js';
import { toAsset } from '../../../web/src/features/market/priceBookAssets.js';

const source = PRICE_SOURCES_CONFIG.find((s) => s.id === 'src_def_tgju');

/** tgju: its summary table (the newest day first) and, when given, its live feed; prices in rials */
const tgju = (bySlug, current = null) => async (url) => {
  const { hostname, pathname } = new URL(url);
  if (hostname === 'call1.tgju.org') {
    return current ? new Response(JSON.stringify({ current })) : new Response('', { status: 503 });
  }
  const slug = pathname.split('/').pop();
  if (!bySlug[slug]) return new Response('', { status: 404 });
  return new Response(JSON.stringify({ data: [[...bySlug[slug], '2026/10/06']] }));
};

describe('the tgju source', () => {
  it('is one multi-output source of tgju series in rials: gold and coins, no bubble', () => {
    expect(source).toMatchObject({ sourceType: 'tgju_indicators', quote: 'rial', outputs: 'multi', isActive: true, isPrimary: true });
    expect(source.fetchIntervalSec).toBe(300);
    const ids = source.series.map((s) => s.id);
    expect(ids).toEqual(['gold_18k', 'mesghal', 'full_coin', 'half_coin', 'quarter_coin', 'gerami_coin']);
    // A bubble is the price book's own, never read from tgju
    for (const id of Object.keys(BUBBLE_SPECS)) expect(ids).not.toContain(id);
    expect(getAdapterForSource(source)).toBe(adapter);
    // No other source gives these prices
    for (const other of PRICE_SOURCES_CONFIG.filter((s) => s !== source)) {
      expect(ids).not.toContain(String(other.priceType || '').toLowerCase());
    }
  });

  it('reads every series\' current price from the live feed, in one request', async () => {
    const urls = [];
    const feed = tgju({}, {
      geram18: { p: '105,000,000', h: '106,000,000', l: '104,000,000', ts: '2026-10-21 15:30:00' },
      sekee: { p: '1,120,000,000' }, nim: { p: '600,000,000' }, rob: { p: '350,000,000' },
      gerami: { p: '180,000,000' }, mesghal: { p: '455,000,000' }, price_dollar_rl: { p: '1,000,000' },
    });
    const raw = await adapter.fetchRaw(source, null, async (url, init) => { urls.push(url); return feed(url, init); });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/^https:\/\/call1\.tgju\.org\/ajax\.json\?rev=\d+$/);
    const { items } = adapter.parse(raw);
    expect(items.map((i) => i.id)).toEqual(['gold_18k', 'mesghal', 'full_coin', 'half_coin', 'quarter_coin', 'gerami_coin']);
    expect(items[0]).toEqual({ id: 'gold_18k', name: 'طلای ۱۸ عیار', price: 105000000 });
  });

  it('a series the live feed lacks is read from its daily table', async () => {
    const raw = await adapter.fetchRaw(source, null, tgju(
      { nim: ['500,000,000', '495,000,000', '505,000,000', '502,000,000'] },
      { sekee: { p: '1,120,000,000' }, nim: { p: '' } },
    ));
    const { items } = adapter.parse(raw);
    expect(items).toEqual([
      { id: 'full_coin', name: 'سکه امامی', price: 1120000000 },
      { id: 'half_coin', name: 'نیم سکه', price: 502000000 },
    ]);
  });

  it('without the live feed, reads each series\' latest close; a series that fails is left out, the rest still update', async () => {
    const raw = await adapter.fetchRaw(source, null, tgju({
      sekee: ['1,000,000,000', '990,000,000', '1,010,000,000', '1,005,000,000'],
      nim: ['500,000,000', '495,000,000', '505,000,000', '502,000,000'],
    }));
    const { items } = adapter.parse(raw);
    expect(items).toEqual([
      { id: 'full_coin', name: 'سکه امامی', price: 1005000000 },
      { id: 'half_coin', name: 'نیم سکه', price: 502000000 },
    ]);
    expect(raw.find((r) => r.slug === 'geram18').error).toBeTruthy();
  });

  it('a request to tgju has a time limit: a slow tgju never holds the minute\'s sync up', async () => {
    const signals = [];
    await adapter.fetchRaw({ ...source, series: [source.series[0]] }, null, async (url, init) => {
      signals.push(init?.signal);
      return new Response(JSON.stringify({ data: [['1', '1', '1', '1', '2026/10/06']] }));
    });
    // The live feed (unreadable here), then the series' daily table
    expect(signals).toHaveLength(2);
    for (const signal of signals) expect(signal).toBeInstanceOf(AbortSignal);
  });

  it('fails only when no series answered', async () => {
    await expect(adapter.fetchRaw(source, null, tgju({}))).rejects.toThrow(/هیچ سری tgju خوانده نشد/);
    await expect(adapter.fetchRaw({ ...source, series: [] }, null, tgju({}))).rejects.toThrow(/تعریف نشده/);
  });
});

describe('gold, coins and bubbles in the price book', () => {
  // The coin from tgju (rials), the dollar and the world ounce: its gold value is ours
  const usd = { id: 'src_usd', priceType: 'usd', isActive: true, isPrimary: true, items: [{ id: 'usd', price: 100000 }] };
  const ounce = { id: 'src_ons', priceType: 'ons_gold', quote: 'usd', isActive: true, isPrimary: true, items: [{ id: 'ons_gold', price: 4000 }] };
  const coin = (rials, extra = []) => ({ ...source, items: [{ id: 'full_coin', name: 'سکه امامی', price: rials }, ...extra] });
  const gold = Math.round((4000 / TROY_OUNCE_GRAMS) * 100000 * COIN_SPECS.full_coin.gold24kWeight);

  it('the coin is a coin, in tomans', () => {
    const book = buildPriceBook([usd, ounce, coin(1_000_000_000)]);
    expect(book.items.full_coin).toMatchObject({ price: 100000000, category: 'coin', sourceId: 'src_def_tgju' });
  });

  it('a bubble is the coin\'s price less its gold value, with the coin\'s own percent — whatever a feed says', () => {
    // A stale tgju bubble still stored for the source is not taken
    const book = buildPriceBook([usd, ounce, coin(1_000_000_000, [{ id: 'bubble_full_coin', price: 92_000_000 }])]);
    const coinItem = book.items.full_coin;
    expect(coinItem.params.intrinsic).toBe(gold);
    expect(book.items.bubble_full_coin).toMatchObject({
      price: 100000000 - gold,
      category: 'bubble',
      name: 'حباب سکه امامی',
      sourceId: null,
      params: { derived: 'bubble', bubbleOf: 'full_coin', bubblePct: coinItem.params.bubblePct },
    });
    expect(toAsset(book.items.bubble_full_coin)).toMatchObject({ badge: 'حباب', subText: expect.stringContaining('٪') });
  });

  it('has no bubble without the coin\'s market price or its gold value, nor one not above zero', () => {
    expect(buildPriceBook([usd, ounce]).items.bubble_full_coin).toBeUndefined();
    expect(buildPriceBook([usd, coin(1_000_000_000)]).items.bubble_full_coin).toBeUndefined();
    expect(buildPriceBook([usd, ounce, coin((gold - 1000) * 10)]).items.bubble_full_coin).toBeUndefined();
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
  it('each series has its tgju slug in the catalog, in rials, suggested for its item; no bubble', () => {
    for (const s of source.series) {
      expect(TGJU_CATALOG.find((c) => c.slug === s.slug)).toMatchObject({ unit: 'rial', suggest: s.id });
    }
    for (const id of Object.keys(BUBBLE_SPECS)) expect(TGJU_CATALOG.find((c) => c.suggest === id)).toBeUndefined();
  });
});
