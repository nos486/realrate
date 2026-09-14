import { describe, it, expect } from 'vitest';
import {
  convertWeight,
  convertAssetQuantity,
  calculateCustomAssetBubble,
  calculateBudgetPurchases,
  calculateGoldWeightValue,
} from '../../../web/src/features/calculator/utils/calculatorMath.js';
import { COIN_SPECS, GOLD_SPECS } from '../../src/domain/specs/index.js';

describe('Calculator Math Utilities', () => {
  describe('convertWeight', () => {
    it('correctly converts between gram, mesghal, and soot', () => {
      // 1 Mesghal = 4.608 Grams
      expect(convertWeight(1, 'mesghal', 'gram')).toBe(4.608);
      // 4.608 Grams = 1 Mesghal
      expect(convertWeight(4.608, 'gram', 'mesghal')).toBe(1);
      // 1 Gram = 1000 Soot
      expect(convertWeight(1, 'gram', 'soot')).toBe(1000);
      // 500 Soot = 0.5 Gram
      expect(convertWeight(500, 'soot', 'gram')).toBe(0.5);
      // 1 Mesghal = 4608 Soot
      expect(convertWeight(1, 'mesghal', 'soot')).toBe(4608);
    });

    it('returns 0 for non-positive or invalid weights', () => {
      expect(convertWeight(0, 'gram', 'mesghal')).toBe(0);
      expect(convertWeight(-5, 'gram', 'mesghal')).toBe(0);
      expect(convertWeight(null, 'gram', 'mesghal')).toBe(0);
    });
  });

  describe('convertAssetQuantity', () => {
    it('converts quantity accurately based on Toman unit prices', () => {
      // 2 Emami coins at 50,000,000 Toman each = 100,000,000 Toman
      // Target: Gold 18K at 4,000,000 Toman per gram
      // 100,000,000 / 4,000,000 = 25 grams
      const res = convertAssetQuantity(2, 50_000_000, 4_000_000);
      expect(res.isValid).toBe(true);
      expect(res.totalToman).toBe(100_000_000);
      expect(res.toAmount).toBe(25);
      expect(res.rate).toBe(12.5);
    });

    it('handles invalid or zero prices safely', () => {
      const res = convertAssetQuantity(5, 0, 50_000_000);
      expect(res.isValid).toBe(false);
      expect(res.toAmount).toBe(0);
    });
  });

  describe('calculateCustomAssetBubble', () => {
    it('calculates intrinsic value and bubble against spot gold and USD', () => {
      // Full coin: 7.322382g 24k
      // Spot gold: 2900 USD/oz, USD: 100,000 Toman
      // 24k gram = (2900 / 31.1034768) * 100000 = ~9,323,716 Toman
      // Intrinsic = 9,323,716 * 7.322382 = ~68,272,000 Toman
      const res = calculateCustomAssetBubble({
        tradedPrice: 80_000_000,
        spec: COIN_SPECS.full_coin,
        goldUsd: 2900,
        usdToman: 100_000,
        marketBubblePct: 20.0,
      });

      expect(res.isValid).toBe(true);
      expect(res.intrinsicValue).toBeGreaterThan(60_000_000);
      expect(res.bubble).toBe(80_000_000 - res.intrinsicValue);
      expect(res.bubblePct).toBeGreaterThan(0);
      expect(res.comparisonStatus).toBeDefined();
    });

    it('identifies price cheaper than market average bubble', () => {
      // If user got an amazing deal with very low bubble compared to 30% market bubble
      const res = calculateCustomAssetBubble({
        tradedPrice: 70_000_000,
        spec: COIN_SPECS.full_coin,
        goldUsd: 2900,
        usdToman: 100_000,
        marketBubblePct: 30.0,
      });

      expect(res.comparisonStatus).toBe('cheaper');
    });
  });

  describe('calculateBudgetPurchases', () => {
    it('calculates purchases with market price vs intrinsic value', () => {
      const assets = [
        {
          id: 'full_coin',
          name: 'سکه امامی',
          marketPrice: 50_000_000,
          intrinsicPrice: 40_000_000,
          bubble: 10_000_000,
          bubblePct: 25.0,
          unit: 'عدد',
        },
        {
          id: 'gold_18k',
          name: 'طلای ۱۸ عیار',
          marketPrice: 5_000_000,
          intrinsicPrice: 5_000_000,
          bubble: 0,
          bubblePct: 0,
          unit: 'گرم',
        },
      ];

      const results = calculateBudgetPurchases(100_000_000, assets);
      expect(results).toHaveLength(2);

      // Full coin: 100M / 50M = 2 coins market; 100M / 40M = 2.5 coins intrinsic
      const coin = results.find((r) => r.id === 'full_coin');
      expect(coin.marketQty).toBe(2);
      expect(coin.intrinsicQty).toBe(2.5);
      expect(coin.qtyDifference).toBe(0.5);
      expect(coin.bubbleCostToman).toBe(20_000_000);

      // Gold 18k: 100M / 5M = 20 grams market; 20 grams intrinsic
      const gold = results.find((r) => r.id === 'gold_18k');
      expect(gold.marketQty).toBe(20);
      expect(gold.intrinsicQty).toBe(20);
      expect(gold.qtyDifference).toBe(0);
    });
  });

  describe('calculateGoldWeightValue', () => {
    it('computes total Toman value for weight and karat', () => {
      // 10 grams of 18K gold at 4,500,000 Toman/gram = 45,000,000 Toman
      const res = calculateGoldWeightValue({
        weight: 10,
        unit: 'gram',
        karat: '18k',
        gold18kGramPrice: 4_500_000,
      });

      expect(res.isValid).toBe(true);
      expect(res.weightInGrams).toBe(10);
      expect(res.weightInSoot).toBe(10000);
      expect(res.totalValueToman).toBe(45_000_000);
    });

    it('computes mesghal unit input correctly', () => {
      // 1 mesghal of 18K gold at 4,000,000 Toman/gram = 4.608 * 4,000,000 = 18,432,000 Toman
      const res = calculateGoldWeightValue({
        weight: 1,
        unit: 'mesghal',
        karat: '18k',
        gold18kGramPrice: 4_000_000,
      });

      expect(res.isValid).toBe(true);
      expect(res.weightInGrams).toBe(4.608);
      expect(res.totalValueToman).toBe(18_432_000);
    });
  });
});
