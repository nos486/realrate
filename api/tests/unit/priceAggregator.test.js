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

    // Reference rates rotation list
    expect(result.reference_rates).toBeDefined();
    expect(result.reference_rates.length).toBe(2);
    expect(result.reference_rates[0].key).toBe('usd');
    expect(result.reference_rates[0].price).toBe(95000);
    expect(result.reference_rates[1].key).toBe('usdt');
    expect(result.reference_rates[1].price).toBe(95200);
    expect(result.reference_rates[1].symbol).toBe('₮');
  });

  it('should support fine-grained homePageOutputs for multi-value sources like forex', () => {
    const mockSources = [
      {
        id: 'src_def_forex',
        name: 'نرخ‌های جهانی فارکس',
        priceType: 'forex',
        isActive: true,
        isPrimary: true,
        lastMultiData: {
          EUR: 1.085,
          AED: 0.272,
          TRY: 0.029,
          INR: 0.011,
          ZAR: 0.055,
        },
        displayConfig: {
          showOnHomePage: true,
          homePageOutputs: ['EUR', 'AED', 'TRY'],
        },
      },
      {
        id: 'src_crypto_multi',
        name: 'رمزارزهای برتر',
        priceType: 'crypto_multi',
        isActive: true,
        isPrimary: true,
        lastMultiData: {
          BTC: 98000,
          ETH: 3600,
          DOGE: 0.25,
        },
        displayConfig: {
          showOnHomePage: ['BTC', 'ETH'], // array directly in showOnHomePage
        },
      },
    ];

    const result = compileLatestMarketRates(mockSources);

    // Forex items
    expect(result.eur).toBeDefined();
    expect(result.eur.showOnHomePage).toBe(true);
    expect(result.aed).toBeDefined();
    expect(result.aed.showOnHomePage).toBe(true);
    expect(result.try).toBeDefined();
    expect(result.try.showOnHomePage).toBe(true);

    // Forex items not in homePageOutputs should still be present in result, but have showOnHomePage: false
    expect(result.inr).toBeDefined();
    expect(result.inr.showOnHomePage).toBe(false);
    expect(result.zar).toBeDefined();
    expect(result.zar.showOnHomePage).toBe(false);

    // Crypto items
    expect(result.btc).toBeDefined();
    expect(result.btc.showOnHomePage).toBe(true);
    expect(result.eth).toBeDefined();
    expect(result.eth.showOnHomePage).toBe(true);
    expect(result.doge).toBeDefined();
    expect(result.doge.showOnHomePage).toBe(false);
  });
});
