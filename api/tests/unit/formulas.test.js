import { describe, it, expect } from 'vitest';
import {
  calculateGold24kGram,
  calculateIntrinsicValue,
  calculateForexTomanPrice,
  normalizeForexToUsdCrossRate,
  calculateSilverGram,
  calculateSilver925,
  calculateSilverOunce,
  calculateBubble,
  resolveHoldingUnitRealPrice,
} from '../../src/domain/formulas.js';
import { GOLD_SPECS } from '../../src/domain/specs/gold.spec.js';
import { COIN_SPECS } from '../../src/domain/specs/coin.spec.js';
import { TROY_OUNCE_GRAMS } from '../../src/domain/specs/gold.spec.js';

describe('Financial Formulas Unit Tests', () => {
  const mockGoldUsd = 2700; // $2,700 per troy ounce
  const mockUsdToman = 90000; // 90,000 Tomans per USD

  describe('calculateGold24kGram', () => {
    it('calculates pure 24k gold per gram correctly', () => {
      // (2700 / 31.1034768) * 90000 = 7812631.33...
      const expected = (mockGoldUsd / TROY_OUNCE_GRAMS) * mockUsdToman;
      const result = calculateGold24kGram(mockGoldUsd, mockUsdToman);
      expect(result).toBeCloseTo(expected, 4);
    });

    it('returns 0 if either goldUsd or usdToman is invalid or non-positive', () => {
      expect(calculateGold24kGram(0, 90000)).toBe(0);
      expect(calculateGold24kGram(2700, 0)).toBe(0);
      expect(calculateGold24kGram(-100, 90000)).toBe(0);
      expect(calculateGold24kGram(null, undefined)).toBe(0);
    });
  });

  describe('calculateIntrinsicValue', () => {
    it('calculates intrinsic value for 18k gold (0.75 ratio)', () => {
      const gold24k = calculateGold24kGram(mockGoldUsd, mockUsdToman);
      const expected = Math.round(gold24k * 0.75);
      const result = calculateIntrinsicValue(GOLD_SPECS.gold_18k, mockGoldUsd, mockUsdToman);
      expect(result).toBe(expected);
      expect(result).toBeGreaterThan(0);
    });

    it('calculates intrinsic value for Full Bahar Azadi Coin (7.3197g pure gold)', () => {
      const gold24k = calculateGold24kGram(mockGoldUsd, mockUsdToman);
      const expected = Math.round(gold24k * 7.3197);
      const result = calculateIntrinsicValue(COIN_SPECS.full_coin, mockGoldUsd, mockUsdToman);
      expect(result).toBe(expected);
    });

    it('calculates intrinsic value for Half Coin (3.6594g pure gold)', () => {
      const gold24k = calculateGold24kGram(mockGoldUsd, mockUsdToman);
      const expected = Math.round(gold24k * 3.6594);
      const result = calculateIntrinsicValue(COIN_SPECS.half_coin, mockGoldUsd, mockUsdToman);
      expect(result).toBe(expected);
    });

    it('returns 0 for missing spec or invalid prices', () => {
      expect(calculateIntrinsicValue(null, mockGoldUsd, mockUsdToman)).toBe(0);
      expect(calculateIntrinsicValue(COIN_SPECS.full_coin, 0, mockUsdToman)).toBe(0);
    });
  });

  describe('calculateForexTomanPrice', () => {
    it('calculates Toman price correctly based on USD cross-rate', () => {
      // Euro at 1.085 cross-rate with USD at 90,000 Tomans
      const eurCross = 1.085;
      const expected = Math.round(eurCross * 90000); // 97650
      expect(calculateForexTomanPrice(eurCross, 90000)).toBe(expected);
    });

    it('calculates Toman price for currencies weaker than USD (e.g. AED 0.2723)', () => {
      const aedCross = 0.2723;
      const expected = Math.round(aedCross * 90000); // 24507
      expect(calculateForexTomanPrice(aedCross, 90000)).toBe(expected);
    });

    it('handles 0 or invalid inputs by returning 0', () => {
      expect(calculateForexTomanPrice(0, 90000)).toBe(0);
      expect(calculateForexTomanPrice(1.085, 0)).toBe(0);
      expect(calculateForexTomanPrice(null, null)).toBe(0);
    });
  });

  describe('normalizeForexToUsdCrossRate', () => {
    it('normalizes currencies stronger than USD (EUR, GBP, CHF, etc.)', () => {
      expect(normalizeForexToUsdCrossRate('eur', 1.085)).toBe(1.085);
      // Inverted rate (e.g. USD/EUR = 0.92)
      expect(normalizeForexToUsdCrossRate('eur', 0.92)).toBeCloseTo(1 / 0.92, 4);
    });

    it('normalizes standard currencies (e.g. USD/TRY = 34.5 -> 1 / 34.5)', () => {
      const inverted = normalizeForexToUsdCrossRate('try', 34.5);
      expect(inverted).toBeCloseTo(1 / 34.5, 4);
    });

    it('returns 0 for non-positive inputs', () => {
      expect(normalizeForexToUsdCrossRate('eur', 0)).toBe(0);
      expect(normalizeForexToUsdCrossRate('eur', -1.5)).toBe(0);
    });
  });

  describe('calculateSilverFormulas', () => {
    const silverUsd = 32.5;

    it('calculates silver gram 999', () => {
      const expected = (silverUsd / TROY_OUNCE_GRAMS) * mockUsdToman;
      expect(calculateSilverGram(silverUsd, mockUsdToman)).toBeCloseTo(expected, 4);
    });

    it('calculates silver 925 sterling', () => {
      const pureGram = calculateSilverGram(silverUsd, mockUsdToman);
      expect(calculateSilver925(silverUsd, mockUsdToman)).toBeCloseTo(pureGram * 0.925, 4);
    });

    it('calculates silver ounce in Tomans', () => {
      expect(calculateSilverOunce(silverUsd, mockUsdToman)).toBe(silverUsd * mockUsdToman);
    });
  });

  describe('calculateBubble', () => {
    it('calculates positive bubble and percentage correctly', () => {
      const marketPrice = 50000000;
      const intrinsicPrice = 40000000;
      const res = calculateBubble(marketPrice, intrinsicPrice);

      expect(res.bubble).toBe(10000000);
      expect(res.bubblePct).toBe(25.0);
    });

    it('calculates negative bubble (discount) correctly', () => {
      const marketPrice = 38000000;
      const intrinsicPrice = 40000000;
      const res = calculateBubble(marketPrice, intrinsicPrice);

      expect(res.bubble).toBe(-2000000);
      expect(res.bubblePct).toBe(-5.0);
    });

    it('returns nulls if marketPrice or intrinsicPrice is invalid', () => {
      expect(calculateBubble(0, 40000000)).toEqual({ bubble: null, bubblePct: null });
      expect(calculateBubble(50000000, 0)).toEqual({ bubble: null, bubblePct: null });
      expect(calculateBubble(null, null)).toEqual({ bubble: null, bubblePct: null });
    });
  });

  describe('resolveHoldingUnitRealPrice', () => {
    const priceMap = {
      gold_18k: 4500000,
      full_coin: 48000000,
      usd: 65000,
      ons_gold: 2700,
      ons_gold_toman: 175500000,
      src_def_charisma_plans__gold: 32242244,
      charisma_plans__gold: 32242244,
      src_def_emofid__ayyar: 24500,
      emofid__ayyar: 24500,
      bourse_فولاد: 520,
      فولاد: 520,
    };

    it('correctly resolves Charisma Plan price (charisma_plans__gold)', () => {
      const holding = {
        assetId: 'charisma_plans__gold',
        assetName: 'طرح سرمایه گذاری در طلا',
        assetType: 'bourse_fund',
        buyPrice: 30000000,
      };
      const price = resolveHoldingUnitRealPrice(holding, priceMap);
      expect(price).toBe(32242244);
    });

    it('correctly resolves Charisma Plan price when assetId has src_def_ prefix', () => {
      const holding = {
        assetId: 'src_def_charisma_plans__gold',
        assetName: 'طرح طلا',
        assetType: 'bourse_fund',
      };
      const price = resolveHoldingUnitRealPrice(holding, priceMap);
      expect(price).toBe(32242244);
    });

    it('correctly resolves Emofid fund price', () => {
      const holding = {
        assetId: 'emofid__ayyar',
        assetName: 'صندوق طلای عیار مفید',
        assetType: 'bourse_fund',
      };
      const price = resolveHoldingUnitRealPrice(holding, priceMap);
      expect(price).toBe(24500);
    });

    it('correctly resolves Bourse stock price from priceMap or boursePricesMap', () => {
      const holding = {
        assetId: 'bourse_فولاد',
        assetName: 'فولاد مبارکه',
        assetType: 'bourse',
      };
      expect(resolveHoldingUnitRealPrice(holding, priceMap)).toBe(520);
      expect(resolveHoldingUnitRealPrice(holding, {}, { فولاد: 530 })).toBe(530);
    });

    it('correctly converts gold ounce to Tomans', () => {
      const holding = {
        assetId: 'ons_gold',
        assetName: 'انس جهانی طلا',
        unit: 'اونس',
      };
      expect(resolveHoldingUnitRealPrice(holding, priceMap, {}, { usdToman: 65000, goldUsd: 2700 })).toBe(175500000);
    });

    it('uses customPrice / currentPrice for custom personal assets', () => {
      const customHolding = {
        assetId: 'custom_12345',
        assetName: 'زمین دماوند',
        assetType: 'custom',
        customPrice: 500000000,
        buyPrice: 400000000,
      };
      expect(resolveHoldingUnitRealPrice(customHolding, priceMap)).toBe(500000000);
    });

    it('falls back to buyPrice when market price is not in any map', () => {
      const unknownHolding = {
        assetId: 'unknown_asset',
        buyPrice: 150000,
      };
      expect(resolveHoldingUnitRealPrice(unknownHolding, priceMap)).toBe(150000);
    });
  });
});

