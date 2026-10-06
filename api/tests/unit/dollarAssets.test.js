/**
 * dollarAssets.test.js — The standard for assets priced in dollars (the world ounce, oil,
 * bitcoin): one id, a toman `price` as always, and `currency: "usd"` with its dollar price; their
 * dollar closes kept as `${id}@usd`; their day range and change in dollars
 */
import { describe, it, expect } from 'vitest';
import {
  buildPriceBook,
  currencyOf,
  usdSeriesKey,
  liveSeriesValue,
  historyKeysOf,
  roundUsd,
} from '../../src/domain/priceBook.js';
import { historyPointsOf, withDayRange } from '../../src/services/market/sourceSync.service.js';
import { PRICE_SOURCES_CONFIG } from '../../src/config/sources.config.js';
import { CATEGORY_MAP } from '../../src/config/categories.config.js';
import { apiUrlSourceAdapter } from '../../src/services/market/sources/apiUrl.source.adapter.js';
import { ownPriceOf, formatPrice, tomanEquivalent } from '../../../web/src/features/market/assetPrice.js';
import { toAsset } from '../../../web/src/features/market/priceBookAssets.js';

const src = (id, priceType, price, extra = {}) => ({ id, priceType, isActive: true, isPrimary: true, items: [{ id, price }], ...extra });
const sources = [
  src('src_def_usd', 'usd', 100000, { category: 'currency', unit: 'دلار' }),
  src('src_def_ons_gold', 'ons_gold', 2650.456, { quote: 'usd', category: 'gold', unit: 'اونس' }),
  src('src_def_oil_brent', 'oil_brent', 71.7, { quote: 'usd', category: 'commodity', unit: 'بشکه' }),
  src('src_def_gold_18k', 'gold_18k', 9000000, { category: 'gold', unit: 'گرم' }),
];

describe('dollar-priced assets in the price book', () => {
  const book = buildPriceBook(sources, { now: '2026-10-06T08:00:00Z' });

  it('keeps one id, a toman price, and the dollar price as the asset\'s own', () => {
    const ons = book.items.ons_gold;
    expect(ons.currency).toBe('usd');
    expect(ons.priceUsd).toBe(2650.46);
    expect(ons.price).toBe(265046000);
    expect(ons.unit).toBe('اونس');
    // Older clients still read the dollar value here
    expect(ons.params.usd).toBe(2650.46);
    const oil = book.items.oil_brent;
    expect(oil).toMatchObject({ currency: 'usd', priceUsd: 71.7, price: 7170000, unit: 'بشکه', category: 'commodity', name: 'نفت برنت' });
  });

  it('leaves toman assets as they were (no currency field)', () => {
    expect(book.items.gold_18k.currency).toBeUndefined();
    expect(currencyOf(book.items.gold_18k)).toBe('toman');
    expect(book.items.usd.priceUsd).toBeUndefined();
  });

  it('reads each history key\'s live value: tomans under the id, dollars under @usd', () => {
    expect(usdSeriesKey('ONS_GOLD')).toBe('ons_gold@usd');
    expect(liveSeriesValue(book.items, 'ons_gold')).toBe(265046000);
    expect(liveSeriesValue(book.items, 'ons_gold@usd')).toBe(2650.46);
    expect(liveSeriesValue(book.items, 'gold_18k@usd')).toBe(0);
    expect(historyKeysOf(book.items)).toEqual(expect.arrayContaining(['ons_gold', 'ons_gold@usd', 'oil_brent@usd', 'gold_18k']));
    expect(historyKeysOf(book.items)).not.toContain('gold_18k@usd');
  });

  it('rounds dollars to cents, small ones to four digits', () => {
    expect(roundUsd(2650.456)).toBe(2650.46);
    expect(roundUsd(0.123456)).toBe(0.1235);
    expect(roundUsd(-1)).toBe(0);
  });
});

describe('history and day range of dollar-priced assets', () => {
  it('records the dollar close beside the toman one', () => {
    const book = buildPriceBook(sources, { now: '2026-10-06T08:00:00Z' });
    const points = historyPointsOf(book, null, new Set(sources.map((s) => s.id)));
    expect(points).toEqual(expect.arrayContaining([
      { id: 'ons_gold', price: 265046000 },
      { id: 'ons_gold@usd', price: 2650.46 },
      { id: 'oil_brent@usd', price: 71.7 },
    ]));
    expect(points.find((p) => p.id === 'gold_18k@usd')).toBeUndefined();
  });

  it('records a dollar move even when the toman price rounds the same', () => {
    const at = '2026-10-06T08:10:00Z';
    const prev = { updatedAt: '2026-10-06T08:09:00Z', items: { ons_gold: { id: 'ons_gold', price: 100, currency: 'usd', priceUsd: 1 }, x: { id: 'x', price: 5 } } };
    const next = { updatedAt: at, items: { ons_gold: { id: 'ons_gold', price: 100, currency: 'usd', priceUsd: 1.01 }, x: { id: 'x', price: 5 } } };
    expect(historyPointsOf(next, prev, new Set())).toEqual([{ id: 'ons_gold', price: 100 }, { id: 'ons_gold@usd', price: 1.01 }]);
  });

  it('measures the day range and the change in dollars, and starts over from a toman range', () => {
    const t = Date.parse('2026-10-06T08:00:00Z');
    const usdItem = (priceUsd, price) => ({ items: { ons_gold: { id: 'ons_gold', price, currency: 'usd', priceUsd, params: {} } } });
    // The book before this standard: a toman range for today
    const old = { items: { ons_gold: { id: 'ons_gold', price: 265000000, params: { day: '1405-07-14', dayOpen: 265000000, dayHigh: 266000000, dayLow: 264000000 } } } };
    let b = withDayRange(usdItem(2650, 265000000), old, t);
    expect(b.items.ons_gold.params).toMatchObject({ dayOpen: 2650, dayHigh: 2650, dayLow: 2650, dayCurrency: 'usd' });
    b = withDayRange(usdItem(2700, 266000000), b, t + 60000);
    expect(b.items.ons_gold.params).toMatchObject({ dayOpen: 2650, dayHigh: 2700, dayLow: 2650 });
    expect(b.items.ons_gold.params.changePercent).toBeCloseTo(1.89, 2);
  });
});

describe('the dollar sources', () => {
  it('every dollar-quoted source names its unit and a category that exists', () => {
    const usd = PRICE_SOURCES_CONFIG.filter((s) => s.quote === 'usd');
    expect(usd.map((s) => s.priceType)).toEqual(expect.arrayContaining(['ons_gold', 'ons_silver', 'ons_platinum', 'ons_palladium', 'BTC', 'ETH', 'oil_brent', 'oil_wti']));
    for (const s of usd) {
      expect(s.unit).toBeTruthy();
      expect(CATEGORY_MAP[s.category]).toBeTruthy();
    }
  });

  it('reads oil off the chart API, and keeps a dollar quote\'s cents by its quote', () => {
    const brent = PRICE_SOURCES_CONFIG.find((s) => s.id === 'src_def_oil_brent');
    const raw = JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 71.73 } }] } });
    expect(apiUrlSourceAdapter.parse(raw, brent).items[0].price).toBe(71.73);
    expect(() => apiUrlSourceAdapter.parse(JSON.stringify({ chart: { result: [] } }), brent)).toThrow();
    const xpt = PRICE_SOURCES_CONFIG.find((s) => s.id === 'src_def_ons_platinum');
    expect(apiUrlSourceAdapter.parse(JSON.stringify({ price: 981.456 }), xpt).items[0].price).toBe(981.46);
  });
});

describe('screens show a dollar-priced asset in dollars', () => {
  const book = buildPriceBook(sources, { now: '2026-10-06T08:00:00Z' });

  it('its own price and the toman line under it', () => {
    const ons = toAsset(book.items.ons_gold);
    expect(ons.currency).toBe('usd');
    expect(ownPriceOf(ons)).toEqual({ value: 2650.46, currency: 'usd', unit: 'دلار', toman: 265046000 });
    expect(ons.subText).toContain('تومان');
    expect(tomanEquivalent(ons)).toContain('≈');
    const gold = toAsset(book.items.gold_18k);
    expect(ownPriceOf(gold)).toMatchObject({ value: 9000000, currency: 'toman', unit: 'تومان' });
    expect(tomanEquivalent(gold)).toBe('');
  });

  it('formats dollars with their cents, tomans whole', () => {
    expect(formatPrice(71.7, 'usd')).toBe((71.7).toLocaleString('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    expect(formatPrice(9000000.4)).toBe((9000000).toLocaleString('fa-IR'));
    expect(formatPrice(null)).toBe('-');
  });
});
