import { describe, it, expect } from 'vitest';
import {
  sourceKindOf,
  fetchIntervalSecOf,
  isSourceDue,
  sourceScheduleOf,
  mergeCatalogItems,
  MIN_FETCH_INTERVAL_SEC,
} from '../../src/domain/priceSources.js';
import { bourseItemsOf, bourseSymbolsSourceAdapter } from '../../src/services/market/sources/bourseSymbols.source.adapter.js';
import { emofidItemsOf, emofidFundsSourceAdapter } from '../../src/services/market/sources/emofidFunds.source.adapter.js';
import { charismaFundItemsOf, charismaFundsSourceAdapter } from '../../src/services/market/sources/charismaFunds.source.adapter.js';
import { charismaPlanItemsOf, charismaPlansSourceAdapter } from '../../src/services/market/sources/charismaPlans.source.adapter.js';
import { getMasterPriceSourceById, PRICE_SOURCES_CONFIG } from '../../src/config/sources.config.js';

const NOW = Date.parse('2026-05-01T12:00:00Z');
const ago = (sec) => new Date(NOW - sec * 1000).toISOString();

describe('price sources: kind and schedule', () => {
  it('tells a single price, a multi-output feed and a catalog apart from the config alone', () => {
    expect(sourceKindOf({ id: 'src_def_usd' })).toBe('single');
    expect(sourceKindOf({ outputs: 'multi' })).toBe('multi');
    expect(sourceKindOf({ isCatalog: true, outputs: 'multi' })).toBe('catalog');
    expect(sourceKindOf(getMasterPriceSourceById('src_def_forex'))).toBe('multi');
    expect(sourceKindOf(getMasterPriceSourceById('src_def_bourse'))).toBe('catalog');
  });

  it('every configured source has a kind, and an interval of at least the minimum', () => {
    for (const src of PRICE_SOURCES_CONFIG) {
      expect(['single', 'multi', 'catalog']).toContain(sourceKindOf(src));
      expect(fetchIntervalSecOf(src)).toBeGreaterThanOrEqual(MIN_FETCH_INTERVAL_SEC);
    }
    expect(fetchIntervalSecOf({ fetchIntervalSec: 1 })).toBe(MIN_FETCH_INTERVAL_SEC);
    expect(fetchIntervalSecOf({ fetchIntervalSec: 60 })).toBe(300);
    expect(fetchIntervalSecOf({})).toBe(300);
    // Nothing is fetched more often than every 5 minutes
    expect(MIN_FETCH_INTERVAL_SEC).toBe(300);
  });

  it('is due one interval after its last try — a failure waits its interval like a success', () => {
    const src = { fetchIntervalSec: 300 };
    expect(isSourceDue(src, null, NOW)).toBe(true);
    expect(isSourceDue(src, { syncedAt: ago(100) }, NOW)).toBe(false);
    expect(isSourceDue(src, { syncedAt: ago(400) }, NOW)).toBe(true);
    expect(isSourceDue(src, { syncedAt: ago(400), failedAt: ago(100) }, NOW)).toBe(false);
  });

  it('gives each source a status, its error while it is current, and its next fetch', () => {
    const src = { fetchIntervalSec: 600, staleAfterSec: 3600 };
    expect(sourceScheduleOf({ ...src, isActive: false }, null, NOW)).toMatchObject({ status: 'off', nextDueAt: null });
    expect(sourceScheduleOf(src, null, NOW)).toMatchObject({ status: 'pending', syncedAt: null });

    const ok = sourceScheduleOf(src, { syncedAt: ago(60) }, NOW);
    expect(ok).toMatchObject({ status: 'ok', intervalSec: 600, error: null });
    expect(ok.nextDueAt).toBe(new Date(NOW + 540 * 1000).toISOString());

    expect(sourceScheduleOf(src, { syncedAt: ago(60), failedAt: ago(30), error: 'timeout' }, NOW))
      .toMatchObject({ status: 'error', error: 'timeout' });
    // A success after the failure clears it
    expect(sourceScheduleOf(src, { syncedAt: ago(10), failedAt: ago(30), error: 'timeout' }, NOW))
      .toMatchObject({ status: 'ok', error: null });
    expect(sourceScheduleOf(src, { syncedAt: ago(7200) }, NOW).status).toBe('stale');
  });
});

describe('catalog lists: merged with the previous one', () => {
  it('keeps what a fetch left out, and a last price a fetch gave without one', () => {
    const previous = [
      { id: 'فولاد', name: 'فولاد', price: 540 },
      { id: 'فملی', name: 'ملی مس', price: 680 },
      { s: 'شپنا', n: 'پالایش اصفهان', p: 480 }, // older stored keys
    ];
    const merged = mergeCatalogItems(previous, [
      { id: 'فولاد', name: 'فولاد مبارکه', price: 0 },
      { id: 'فملی', name: 'ملی مس', price: 700 },
      { id: 'خودرو', name: 'ایران خودرو', price: 300 },
    ]);
    const byId = Object.fromEntries(merged.map((i) => [i.id, i]));
    expect(byId['فولاد']).toEqual({ id: 'فولاد', name: 'فولاد مبارکه', price: 540 });
    expect(byId['فملی'].price).toBe(700);
    expect(byId['شپنا']).toEqual({ id: 'شپنا', name: 'پالایش اصفهان', price: 480 });
    expect(byId['خودرو'].price).toBe(300);
    expect(merged.every((i) => Object.keys(i).sort().join() === 'id,name,price')).toBe(true);
  });

  it('never takes an item without an id or keeps one without a price', () => {
    expect(mergeCatalogItems([{ id: 'x', price: 0 }], [{ name: 'no id', price: 5 }])).toEqual([]);
    expect(mergeCatalogItems(null, undefined)).toEqual([]);
  });
});

describe('catalog adapters: only read their answer', () => {
  it('bourse: ticker, name and last price (rials → tomans); a symbol without a price is left out', async () => {
    const rows = [
      { l18: 'فملی', l30: 'ملی صنایع مس ایران', pl: 263900 },
      { l18: 'شپنا', l30: 'پالایش نفت اصفهان', pl: '48,000' },
      { l18: 'بی‌قیمت', l30: 'x', pl: 0 },
    ];
    expect(bourseItemsOf(rows)).toEqual([
      { id: 'فملی', name: 'ملی صنایع مس ایران', price: 26390 },
      { id: 'شپنا', name: 'پالایش نفت اصفهان', price: 4800 },
    ]);
    const src = getMasterPriceSourceById('src_def_bourse');
    expect((await bourseSymbolsSourceAdapter.parse(JSON.stringify(rows), src)).items).toHaveLength(2);
    await expect(async () => bourseSymbolsSourceAdapter.parse([], src)).rejects.toThrow();
  });

  it('emofid: the fund ticker and its issue price, from an envelope or a list', () => {
    const value = [
      { enTitle: 'pishtaz', title: 'پیشتاز', fullTitle: 'صندوق پیشتاز', subscriptionNav: 201649 },
      { enTitle: 'ayar', title: 'عیار', fullTitle: 'صندوق عیار', subscriptionNav: 629755 },
      { enTitle: 'empty', subscriptionNav: null },
    ];
    expect(emofidItemsOf(value)).toEqual([
      { id: 'pishtaz', name: 'صندوق پیشتاز', price: 20165 },
      { id: 'ayar', name: 'صندوق عیار', price: 62976 },
    ]);
    expect(emofidFundsSourceAdapter.parse({ isSuccess: true, value }).items).toHaveLength(2);
  });

  it('charisma funds: closing price, else last trade; ticker from the API, else the config symbol map', () => {
    const { symbolMap } = getMasterPriceSourceById('src_def_charisma');
    const funds = [
      { englishTitle: 'noghran', subtitle: 'صندوق نقره کاریزما', fields: [{ key: 'buyOrLastPriceInfo', value: 12214 }, { key: 'sellOrClosedPriceInfo', value: 12232 }] },
      { englishTitle: 'kahroba', shortSymbol: 'کهربا', subtitle: 'صندوق طلا کهربا', fields: [{ key: 'buyOrLastPriceInfo', value: 216790 }, { key: 'sellOrClosedPriceInfo', value: 0 }] },
      { englishTitle: 'nofund', fields: [] },
    ];
    expect(charismaFundItemsOf(funds, symbolMap)).toEqual([
      { id: 'نقران', name: 'صندوق نقره کاریزما', price: 1223 },
      { id: 'کهربا', name: 'صندوق طلا کهربا', price: 21679 },
    ]);
    expect(charismaFundsSourceAdapter.parse(funds, { symbolMap }).items).toHaveLength(2);
    expect(() => charismaFundsSourceAdapter.parse([], { symbolMap })).toThrow();
  });

  it('charisma plans: the plan code and its toman price (or rials ÷ 10)', () => {
    const rows = [
      { id: 'gold', planTitle: 'طرح سرمایه گذاری در طلا', priceToman: 32316516 },
      { id: 'silver', planTitle: 'طرح نقره', priceRial: 5023960 },
      { id: 'copper', planTitle: 'طرح مس', priceToman: 0 },
    ];
    expect(charismaPlanItemsOf(rows)).toEqual([
      { id: 'gold', name: 'طرح سرمایه گذاری در طلا', price: 32316516 },
      { id: 'silver', name: 'طرح نقره', price: 502396 },
    ]);
    expect(charismaPlansSourceAdapter.parse({ data: rows }).items).toHaveLength(2);
  });
});
