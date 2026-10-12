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

  const fields = { id: ['brand', 'model', 'year'], name: ['brand', 'model', 'year'], price: 'priceToman' };

  it('joins the configured fields and leaves out rows without an id or a price', () => {
    expect(catalogItemsOf(rows, fields)).toEqual([
      { id: 'پژو_206 تیپ 2_1402', name: 'پژو 206 تیپ 2 1402', price: 478000000 },
    ]);
  });

  it('reads the first of a path\'s a|b alternatives that a row has', () => {
    expect(catalogItemsOf([{ model: 'تارا', year: '1404', price: '1,250,000,000' }, { name: 'شاهین', year: 1404, price_toman: 980000000 }], cars.catalogFields)).toEqual([
      { id: 'تارا_1404', name: 'تارا 1404', price: 1250000000 },
      { id: 'شاهین_1404', name: 'شاهین 1404', price: 980000000 },
    ]);
  });

  it('reads rows from a bare array or from the configured path', () => {
    const src = { ...cars, catalogFields: fields };
    expect(jsonCatalogSourceAdapter.parse(rows, src).items).toHaveLength(1);
    expect(jsonCatalogSourceAdapter.parse({ data: rows }, src).items).toHaveLength(1);
    expect(jsonCatalogSourceAdapter.parse({ items: rows }, src).items).toHaveLength(1);
  });

  it('throws when the feed holds no priced row or the config has no fields', () => {
    expect(() => jsonCatalogSourceAdapter.parse([], cars)).toThrow();
    expect(() => jsonCatalogSourceAdapter.parse({ data: [] }, cars)).toThrow();
    expect(() => jsonCatalogSourceAdapter.parse(rows, { id: 'x' })).toThrow();
  });

  it('names the secret the endpoint needs while it is not set, without calling out', async () => {
    await expect(jsonCatalogSourceAdapter.fetchRaw(cars, {})).rejects.toThrow('SOURCEARENA_TOKEN');
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
