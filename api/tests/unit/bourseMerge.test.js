import { describe, it, expect } from 'vitest';
import { mergeBourseSymbols } from '../../src/services/market/sources/bourseSymbols.source.adapter.js';

describe('Bourse Symbols Incremental Merge Tests', () => {
  it('preserves missing symbols when API response does not include them', () => {
    const existingList = [
      { id: 'فولاد', name: 'فولاد مبارکه', price: 4500 },
      { id: 'خودرو', name: 'ایران خودرو', price: 2800 },
    ];

    // API only returned 'فولاد', 'خودرو' is missing
    const rawApi = [
      { l18: 'فولاد', l30: 'فولاد مبارکه اصفهان', pl: 46000 },
    ];

    const { mergedList, stats } = mergeBourseSymbols(existingList, rawApi, '2026-09-02T12:00:00.000Z');

    expect(stats.totalSymbols).toBe(2);
    expect(stats.updatedCount).toBe(1);
    expect(stats.retainedCount).toBe(1);

    const khodro = mergedList.find(item => item.id === 'خودرو');
    expect(khodro).toBeDefined();
    expect(khodro.price).toBe(2800);
    expect(khodro.name).toBe('ایران خودرو');

    const foolad = mergedList.find(item => item.id === 'فولاد');
    expect(foolad).toBeDefined();
    expect(foolad.price).toBe(4600); // 46000 / 10
    expect(foolad.name).toBe('فولاد مبارکه اصفهان');
  });

  it('never overwrites an existing positive price with zero or null', () => {
    const existingList = [
      { id: 'فملی', name: 'ملی مس', price: 7200 },
    ];

    // API returned 0 / null for pl
    const rawApi = [
      { l18: 'فملی', l30: 'ملی مس', pl: 0 },
    ];

    const { mergedList } = mergeBourseSymbols(existingList, rawApi, '2026-09-02T12:00:00.000Z');

    const femelli = mergedList.find(item => item.id === 'فملی');
    expect(femelli).toBeDefined();
    expect(femelli.price).toBe(7200); // Maintained previous price, not 0!
  });

  it('adds brand new symbols from API with proper Rial to Toman conversion in standard schema', () => {
    const existingList = [];
    const rawApi = [
      { l18: 'اهرم', l30: 'صندوق اهرم کاریزما', pl: 21500, isFund: true },
    ];

    const { mergedList, stats } = mergeBourseSymbols(existingList, rawApi, '2026-09-02T12:00:00.000Z');

    expect(stats.totalSymbols).toBe(1);
    expect(stats.addedCount).toBe(1);

    const ahrom = mergedList.find(item => item.id === 'اهرم');
    expect(ahrom).toBeDefined();
    expect(ahrom.id).toBe('اهرم');
    expect(ahrom.name).toBe('صندوق اهرم کاریزما');
    expect(ahrom.price).toBe(2150); // 21500 / 10
    // Ensures strictly { id, name, price } standard
    expect(Object.keys(ahrom).sort()).toEqual(['id', 'name', 'price']);
  });

  it('maintains backwards compatibility when existingList uses legacy keys { s, n, p }', () => {
    const legacyExistingList = [
      { s: 'فولاد', n: 'فولاد مبارکه', p: 5000, priceRial: 50000 },
    ];
    const { mergedList } = mergeBourseSymbols(legacyExistingList, []);

    expect(mergedList[0].id).toBe('فولاد');
    expect(mergedList[0].name).toBe('فولاد مبارکه');
    expect(mergedList[0].price).toBe(5000);
    expect(Object.keys(mergedList[0]).sort()).toEqual(['id', 'name', 'price']);
  });
});
