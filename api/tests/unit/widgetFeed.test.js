/**
 * widgetFeed.test.js — the Android widgets' feed: ids asked, a favourite's row and the news rows
 */

import { describe, it, expect } from 'vitest';
import {
  parseWidgetIds,
  widgetPriceOf,
  widgetPrices,
  widgetNewsOf,
  widgetAnalysisOf,
  aiNewsOf,
  WIDGET_NEWS_LIMIT,
  WIDGET_MAX_ITEMS,
} from '../../src/domain/widgetFeed.js';

describe('parseWidgetIds', () => {
  it('keeps the order, drops blanks and repeats, and stops at the limit', () => {
    expect(parseWidgetIds('usd, gold_18k,,usd')).toEqual(['usd', 'gold_18k']);
    const many = Array.from({ length: 20 }, (_, i) => `a${i}`).join(',');
    expect(parseWidgetIds(many)).toHaveLength(WIDGET_MAX_ITEMS);
    expect(parseWidgetIds('')).toEqual([]);
  });

  it('survives a malformed escape', () => {
    expect(() => parseWidgetIds('%E0%A4%A')).not.toThrow();
  });
});

describe('widgetPriceOf', () => {
  it('gives a toman asset its toman price and day change', () => {
    const row = widgetPriceOf({ id: 'usd', name: 'دلار', unit: 'تومان', price: 70000, params: { changePercent: 1.234 } });
    expect(row).toMatchObject({ id: 'usd', price: 70000, currency: 'toman', priceUsd: null, changePct: 1.23 });
  });

  it("gives a dollar-priced asset its own dollar price", () => {
    const row = widgetPriceOf({ id: 'ons_gold', name: 'انس', price: 280000000, currency: 'usd', priceUsd: 4000, params: { changePercent: -0.5 } });
    expect(row).toMatchObject({ price: 4000, currency: 'usd', priceUsd: 4000, changePct: -0.5 });
  });

  it('leaves out an item without a price, and a missing change is null', () => {
    expect(widgetPriceOf({ id: 'x', price: 0 })).toBeNull();
    expect(widgetPriceOf(undefined)).toBeNull();
    expect(widgetPriceOf({ id: 'x', price: 5 }).changePct).toBeNull();
  });

  it('lists the asked items in order, skipping unknown ones', () => {
    const items = { a: { id: 'a', price: 1 }, b: { id: 'b', price: 2 } };
    expect(widgetPrices(items, ['b', 'zzz', 'a']).map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('aiNewsOf', () => {
  it('keeps only the AI-picked news, in order, up to the limit', () => {
    const news = Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, ai: i % 2 === 0 }));
    const kept = aiNewsOf(news);
    expect(kept).toHaveLength(WIDGET_NEWS_LIMIT);
    expect(kept.every((n) => n.ai)).toBe(true);
    expect(kept[0].id).toBe('n0');
    expect(aiNewsOf([{ id: 'x', ai: false }])).toEqual([]);
    expect(aiNewsOf(null)).toEqual([]);
  });
});

describe('news and analysis rows', () => {
  it('carries a news item without its text', () => {
    const row = widgetNewsOf({ id: 'c/1', title: 't', text: 'long', category: 'gold', importance: 3, publishedAt: 5 }, { gold: 'طلا' });
    expect(row).toEqual({ id: 'c/1', title: 't', category: 'gold', categoryLabel: 'طلا', importance: 3, publishedAt: 5 });
  });

  it('shortens the analysis and drops an empty one', () => {
    expect(widgetAnalysisOf(null)).toBeNull();
    expect(widgetAnalysisOf({ title: 'x', summary: 'y'.repeat(500) }).summary).toHaveLength(280);
  });
});
