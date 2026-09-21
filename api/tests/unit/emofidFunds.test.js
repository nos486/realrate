import { describe, it, expect } from 'vitest';
import {
  mergeEmofidFunds,
  emofidFundsSourceAdapter,
} from '../../src/services/market/sources/emofidFunds.source.adapter.js';

describe('Emofid Mutual Funds Adapter & Incremental Merge Tests', () => {
  const sampleApiResponse = {
    isSuccess: true,
    value: [
      {
        id: 1,
        key: "10600",
        code: "10600",
        enTitle: "pishtaz",
        title: "پیشتاز",
        fullTitle: "صندوق پیشتاز",
        fundType: "سهامی",
        subscriptionNav: 201649,
        cancelNav: 200129,
        aum: 168006,
        investorsNumber: 32914,
        type: "صدور ابطالی",
      },
      {
        id: 14,
        key: "12217",
        code: "12217",
        enTitle: "atieh",
        title: "آتیه",
        fullTitle: "صندوق بازنشستگی تکمیلی آتیه",
        fundType: "سهامی",
        subscriptionNav: 45324,
        cancelNav: 45022,
        aum: 2841,
        investorsNumber: 607,
        type: "صدور ابطالی",
      },
      {
        id: 11,
        key: "IRTKMOFD0001",
        code: "IRTKMOFD0001",
        enTitle: "ayar",
        title: "عیار",
        fullTitle: "صندوق عیار",
        fundType: "طلا",
        subscriptionNav: 629755,
        cancelNav: 629755,
        type: "قابل معامله",
      },
    ],
  };

  it('parses real Emofid fixture and extracts ONLY id, name, and price in standard format', () => {
    const { mergedList, stats } = mergeEmofidFunds([], sampleApiResponse.value, '2026-09-16T10:00:00.000Z');

    expect(stats.totalFunds).toBe(3);
    expect(stats.addedCount).toBe(3);

    const atieh = mergedList.find(f => f.id === 'atieh');
    expect(atieh).toBeDefined();
    expect(atieh.id).toBe('atieh');
    expect(atieh.name).toBe('صندوق بازنشستگی تکمیلی آتیه');
    // Issue price (subscriptionNav) in Tomans = 4532 (45324 / 10)
    expect(atieh.price).toBe(4532);

    // Strictly ensure only standard keys { id, name, price } exist
    expect(Object.keys(atieh).sort()).toEqual(['id', 'name', 'price']);
  });

  it('preserves existing funds when subsequent API response does not include them (Cumulative Merge)', () => {
    const existingList = [
      {
        id: 'atieh',
        name: 'صندوق بازنشستگی تکمیلی آتیه',
        price: 4500,
      },
      {
        id: 'pishro',
        name: 'صندوق پیشرو',
        price: 4300,
      },
    ];

    // New response only has 'atieh' with updated NAV; 'pishro' is missing from API
    const newApiList = [
      {
        enTitle: 'atieh',
        fullTitle: 'صندوق بازنشستگی تکمیلی آتیه',
        subscriptionNav: 45324,
      },
    ];

    const { mergedList, stats } = mergeEmofidFunds(existingList, newApiList, '2026-09-16T12:00:00.000Z');

    expect(stats.totalFunds).toBe(2);
    expect(stats.updatedCount).toBe(1);
    expect(stats.retainedCount).toBe(1);

    // atieh was updated
    const atieh = mergedList.find(f => f.id === 'atieh');
    expect(atieh.price).toBe(4532);

    // pishro was retained with original price!
    const pishro = mergedList.find(f => f.id === 'pishro');
    expect(pishro).toBeDefined();
    expect(pishro.price).toBe(4300);
    expect(Object.keys(pishro).sort()).toEqual(['id', 'name', 'price']);
  });

  it('never overwrites a positive issue price with zero or null', () => {
    const existingList = [
      {
        id: 'ayar',
        name: 'صندوق عیار',
        price: 62000,
      },
    ];

    // API returns 0 for subscriptionNav
    const newApiList = [
      {
        enTitle: 'ayar',
        title: 'عیار',
        subscriptionNav: 0,
      },
    ];

    const { mergedList } = mergeEmofidFunds(existingList, newApiList, '2026-09-16T12:00:00.000Z');

    const ayar = mergedList.find(f => f.id === 'ayar');
    expect(ayar).toBeDefined();
    expect(ayar.price).toBe(62000); // Retained previous valid price
    expect(Object.keys(ayar).sort()).toEqual(['id', 'name', 'price']);
  });

  it('adapter supports emofid_funds and parses envelope response', async () => {
    expect(emofidFundsSourceAdapter.supports({ sourceType: 'emofid_funds' })).toBe(true);
    expect(emofidFundsSourceAdapter.supports({ priceType: 'emofid_funds' })).toBe(true);
    expect(emofidFundsSourceAdapter.supports({ endpoint: 'https://www.emofid.com/api/funds/' })).toBe(true);

    const parsed = await emofidFundsSourceAdapter.parse(sampleApiResponse, { id: 'src_def_emofid' });

    expect(parsed.price).toBe(3);
    expect(parsed.multiData.isCatalog).toBe(true);
    expect(parsed.multiData.totalCount).toBe(3);
    expect(parsed.multiData.items.length).toBe(3);
    expect(parsed.sampleItems.length).toBe(3);
  });
});
