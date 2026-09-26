import { describe, it, expect, vi } from 'vitest';
import {
  getAllCatalogSources,
  standardizeCatalogItem,
  getAllCatalogItems,
  searchCatalogItems,
  getCatalogItemDetail,
} from '../../src/services/market/catalogFeeds.service.js';
import { SOURCE_ITEMS_KEY_PREFIX } from '../../src/repositories/sourceItems.repository.js';

// Each catalog's stored list (the one key its sync writes)
const BOURSE_KV_KEY = `${SOURCE_ITEMS_KEY_PREFIX}src_def_bourse`;
const CHARISMA_FUNDS_KV_KEY = `${SOURCE_ITEMS_KEY_PREFIX}src_def_charisma`;
const CHARISMA_PLANS_KV_KEY = `${SOURCE_ITEMS_KEY_PREFIX}src_def_charisma_plans`;
const EMOFID_FUNDS_KV_KEY = `${SOURCE_ITEMS_KEY_PREFIX}src_def_emofid`;

describe('Unified Catalog Feeds Service Tests', () => {
  it('discovers all active catalog sources from sources.config.js', () => {
    const sources = getAllCatalogSources(true);
    expect(Array.isArray(sources)).toBe(true);

    const sourceIds = sources.map(s => s.id);
    expect(sourceIds).toContain('src_def_bourse');
    expect(sourceIds).toContain('src_def_emofid');
    expect(sourceIds).toContain('src_def_charisma');
  });

  it('standardizes a raw fund item into unified schema', () => {
    const raw = {
      s: 'اهرم',
      n: 'صندوق سرمایه‌گذاری اهرمی کاریزما',
      p: 7523,
      pl: 75230,
      isFund: true,
    };
    const sourceConfig = {
      id: 'src_def_charisma',
      name: 'صندوق‌های سرمایه‌گذاری کاریزما (Charisma)',
      priceType: 'charisma_funds',
    };

    const std = standardizeCatalogItem(raw, sourceConfig);
    expect(std).toBeDefined();
    expect(std.symbol).toBe('اهرم');
    expect(std.name).toBe('صندوق سرمایه‌گذاری اهرمی کاریزما');
    expect(std.category).toBe('bourse_fund');
    expect(std.badge).toBe('صندوق');
    expect(std.unit).toBe('واحد');
    expect(std.priceToman).toBe(7523);
    expect(std.priceRial).toBe(75230);
    expect(std.isFund).toBe(true);
    expect(std.sourceName).toBe('صندوق‌های سرمایه‌گذاری کاریزما (Charisma)');
    expect(std.sourceId).toBe('src_def_charisma');
  });

  it('standardizes a raw bourse stock item into unified schema', () => {
    const raw = {
      s: 'فولاد',
      n: 'فولاد مبارکه اصفهان',
      p: 520,
      pl: 5200,
      isFund: false,
    };
    const sourceConfig = {
      id: 'src_def_bourse',
      name: 'بورس اوراق بهادار تهران (TSETMC / BRS API)',
      priceType: 'bourse',
    };

    const std = standardizeCatalogItem(raw, sourceConfig);
    expect(std.symbol).toBe('فولاد');
    expect(std.category).toBe('bourse');
    expect(std.badge).toBe('سهام بورس');
    expect(std.unit).toBe('برگ سهم');
    expect(std.priceToman).toBe(520);
    expect(std.isFund).toBe(false);
  });

  it('fetches and partitions catalog items into bourse and funds', async () => {
    const mockEnv = {
      REALRATE_KV: {
        get: vi.fn(async (key) => {
          if (key === CHARISMA_FUNDS_KV_KEY) {
            return JSON.stringify([
              { symbol: 'اهرم', name: 'صندوق اهرمی کاریزما', priceToman: 7523, isFund: true },
              { symbol: 'کهربا', name: 'صندوق طلا کهربا', priceToman: 21765, isFund: true },
              { symbol: 'نقران', name: 'صندوق نقره کاریزما', priceToman: 1223, isFund: true },
            ]);
          }
          if (key === EMOFID_FUNDS_KV_KEY) {
            return JSON.stringify([
              { symbol: 'پیشتاز', name: 'صندوق پیشتاز مفید', priceToman: 20417, isFund: true },
            ]);
          }
          if (key === CHARISMA_PLANS_KV_KEY) {
            return JSON.stringify([
              { symbol: 'gold', name: 'طرح سرمایه گذاری در طلا', priceToman: 32242244, isFund: true },
            ]);
          }
          if (key === BOURSE_KV_KEY) {
            return JSON.stringify([
              { s: 'فولاد', n: 'فولاد مبارکه', p: 520, isFund: false },
            ]);
          }
          return null;
        }),
        put: vi.fn(async () => {}),
      },
    };

    const res = await getAllCatalogItems(mockEnv);
    expect(Array.isArray(res.allItems)).toBe(true);
    expect(Array.isArray(res.bourse)).toBe(true);
    expect(Array.isArray(res.funds)).toBe(true);

    // Verify funds contains Charisma
    const ahrom = res.funds.find(f => f.symbol === 'اهرم');
    expect(ahrom).toBeDefined();
    expect(ahrom.priceToman).toBeGreaterThan(0);
    expect(ahrom.sourceName).toBe('صندوق‌های سرمایه‌گذاری کاریزما (Charisma)');

    // Verify bourse contains stock
    const foulad = res.bourse.find(b => b.symbol === 'فولاد');
    expect(foulad).toBeDefined();
    expect(foulad.category).toBe('bourse');
  });

  it('searches and ranks items with Persian normalization', async () => {
    const mockEnv = {
      REALRATE_KV: {
        get: vi.fn(async (key) => {
          if (key === CHARISMA_FUNDS_KV_KEY) {
            return JSON.stringify([
              { symbol: 'اهرم', name: 'صندوق اهرمی کاریزما', priceToman: 7523, isFund: true },
              { symbol: 'کهربا', name: 'صندوق طلا کهربا', priceToman: 21765, isFund: true },
              { symbol: 'نقران', name: 'صندوق نقره کاریزما', priceToman: 1223, isFund: true },
            ]);
          }
          if (key === CHARISMA_PLANS_KV_KEY) {
            return JSON.stringify([
              { symbol: 'gold', name: 'طرح سرمایه گذاری در طلا', priceToman: 32242244, isFund: true },
            ]);
          }
          if (key === BOURSE_KV_KEY) {
            return JSON.stringify([
              { s: 'فولاد', n: 'فولاد مبارکه', p: 520, isFund: false },
            ]);
          }
          if (key === EMOFID_FUNDS_KV_KEY) {
            return JSON.stringify([]);
          }
          return null;
        }),
        put: vi.fn(async () => {}),
      },
    };

    const searchResults = await searchCatalogItems(mockEnv, { q: 'اهرم', limit: 5 });
    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchResults[0].symbol).toBe('اهرم');
  });

  it('looks up exact item detail by symbol', async () => {
    const mockEnv = {
      REALRATE_KV: {
        get: vi.fn(async (key) => {
          if (key === CHARISMA_FUNDS_KV_KEY) {
            return JSON.stringify([
              { symbol: 'نقران', name: 'صندوق نقره کاریزما', priceToman: 1223, isFund: true },
            ]);
          }
          return null;
        }),
      },
    };

    const detail = await getCatalogItemDetail(mockEnv, 'نقران', 'src_def_charisma');
    expect(detail).toBeDefined();
    expect(detail.symbol).toBe('نقران');
    expect(detail.priceToman).toBeGreaterThan(0);
  });
});
