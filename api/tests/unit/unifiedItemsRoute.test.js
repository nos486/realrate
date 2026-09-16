import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/services/priceSources.js', () => ({
  getLatestMarketRates: vi.fn(async () => ({
    ons_gold: { price: 2900, label: 'بازار جهانی طلا (XAU)' },
    usd_toman: { price: 62000, label: 'دلار آزاد' },
  })),
}));

vi.mock('../../src/services/bourseSymbols.js', () => ({
  getBourseSymbols: vi.fn(async () => [
    { symbol: 'فولاد', name: 'فولاد مبارکه', p: 500, priceToman: 500, isFund: false },
  ]),
}));

import { handleGetUnifiedMarketItems } from '../../src/handlers/unifiedItemsRoute.js';

describe('Unified Market Items Route Handler', () => {
  it('returns unified catalog including gold, currencies, bourse, and funds', async () => {
    const mockEnv = {
      KV_PRICES: {
        get: vi.fn(async (key) => {
          if (key === 'cache:funds:charisma') {
            return JSON.stringify([
              { symbol: 'اهرم', name: 'صندوق اهرمی کاریزما', priceToman: 7523, priceRial: 75228, isFund: true },
              { symbol: 'کهربا', name: 'صندوق طلا کهربا', priceToman: 21765, priceRial: 217650, isFund: true },
            ]);
          }
          if (key === 'cache:funds:emofid') {
            return JSON.stringify([
              { symbol: 'پیشتاز', name: 'صندوق پیشتاز', priceToman: 20417, priceRial: 204170, isFund: true },
            ]);
          }
          return null;
        }),
        put: vi.fn(async () => {}),
      },
    };

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
    expect(charismaFunds.length).toBeGreaterThanOrEqual(2);

    // Verify known Charisma fund like اهرم has live price and correct sourceName
    const ahrom = data.funds.find(f => f.symbol === 'اهرم');
    expect(ahrom).toBeDefined();
    expect(ahrom.isFund).toBe(true);
    expect(ahrom.priceToman).toBeGreaterThan(0);
    expect(ahrom.sourceName).toBe('صندوق‌های سرمایه‌گذاری کاریزما (Charisma)');

    // Verify Emofid fund like پیشتاز
    const pishtaz = data.funds.find(f => f.symbol === 'pishtaz' || f.name?.includes('پیشتاز'));
    expect(pishtaz).toBeDefined();
    expect(pishtaz.sourceName).toContain('Emofid');
  });
});
