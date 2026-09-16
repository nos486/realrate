import { describe, it, expect } from 'vitest';
import { mergeBourseSymbols } from '../../src/services/market/sources/bourseSymbols.source.adapter.js';

describe('Bourse Symbols Incremental Merge Tests', () => {
  it('preserves missing symbols when API response does not include them', () => {
    const existingList = [
      { s: 'فولاد', n: 'فولاد مبارکه', p: 4500, priceToman: 4500, priceRial: 45000, updatedAt: '2026-09-01T10:00:00.000Z' },
      { s: 'خودرو', n: 'ایران خودرو', p: 2800, priceToman: 2800, priceRial: 28000, updatedAt: '2026-09-01T10:00:00.000Z' },
    ];

    // API only returned 'فولاد', 'خودرو' is missing
    const rawApi = [
      { l18: 'فولاد', l30: 'فولاد مبارکه اصفهان', pl: 46000 },
    ];

    const { mergedList, stats } = mergeBourseSymbols(existingList, rawApi, '2026-09-02T12:00:00.000Z');

    expect(stats.totalSymbols).toBe(2);
    expect(stats.updatedCount).toBe(1);
    expect(stats.retainedCount).toBe(1);

    const khodro = mergedList.find(item => item.s === 'خودرو');
    expect(khodro).toBeDefined();
    expect(khodro.p).toBe(2800);
    expect(khodro.updatedAt).toBe('2026-09-01T10:00:00.000Z'); // Preserved original timestamp

    const foolad = mergedList.find(item => item.s === 'فولاد');
    expect(foolad).toBeDefined();
    expect(foolad.p).toBe(4600); // 46000 / 10
    expect(foolad.updatedAt).toBe('2026-09-02T12:00:00.000Z');
  });

  it('never overwrites an existing positive price with zero or null', () => {
    const existingList = [
      { s: 'فملی', n: 'ملی مس', p: 7200, priceToman: 7200, priceRial: 72000, updatedAt: '2026-09-01T10:00:00.000Z' },
    ];

    // API returned 0 / null for pl
    const rawApi = [
      { l18: 'فملی', l30: 'ملی مس', pl: 0 },
    ];

    const { mergedList } = mergeBourseSymbols(existingList, rawApi, '2026-09-02T12:00:00.000Z');

    const femelli = mergedList.find(item => item.s === 'فملی');
    expect(femelli).toBeDefined();
    expect(femelli.p).toBe(7200); // Maintained previous price, not 0!
    expect(femelli.priceRial).toBe(72000);
  });

  it('adds brand new symbols from API with proper Rial to Toman conversion', () => {
    const existingList = [];
    const rawApi = [
      { l18: 'اهرم', l30: 'صندوق اهرم کاریزما', pl: 21500, isFund: true },
    ];

    const { mergedList, stats } = mergeBourseSymbols(existingList, rawApi, '2026-09-02T12:00:00.000Z');

    expect(stats.totalSymbols).toBe(1);
    expect(stats.addedCount).toBe(1);

    const ahrom = mergedList.find(item => item.s === 'اهرم');
    expect(ahrom).toBeDefined();
    expect(ahrom.p).toBe(2150); // 21500 / 10
    expect(ahrom.priceRial).toBe(21500);
    expect(ahrom.isFund).toBe(true);
    expect(ahrom.sourceName).toBe('بورس اوراق بهادار تهران (TSETMC / BRS API)');
    expect(ahrom.sourceId).toBe('src_def_bourse');
  });

  it('preserves custom sourceName when provided via sourceConfig', () => {
    const rawApi = [{ l18: 'فولاد', l30: 'فولاد مبارکه', pl: 50000 }];
    const customConfig = { id: 'src_custom_bourse', name: 'بورس تستی سفارشی' };
    const { mergedList } = mergeBourseSymbols([], rawApi, '2026-09-02T12:00:00.000Z', customConfig);

    expect(mergedList[0].sourceName).toBe('بورس تستی سفارشی');
    expect(mergedList[0].sourceId).toBe('src_custom_bourse');
  });
});
