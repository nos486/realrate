import { describe, it, expect } from 'vitest';
import { compileLatestMarketRates } from '../../src/services/market/priceAggregator.service.js';

describe('compileLatestMarketRates dynamic source support', () => {
  it('should dynamically include custom sources like USDT and preserve showOnHomePage', () => {
    const mockSources = [
      {
        id: 'src_usd_test',
        name: 'دلار آمریکا',
        priceType: 'usd',
        lastPrice: 95000,
        isActive: true,
        isPrimary: true,
      },
      {
        id: 'src_brs_usdt',
        name: 'دلار تتر',
        priceType: 'USDT',
        lastPrice: 95200,
        isActive: true,
        isPrimary: true,
        displayConfig: { showOnHomePage: true },
      },
      {
        id: 'src_custom_hidden',
        name: 'ارز مخفی',
        priceType: 'HIDDEN_COIN',
        lastPrice: 12000,
        isActive: true,
        isPrimary: true,
        displayConfig: { showOnHomePage: false },
      },
    ];

    const result = compileLatestMarketRates(mockSources);

    expect(result.usd).toBeDefined();
    expect(result.usd.price).toBe(95000);

    // USDT
    expect(result.usdt).toBeDefined();
    expect(result.usdt.price).toBe(95200);
    expect(result.usdt.label).toBe('دلار تتر');
    expect(result.usdt.showOnHomePage).toBe(true);

    // Hidden item
    expect(result.hidden_coin).toBeDefined();
    expect(result.hidden_coin.showOnHomePage).toBe(false);
  });
});
