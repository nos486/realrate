import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/services/priceSources.js', () => ({
  getLatestMarketRates: vi.fn(async () => ({
    ons_gold: { price: 2900, label: 'بازار جهانی طلا (XAU)' },
    usd_toman: { price: 62000, label: 'دلار آزاد' },
  })),
}));

vi.mock('../../src/services/market/catalogFeeds.service.js', () => ({
  getAllCatalogItems: vi.fn(async () => ({
    allItems: [
      { symbol: 'فولاد', name: 'فولاد مبارکه', category: 'bourse', priceToman: 500, isFund: false },
      { symbol: 'اهرم', name: 'صندوق اهرمی کاریزما', category: 'bourse_fund', priceToman: 7523, isFund: true, sourceName: 'صندوق‌های سرمایه‌گذاری کاریزما (Charisma)', sourceId: 'src_def_charisma' },
      { symbol: 'pishtaz', name: 'صندوق پیشتاز', category: 'bourse_fund', priceToman: 20417, isFund: true, sourceName: 'صندوق‌های سرمایه‌گذاری کارگزاری مفید (Emofid)', sourceId: 'src_def_emofid' },
    ],
    bourse: [
      { symbol: 'فولاد', name: 'فولاد مبارکه', category: 'bourse', priceToman: 500, isFund: false },
    ],
    funds: [
      { symbol: 'اهرم', name: 'صندوق اهرمی کاریزما', category: 'bourse_fund', priceToman: 7523, isFund: true, sourceName: 'صندوق‌های سرمایه‌گذاری کاریزما (Charisma)', sourceId: 'src_def_charisma' },
      { symbol: 'pishtaz', name: 'صندوق پیشتاز', category: 'bourse_fund', priceToman: 20417, isFund: true, sourceName: 'صندوق‌های سرمایه‌گذاری کارگزاری مفید (Emofid)', sourceId: 'src_def_emofid' },
    ],
  })),
}));

import { handleGetUnifiedMarketItems } from '../../src/handlers/unifiedItemsRoute.js';

describe('Unified Market Items Route Handler', () => {
  it('returns unified catalog including gold, currencies, bourse, and funds', async () => {
    const mockEnv = {};
    const mockRequest = new Request('https://realrate.ir/api/market/items');
    const response = await handleGetUnifiedMarketItems(mockEnv, mockRequest);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(Array.isArray(data.goldAndCoins)).toBe(true);
    expect(Array.isArray(data.currencies)).toBe(true);
    expect(Array.isArray(data.bourse)).toBe(true);
    expect(Array.isArray(data.funds)).toBe(true);

    // Verify Charisma funds are included
    const charismaFunds = data.funds.filter(f => f.sourceId === 'src_def_charisma');
    expect(charismaFunds.length).toBeGreaterThanOrEqual(1);

    // Verify known Charisma fund like اهرم has live price and correct sourceName
    const ahrom = data.funds.find(f => f.symbol === 'اهرم');
    expect(ahrom).toBeDefined();
    expect(ahrom.isFund).toBe(true);
    expect(ahrom.priceToman).toBe(7523);
    expect(ahrom.sourceName).toBe('صندوق‌های سرمایه‌گذاری کاریزما (Charisma)');

    // Verify Emofid fund like پیشتاز
    const pishtaz = data.funds.find(f => f.symbol === 'pishtaz' || f.name?.includes('پیشتاز'));
    expect(pishtaz).toBeDefined();
    expect(pishtaz.sourceName).toContain('Emofid');
  });
});
