/**
 * priceBook.test.js — One standard price item per id, in tomans, for every source
 */

import { describe, it, expect } from 'vitest';
import {
  buildPriceBook,
  findPrimaryIdConflicts,
  catalogAssetId,
  catalogItemPriceToman,
  BASE_PRICE_IDS,
} from '../../src/domain/priceBook.js';
import { getMasterPriceSourcesConfig } from '../../src/config/sources.config.js';
import { TROY_OUNCE_GRAMS } from '../../src/domain/specs/gold.spec.js';

const NOW = '2026-01-01T00:00:00.000Z';
const single = (id, priceType, lastPrice, extra = {}) => ({ id, priceType, lastPrice, isActive: true, isPrimary: true, name: id, ...extra });

describe('buildPriceBook', () => {
  const usd = single('src_usd', 'usd', 100000);
  const gold = single('src_gold', 'gold_18k', 8000000, { bubblePct: 3 });
  const ounce = single('src_ons', 'ons_gold', 2400, { quote: 'usd', unit: 'اونس' });
  const forex = {
    id: 'src_fx', priceType: 'forex', quote: 'usd_cross', isActive: true, isPrimary: true, name: 'fx',
    lastMultiData: { items: [{ id: 'EUR', price: 1.1 }, { id: 'TRY', price: 0.02 }, { id: 'CNY', price: 0.14 }] },
    excludedOutputs: ['CNY'],
  };
  const bourse = {
    id: 'src_def_bourse', isCatalog: true, isActive: true, isPrimary: true, name: 'bourse',
    lastMultiData: { items: [{ id: 'فولاد', name: 'فولاد مبارکه', price: 540 }, { symbol: 'فملی', priceRial: 6800 }] },
  };

  const book = buildPriceBook([usd, gold, ounce, forex, bourse], { now: NOW });

  it('keeps every price in tomans under a lower-case id', () => {
    expect(book.updatedAt).toBe(NOW);
    expect(book.items.usd).toMatchObject({ id: 'usd', price: 100000, sourceId: 'src_usd' });
    expect(book.items.gold_18k.price).toBe(8000000);
    for (const item of Object.values(book.items)) {
      expect(item.id).toBe(item.id.toLowerCase());
      expect(Number.isFinite(item.price)).toBe(true);
      expect(item).toHaveProperty('params');
    }
  });

  it('turns dollar quotes into tomans with the book\'s own USD price, once', () => {
    expect(book.items.ons_gold).toMatchObject({ price: 240000000, unit: 'اونس', params: { usd: 2400 } });
    expect(book.items.eur).toMatchObject({ price: 110000, params: { usdCross: 1.1 } });
    expect(book.items.try).toMatchObject({ price: 2000, params: { usdCross: 0.02 } });
    expect(book.items.cny).toBeUndefined(); // excluded output
  });

  it('gives catalog items their catalog id and a toman price', () => {
    expect(book.items[catalogAssetId('src_def_bourse', 'فولاد')]).toMatchObject({ price: 540, name: 'فولاد مبارکه' });
    expect(book.items['src_def_bourse__فملی'].price).toBe(680);
  });

  it('adds intrinsic values: on market items, and as items where no source prices them', () => {
    const goldGram = (2400 / TROY_OUNCE_GRAMS) * 100000;
    expect(book.items.gold_18k.params.intrinsic).toBe(Math.round(goldGram * 0.75));
    expect(book.items.gold_18k.params.targetBubblePct).toBe(3);
    expect(book.items.gold_24k).toMatchObject({ price: Math.round(goldGram), sourceId: null });
    expect(book.items.gold_24k.params.derived).toBe('intrinsic');
    expect(book.items.toman).toMatchObject({ price: 1, params: { derived: 'static' } });
  });

  it('keeps the plain id for the primary source and prefixes every other copy', () => {
    const other = single('src_usd_2', 'usd', 99000, { isPrimary: false });
    const b = buildPriceBook([other, usd], { now: NOW });
    expect(b.items.usd.sourceId).toBe('src_usd');
    expect(b.items.src_usd_2__usd).toMatchObject({ price: 99000, sourceId: 'src_usd_2' });
  });

  it('never makes a dollar-quoted price without a USD price, and never lists the feed\'s USD', () => {
    const b = buildPriceBook([ounce, forex], { now: NOW });
    expect(b.items.ons_gold).toBeUndefined();
    expect(b.items.eur).toBeUndefined();
  });

  it('falls back to a single-price source\'s one-item list when it has no price of its own', () => {
    const b = buildPriceBook([
      single('src_def_usd', 'usd', 0, { lastMultiData: { items: [{ id: 'src_def_usd', price: 101500 }] } }),
    ], { now: NOW });
    expect(Object.keys(b.items).filter((k) => k !== 'toman')).toEqual(['usd']);
    expect(b.items.usd.price).toBe(101500);
  });

  it('takes a single source\'s latest price, never an older copy stored beside it', () => {
    // The dollar showed 231,500 for hours while its source said 234,000: the book read a stale
    // one-item list instead of the source's price
    const b = buildPriceBook([
      single('src_def_usd', 'usd', 234000, { lastMultiData: { items: [{ id: 'src_def_usd', price: 231500 }] } }),
    ], { now: NOW });
    expect(b.items.usd.price).toBe(234000);
  });

  it('skips inactive sources and empty prices', () => {
    const b = buildPriceBook([single('a', 'x', 0), single('b', 'y', 5, { isActive: false })], { now: NOW });
    expect(b.items.x).toBeUndefined();
    expect(b.items.y).toBeUndefined();
  });
});

describe('the source config follows the standard', () => {
  const sources = getMasterPriceSourcesConfig();

  it('has no id claimed by two primary sources', () => {
    const withValues = sources.map((s) => ({ ...s, lastPrice: 1, lastMultiData: null }));
    expect(findPrimaryIdConflicts(withValues)).toEqual([]);
  });

  it('declares a known quote for every source, and the base items exist', () => {
    for (const s of sources) {
      if (s.quote !== undefined) expect(['toman', 'rial', 'usd', 'usd_cross']).toContain(s.quote);
    }
    const priceTypes = new Set(sources.map((s) => String(s.priceType).toLowerCase()));
    expect(priceTypes.has(BASE_PRICE_IDS.usd)).toBe(true);
    expect(priceTypes.has(BASE_PRICE_IDS.goldOunce)).toBe(true);
  });

  it('reads catalog prices from whichever field a feed fills', () => {
    expect(catalogItemPriceToman({ price: 10.4 })).toBe(10);
    expect(catalogItemPriceToman({ priceRial: 1000 })).toBe(100);
    expect(catalogItemPriceToman({ pl: 50 })).toBe(5);
    expect(catalogItemPriceToman({})).toBe(0);
  });
});
