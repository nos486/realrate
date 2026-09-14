/**
 * calculatorMath.js — Pure financial calculation and conversion utilities
 * Feature: features/calculator
 * 
 * Works seamlessly with domain specifications and live pricing.
 */

import {
  calculateGold24kGram,
  calculateIntrinsicValue,
  calculateBubble,
  GOLD_SPECS,
  COIN_SPECS,
} from '../../../utils/financialSpecs.js';

/**
 * Weights conversion factors relative to 1 Gram
 */
export const WEIGHT_UNIT_FACTORS = {
  gram: 1,
  mesghal: 4.608,
  soot: 0.001,
};

export const WEIGHT_UNIT_LABELS = {
  gram: 'گرم',
  mesghal: 'مثقال',
  soot: 'سوت',
};

/**
 * Convert any weight between gram, mesghal, and soot
 * @param {number} value - Input weight amount
 * @param {'gram'|'mesghal'|'soot'} fromUnit
 * @param {'gram'|'mesghal'|'soot'} toUnit
 * @returns {number}
 */
export function convertWeight(value, fromUnit = 'gram', toUnit = 'gram') {
  const val = Number(value);
  if (!val || val <= 0 || isNaN(val)) return 0;
  if (fromUnit === toUnit) return val;

  const fromFactor = WEIGHT_UNIT_FACTORS[fromUnit] || 1;
  const toFactor = WEIGHT_UNIT_FACTORS[toUnit] || 1;

  // Convert to grams, then to target unit
  const inGrams = val * fromFactor;
  const converted = inGrams / toFactor;

  // Format precision nicely depending on unit
  if (toUnit === 'soot') {
    return Math.round(converted);
  }
  return parseFloat(converted.toFixed(4));
}

/**
 * Convert quantity from one asset to equivalent quantity in another asset
 * based on their unit price in Tomans.
 *
 * @param {number} fromAmount - Quantity of source asset
 * @param {number} fromUnitPrice - Price of 1 unit of source asset in Tomans
 * @param {number} toUnitPrice - Price of 1 unit of target asset in Tomans
 * @returns {{
 *   totalToman: number,
 *   toAmount: number,
 *   rate: number,
 *   isValid: boolean
 * }}
 */
export function convertAssetQuantity(fromAmount, fromUnitPrice, toUnitPrice) {
  const amount = Number(fromAmount);
  const pFrom = Number(fromUnitPrice);
  const pTo = Number(toUnitPrice);

  if (!amount || amount <= 0 || !pFrom || pFrom <= 0 || !pTo || pTo <= 0) {
    return {
      totalToman: 0,
      toAmount: 0,
      rate: 0,
      isValid: false,
    };
  }

  const totalToman = amount * pFrom;
  const toAmount = totalToman / pTo;
  const rate = pFrom / pTo;

  return {
    totalToman: Math.round(totalToman),
    toAmount: parseFloat(toAmount.toFixed(4)),
    rate: parseFloat(rate.toFixed(4)),
    isValid: true,
  };
}

/**
 * Calculate custom bubble for a traded price against theoretical intrinsic value
 * @param {object} params
 * @param {number} params.tradedPrice - The price entered by user (in Tomans)
 * @param {object} params.spec - Asset canonical spec (weight, 24k weight, etc.)
 * @param {number} params.goldUsd - Spot gold ounce in USD
 * @param {number} params.usdToman - USD rate in Tomans
 * @param {number} [params.marketBubblePct] - Current live average market bubble % for comparison
 * @returns {{
 *   intrinsicValue: number,
 *   bubble: number,
 *   bubblePct: number,
 *   marketDiffPct: number|null,
 *   comparisonStatus: 'cheaper'|'pricier'|'equal'|null,
 *   isValid: boolean
 * }}
 */
export function calculateCustomAssetBubble({
  tradedPrice,
  spec,
  goldUsd,
  usdToman,
  marketBubblePct = null,
}) {
  const price = Number(tradedPrice);
  if (!price || price <= 0 || !spec || !goldUsd || !usdToman) {
    return {
      intrinsicValue: 0,
      bubble: 0,
      bubblePct: 0,
      marketDiffPct: null,
      comparisonStatus: null,
      isValid: false,
    };
  }

  const intrinsicValue = calculateIntrinsicValue(spec, goldUsd, usdToman);
  if (!intrinsicValue || intrinsicValue <= 0) {
    return {
      intrinsicValue: 0,
      bubble: 0,
      bubblePct: 0,
      marketDiffPct: null,
      comparisonStatus: null,
      isValid: false,
    };
  }

  const { bubble, bubblePct } = calculateBubble(price, intrinsicValue);

  let marketDiffPct = null;
  let comparisonStatus = null;

  if (marketBubblePct !== null && !isNaN(marketBubblePct)) {
    marketDiffPct = parseFloat((bubblePct - marketBubblePct).toFixed(1));
    if (marketDiffPct < -0.3) {
      comparisonStatus = 'cheaper'; // More favorable than market average
    } else if (marketDiffPct > 0.3) {
      comparisonStatus = 'pricier'; // More expensive than market average
    } else {
      comparisonStatus = 'equal';
    }
  }

  return {
    intrinsicValue,
    bubble: bubble || 0,
    bubblePct: bubblePct || 0,
    marketDiffPct,
    comparisonStatus,
    isValid: true,
  };
}

/**
 * Reverse calculate budget purchases for multiple popular assets
 * Determines how much can be bought with market price vs intrinsic value.
 *
 * @param {number} budgetToman - Budget in Tomans
 * @param {Array<object>} catalogAssets - Resolved assets with price, intrinsicPrice, bubble, etc.
 * @returns {Array<object>}
 */
export function calculateBudgetPurchases(budgetToman, catalogAssets = []) {
  const budget = Number(budgetToman);
  if (!budget || budget <= 0 || !Array.isArray(catalogAssets)) {
    return [];
  }

  return catalogAssets
    .filter((asset) => asset && (asset.price > 0 || asset.marketPrice > 0 || asset.intrinsicPrice > 0))
    .map((asset) => {
      const marketPrice = asset.marketPrice || asset.price || 0;
      const intrinsicPrice = asset.intrinsicPrice || asset.price || 0;

      const marketQty = marketPrice > 0 ? budget / marketPrice : 0;
      const intrinsicQty = intrinsicPrice > 0 ? budget / intrinsicPrice : 0;
      const qtyDifference = intrinsicQty - marketQty;

      // Difference in Toman value paid as premium/bubble
      const bubbleCostToman = (asset.bubble && marketQty > 0)
        ? Math.round(asset.bubble * marketQty)
        : 0;

      return {
        id: asset.id,
        name: asset.name,
        symbol: asset.symbol || asset.code || '',
        category: asset.category || 'other',
        unit: asset.unit || 'واحد',
        marketPrice,
        intrinsicPrice,
        bubble: asset.bubble || 0,
        bubblePct: asset.bubblePct || 0,
        marketQty: parseFloat(marketQty.toFixed(marketQty < 1 ? 4 : 2)),
        intrinsicQty: parseFloat(intrinsicQty.toFixed(intrinsicQty < 1 ? 4 : 2)),
        qtyDifference: parseFloat(qtyDifference.toFixed(qtyDifference < 1 ? 4 : 2)),
        bubbleCostToman,
      };
    });
}

/**
 * Calculate total value in Tomans for a given weight and karat
 * @param {object} params
 * @param {number} params.weight - Amount
 * @param {'gram'|'mesghal'|'soot'} params.unit
 * @param {'18k'|'24k'|'mesghal_17k'} params.karat
 * @param {number} params.gold18kGramPrice - 18K price in Tomans per gram
 * @param {number} params.gold24kGramPrice - 24K price in Tomans per gram
 * @param {number} params.mesghalPrice - Mesghal (17K) price in Tomans
 * @returns {{
 *   weightInGrams: number,
 *   weightInMesghal: number,
 *   weightInSoot: number,
 *   unitPriceToman: number,
 *   totalValueToman: number,
 *   isValid: boolean
 * }}
 */
export function calculateGoldWeightValue({
  weight,
  unit = 'gram',
  karat = '18k',
  gold18kGramPrice = 0,
  gold24kGramPrice = 0,
  mesghalPrice = 0,
}) {
  const w = Number(weight);
  if (!w || w <= 0 || isNaN(w)) {
    return {
      weightInGrams: 0,
      weightInMesghal: 0,
      weightInSoot: 0,
      unitPriceToman: 0,
      totalValueToman: 0,
      isValid: false,
    };
  }

  const weightInGrams = convertWeight(w, unit, 'gram');
  const weightInMesghal = convertWeight(w, unit, 'mesghal');
  const weightInSoot = convertWeight(w, unit, 'soot');

  let gramPrice = Number(gold18kGramPrice) || 0;
  if (karat === '24k') {
    gramPrice = Number(gold24kGramPrice) || (gramPrice * (999.9 / 750));
  } else if (karat === 'mesghal_17k') {
    gramPrice = (Number(mesghalPrice) || 0) / 4.608;
  }

  const totalValueToman = Math.round(weightInGrams * gramPrice);

  return {
    weightInGrams,
    weightInMesghal,
    weightInSoot,
    unitPriceToman: Math.round(gramPrice),
    totalValueToman,
    isValid: totalValueToman > 0,
  };
}
