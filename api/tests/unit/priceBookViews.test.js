/**
 * priceBookViews.test.js — The header's reference rates, the calculator's live rates and the
 * older /api/prices shape are all read off the price book, so they can never disagree with it
 */

import { describe, it, expect } from 'vitest';
import { buildPriceBook } from '../../src/domain/priceBook.js';
import { baseRatesOf, referenceRatesOf, legacyPricesOf, forexCrossRatesOf } from '../../src/domain/priceBookViews.js';

const NOW = '2026-01-01T00:00:00.000Z';
const source = (id, priceType, items, extra = {}) => ({ id, priceType, items, isActive: true, isPrimary: true, name: id, ...extra });

const book = buildPriceBook([
  source('src_def_usd', 'usd', [{ id: 'src_def_usd', price: 95000 }]),
  source('src_brs_usdt', 'USDT', [{ id: 'src_brs_usdt', price: 95200 }], { displayConfig: { showOnHomePage: true } }),
  source('src_hidden', 'hidden_coin', [{ id: 'src_hidden', price: 12000 }], { displayConfig: { showOnHomePage: false } }),
  source('src_def_ons_gold', 'ons_gold', [{ id: 'src_def_ons_gold', price: 2400 }], { quote: 'usd' }),
  source('src_def_ons_silver', 'ons_silver', [{ id: 'src_def_ons_silver', price: 30 }], { quote: 'usd' }),
  source('src_def_forex', 'forex', [{ id: 'EUR', price: 1.1 }, { id: 'TRY', price: 0.02 }], {
    quote: 'usd_cross',
    displayConfig: { homePageOutputs: ['EUR'] },
  }),
  source('src_def_bourse', 'bourse', [{ id: 'فولاد', price: 540 }], { isCatalog: true }),
], { now: NOW });

describe('views of the price book', () => {
  it('gives the calculator the book\'s dollar and ounce rates', () => {
    expect(baseRatesOf(book)).toEqual({ usdToman: 95000, goldUsd: 2400, silverUsd: 30 });
    expect(baseRatesOf(null)).toEqual({ usdToman: 0, goldUsd: 0, silverUsd: 0 });
  });

  it('lists the configured reference rates at their book prices, in order', () => {
    const refs = referenceRatesOf(book);
    expect(refs.map((r) => [r.key, r.price])).toEqual([['usd', 95000], ['usdt', 95200]]);
    expect(refs[1].symbol).toBe('₮');
    expect(referenceRatesOf({ items: {} })).toEqual([]);
  });

  it('keeps the older /api/prices shape: dollar quotes in dollars, the rest in tomans', () => {
    const prices = legacyPricesOf(book);
    expect(prices.usd).toMatchObject({ price: 95000, sourceId: 'src_def_usd', showOnHomePage: true });
    expect(prices.usd_toman).toBe(prices.usd);
    expect(prices.ons_gold).toMatchObject({ price: 2400, priceToman: 2400 * 95000 });
    expect(prices.eur).toMatchObject({ price: 1.1, usdCrossRate: 1.1, showOnHomePage: true });
    expect(prices.try.showOnHomePage).toBe(false);
    expect(prices.hidden_coin.showOnHomePage).toBe(false);
    expect(prices['src_def_bourse__فولاد'].price).toBe(540);
    expect(prices.gold_24k).toBeUndefined(); // computed items were never in /api/prices
    expect(prices.reference_rates).toHaveLength(2);
    expect(forexCrossRatesOf(book)).toEqual({ EUR: 1.1, TRY: 0.02 });
  });
});
