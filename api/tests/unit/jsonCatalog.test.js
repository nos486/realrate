/**
 * jsonCatalog.test.js — the generic JSON catalog adapter (car prices) and the car source's config
 */
import { describe, it, expect } from 'vitest';
import { catalogItemsOf, jsonCatalogSourceAdapter } from '../../src/services/market/sources/jsonCatalog.source.adapter.js';
import { PRICE_SOURCES_CONFIG } from '../../src/config/sources.config.js';
import { CATEGORY_MAP, isHoldableCategory } from '../../src/config/categories.config.js';

const cars = PRICE_SOURCES_CONFIG.find((s) => s.id === 'src_def_cars');

describe('jsonCatalog adapter', () => {
  const rows = [
    { brand: 'پژو', model: '206 تیپ 2', year: 1402, priceToman: '478,000,000' },
    { brand: 'سمند', model: 'LX', year: 1400, priceToman: 0 },
    { brand: '', model: '', year: '', priceToman: 5 },
    null,
  ];

  it('joins the configured fields and leaves out rows without an id or a price', () => {
    expect(catalogItemsOf(rows, cars.catalogFields)).toEqual([
      { id: 'پژو_206 تیپ 2_1402', name: 'پژو 206 تیپ 2 1402', price: 478000000 },
    ]);
  });

  it('reads rows from a bare array or from the configured path', () => {
    const src = { ...cars };
    expect(jsonCatalogSourceAdapter.parse(rows, src).items).toHaveLength(1);
    expect(jsonCatalogSourceAdapter.parse({ items: rows }, src).items).toHaveLength(1);
  });

  it('throws when the feed holds no priced row or the config has no fields', () => {
    expect(() => jsonCatalogSourceAdapter.parse([], cars)).toThrow();
    expect(() => jsonCatalogSourceAdapter.parse(rows, { id: 'x' })).toThrow();
  });

  it('fails readably while the feed URL is not set', async () => {
    await expect(jsonCatalogSourceAdapter.fetchRaw(cars, {})).rejects.toThrow('تنظیم نشده');
  });
});

describe('car source config', () => {
  it('is a catalog of the holdable «car» category', () => {
    expect(cars.isCatalog).toBe(true);
    expect(cars.market).toBe('car');
    expect(CATEGORY_MAP[cars.category]).toBeDefined();
    expect(isHoldableCategory(cars.category)).toBe(true);
  });
});

describe('car items in the price book', () => {
  it('become «car» holdings with a market id, a toman price and the source unit', async () => {
    const { buildPriceBook } = await import('../../src/domain/priceBook.js');
    const src = { ...cars, items: [{ id: 'پژو_206_1402', name: 'پژو 206 1402', price: 478000000 }], syncedAt: new Date().toISOString() };
    const book = buildPriceBook([src], { now: new Date().toISOString() });
    const item = Object.values(book.items).find((i) => i.id.startsWith('car__'));
    expect(item).toMatchObject({ category: 'car', price: 478000000, unit: 'دستگاه' });
  });
});
