import { describe, it, expect, vi } from 'vitest';
import { getMasterPriceSourceById } from '../../src/config/sources.config.js';

// A price book item (tomans; dollar quotes keep their dollar value in params)
const item = (id, price, params = {}, extra = {}) => ({ id, price, name: id, sourceId: `src_def_${id}`, params, ...extra });
const bookWith = (extraItems = {}) => ({
  updatedAt: '2026-01-01T00:00:00Z',
  items: {
    // The book names every item's source (sources.config.js)
    ons_gold: item('ons_gold', 2900 * 62000, { usd: 2900, sourceName: getMasterPriceSourceById('src_def_ons_gold').name }),
    ons_silver: item('ons_silver', 34.5 * 62000, { usd: 34.5, sourceName: getMasterPriceSourceById('src_def_ons_silver').name }),
    usd: item('usd', 62000, { sourceName: 'دلار آزاد' }),
    ...extraItems,
  },
});

vi.mock('../../src/services/market/priceAggregator.service.js', () => ({
  getPriceBook: vi.fn(async () => bookWith()),
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
  it('prices everything from the price book (the ounce in dollars, the dollar in tomans)', async () => {
    const response = await handleGetUnifiedMarketItems({}, new Request('https://realrate.ir/api/market/items'));
    const data = await response.json();
    expect(data.meta).toMatchObject({ gold_usd: 2900, silver_usd: 34.5, live_usd_toman: 62000 });
    expect(data.currencies.find((c) => c.code === 'USD')).toMatchObject({ marketPrice: 62000, sourceName: 'دلار آزاد' });
  });

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

  it('Phase 5 verification: bubblePct is generically read from sources.config.js for coins', async () => {
    const mockEnv = {};
    const mockRequest = new Request('https://realrate.ir/api/market/items');
    const response = await handleGetUnifiedMarketItems(mockEnv, mockRequest);
    const data = await response.json();

    const fullCoin = data.goldAndCoins.find(item => item.id === 'full_coin');
    const halfCoin = data.goldAndCoins.find(item => item.id === 'half_coin');
    const quarterCoin = data.goldAndCoins.find(item => item.id === 'quarter_coin');

    expect(fullCoin).toBeDefined();
    expect(fullCoin.targetBubblePct).toBe(15);

    expect(halfCoin).toBeDefined();
    expect(halfCoin.targetBubblePct).toBe(20);

    expect(quarterCoin).toBeDefined();
    expect(quarterCoin.targetBubblePct).toBe(25);
  });

  it('Phase 5 verification: ons_gold and ons_silver get source names directly from sources.config.js', async () => {
    const mockEnv = {};
    const mockRequest = new Request('https://realrate.ir/api/market/items');
    const response = await handleGetUnifiedMarketItems(mockEnv, mockRequest);
    const data = await response.json();

    const onsGold = data.goldAndCoins.find(item => item.id === 'ons_gold');
    const onsSilver = data.goldAndCoins.find(item => item.id === 'ons_silver');

    expect(onsGold).toBeDefined();
    expect(onsGold.sourceName).toBe('انس طلا جهانی (XAU)');

    expect(onsSilver).toBeDefined();
    expect(onsSilver.sourceName).toBe('انس نقره جهانی (XAG)');
  });

  it('Phase 5 verification: items use displayEngine for category, badge, and unit', async () => {
    const mockEnv = {};
    const mockRequest = new Request('https://realrate.ir/api/market/items');
    const response = await handleGetUnifiedMarketItems(mockEnv, mockRequest);
    const data = await response.json();

    const fullCoin = data.goldAndCoins.find(item => item.id === 'full_coin');
    expect(fullCoin.category).toBe('coin');
    expect(fullCoin.badge).toBe('سکه');
    expect(fullCoin.unit).toBe('عدد');

    const usdCur = data.currencies.find(c => c.code === 'USD');
    expect(usdCur.category).toBe('currency');
    expect(usdCur.badge).toBe('ارز');
    expect(usdCur.unit).toBe('دلار');
  });

  it('derives currencies[].usdCrossRate for EUR, AED, TRY from live market rates instead of defaultCross', async () => {
    const { getPriceBook } = await import('../../src/services/market/priceAggregator.service.js');
    getPriceBook.mockResolvedValueOnce(bookWith({
      eur: item('eur', 67704, { usdCross: 1.092 }, { sourceId: 'src_def_forex' }),
      aed: item('aed', 16864, { usdCross: 0.272 }, { sourceId: 'src_def_forex' }),
      try: item('try', 1798, { usdCross: 0.029 }, { sourceId: 'src_def_forex' }),
    }));

    const mockEnv = {};
    const mockRequest = new Request('https://realrate.ir/api/market/items');
    const response = await handleGetUnifiedMarketItems(mockEnv, mockRequest);
    const data = await response.json();

    const eurCur = data.currencies.find(c => c.code === 'EUR');
    const aedCur = data.currencies.find(c => c.code === 'AED');
    const tryCur = data.currencies.find(c => c.code === 'TRY');

    expect(eurCur).toBeDefined();
    expect(eurCur.usdCrossRate).toBe(1.092);
    expect(eurCur.usdCrossRate).not.toBe(0);

    expect(aedCur).toBeDefined();
    expect(aedCur.usdCrossRate).toBe(0.272);
    expect(aedCur.usdCrossRate).not.toBe(0);

    expect(tryCur).toBeDefined();
    expect(tryCur.usdCrossRate).toBe(0.029);
    expect(tryCur.usdCrossRate).not.toBe(0);
  });
});
