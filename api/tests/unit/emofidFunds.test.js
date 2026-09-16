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

  it('parses real Emofid fixture and extracts ONLY symbol, name, and issue price (subscriptionNav)', () => {
    const { mergedList, stats } = mergeEmofidFunds([], sampleApiResponse.value, '2026-09-16T10:00:00.000Z');

    expect(stats.totalFunds).toBe(3);
    expect(stats.addedCount).toBe(3);

    const atieh = mergedList.find(f => f.symbol === 'atieh');
    expect(atieh).toBeDefined();
    expect(atieh.name).toBe('صندوق بازنشستگی تکمیلی آتیه');
    // Issue price (subscriptionNav) in Rials = 45324
    expect(atieh.priceRial).toBe(45324);
    // Converted to Tomans = 4532
    expect(atieh.priceToman).toBe(4532);
    expect(atieh.price).toBe(4532);
    expect(atieh.unit).toBe('IRR');
    expect(atieh.isFund).toBe(true);

    // Strictly ensure other fields like cancelNav, aum, investorsNumber are NOT present
    expect(atieh.cancelNav).toBeUndefined();
    expect(atieh.aum).toBeUndefined();
    expect(atieh.investorsNumber).toBeUndefined();
  });

  it('preserves existing funds when subsequent API response does not include them (Cumulative Merge)', () => {
    const existingList = [
      {
        s: 'atieh',
        symbol: 'atieh',
        n: 'صندوق بازنشستگی تکمیلی آتیه',
        name: 'صندوق بازنشستگی تکمیلی آتیه',
        p: 4500,
        price: 4500,
        priceToman: 4500,
        priceRial: 45000,
        updatedAt: '2026-09-10T10:00:00.000Z',
      },
      {
        s: 'pishro',
        symbol: 'pishro',
        n: 'صندوق پیشرو',
        name: 'صندوق پیشرو',
        p: 4300,
        price: 4300,
        priceToman: 4300,
        priceRial: 43000,
        updatedAt: '2026-09-10T10:00:00.000Z',
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
    const atieh = mergedList.find(f => f.symbol === 'atieh');
    expect(atieh.priceRial).toBe(45324);
    expect(atieh.priceToman).toBe(4532);
    expect(atieh.updatedAt).toBe('2026-09-16T12:00:00.000Z');

    // pishro was retained with original timestamp and price!
    const pishro = mergedList.find(f => f.symbol === 'pishro');
    expect(pishro).toBeDefined();
    expect(pishro.priceRial).toBe(43000);
    expect(pishro.priceToman).toBe(4300);
    expect(pishro.updatedAt).toBe('2026-09-10T10:00:00.000Z');
  });

  it('never overwrites a positive issue price with zero or null', () => {
    const existingList = [
      {
        s: 'ayar',
        symbol: 'ayar',
        name: 'صندوق عیار',
        p: 62000,
        price: 62000,
        priceToman: 62000,
        priceRial: 620000,
        updatedAt: '2026-09-15T10:00:00.000Z',
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

    const ayar = mergedList.find(f => f.symbol === 'ayar');
    expect(ayar).toBeDefined();
    expect(ayar.priceRial).toBe(620000); // Retained previous valid price
    expect(ayar.priceToman).toBe(62000);
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
