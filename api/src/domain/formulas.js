/**
 * formulas.js — Pure Financial & Mathematical Formulas
 *
 * All formulas adhere to market standards:
 * - Gold: (goldUsd / TROY_OUNCE_GRAMS) * usdToman
 * - Intrinsic Value: round(gold24kGram * weight)
 * - Forex Toman: round(usdCrossRate * usdToman)
 * - Bubble: marketPrice - intrinsicPrice, percentage relative to intrinsic
 */

import { TROY_OUNCE_GRAMS } from './specs/gold.spec.js';
import { toPriceId, isCustomAssetId } from './priceIds.js';

/**
 * Calculate pure 24k gold gram value in Tomans
 * @param {number} goldUsd - Spot price of 1 troy ounce of gold in USD
 * @param {number} usdToman - USD price in Tomans
 * @returns {number}
 */
export function calculateGold24kGram(goldUsd, usdToman) {
  if (!goldUsd || !usdToman || goldUsd <= 0 || usdToman <= 0) return 0;
  return (goldUsd / TROY_OUNCE_GRAMS) * usdToman;
}

/**
 * Calculate intrinsic value in Tomans for a given gold or coin spec
 * @param {object} spec - Specification object (GOLD_SPECS or COIN_SPECS)
 * @param {number} goldUsd - Gold spot price in USD
 * @param {number} usdToman - USD price in Tomans
 * @returns {number}
 */
export function calculateIntrinsicValue(spec, goldUsd, usdToman) {
  const gold24kGram = calculateGold24kGram(goldUsd, usdToman);
  if (gold24kGram <= 0 || !spec) return 0;
  const weight = spec.gold24kWeight || spec.weight || 0;
  return Math.round(gold24kGram * weight);
}

/**
 * Calculate Toman price for a Forex currency based on its USD cross-rate
 * @param {number} usdCrossRate - Currency value relative to 1 USD
 * @param {number} usdToman - USD price in Tomans
 * @returns {number}
 */
export function calculateForexTomanPrice(usdCrossRate, usdToman) {
  const cross = Number(usdCrossRate || 0);
  const usd = Number(usdToman || 0);
  if (cross <= 0 || usd <= 0) return 0;
  return Math.round(cross * usd);
}

/**
 * Normalize raw forex quote to USD cross rate (value of 1 unit of foreign currency in USD)
 * @param {string} priceType - e.g. 'eur', 'try', 'aed', 'gbp', 'chf', 'cad', 'aud', 'cny'
 * @param {number|string} rawVal
 * @returns {number}
 */
export function normalizeForexToUsdCrossRate(priceType, rawVal) {
  const num = Number(rawVal);
  if (!num || num <= 0) return 0;

  const p = (priceType || '').toLowerCase();
  // Currencies typically stronger than USD (EUR, GBP, CHF, KWD, BHD, OMR, JOD)
  if (['eur', 'gbp', 'chf', 'kwd', 'bhd', 'omr', 'jod', 'kyd', 'gip'].includes(p)) {
    return num < 1 ? parseFloat((1 / num).toFixed(5)) : parseFloat(num.toFixed(5));
  }
  // All other currencies (TRY, AED, CAD, AUD, CNY, etc.)
  if (num > 1) {
    return parseFloat((1 / num).toFixed(5));
  }
  return parseFloat(num.toFixed(5));
}

/**
 * Calculate pure 999 silver gram value in Tomans
 * @param {number} silverUsd - Spot price of 1 troy ounce of silver in USD
 * @param {number} usdToman - USD price in Tomans
 * @returns {number}
 */
export function calculateSilverGram(silverUsd, usdToman) {
  if (!silverUsd || !usdToman || silverUsd <= 0 || usdToman <= 0) return 0;
  return (silverUsd / TROY_OUNCE_GRAMS) * usdToman;
}

/**
 * Calculate sterling silver 925 gram value in Tomans
 * @param {number} silverUsd
 * @param {number} usdToman
 * @returns {number}
 */
export function calculateSilver925(silverUsd, usdToman) {
  return calculateSilverGram(silverUsd, usdToman) * 0.925;
}

/**
 * Calculate silver ounce value in Tomans
 * @param {number} silverUsd
 * @param {number} usdToman
 * @returns {number}
 */
export function calculateSilverOunce(silverUsd, usdToman) {
  if (!silverUsd || !usdToman || silverUsd <= 0 || usdToman <= 0) return 0;
  return silverUsd * usdToman;
}

/**
 * Calculate bubble amount and percentage for any market price vs intrinsic value
 * @param {number} marketPrice
 * @param {number} intrinsicPrice
 * @returns {{ bubble: number|null, bubblePct: number|null }}
 */
export function calculateBubble(marketPrice, intrinsicPrice) {
  const market = Number(marketPrice) || 0;
  const intrinsic = Number(intrinsicPrice) || 0;
  if (!market || !intrinsic || intrinsic <= 0) {
    return { bubble: null, bubblePct: null };
  }
  const bubble = market - intrinsic;
  const bubblePct = parseFloat(((bubble / intrinsic) * 100).toFixed(1));
  return { bubble: Math.round(bubble), bubblePct };
}

/**
 * Pure Persian text normalization helper
 * @param {string} str
 * @returns {string}
 */
export function normalizePersianText(str) {
  if (!str) return '';
  return String(str)
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/[ي]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/[آأإ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .trim()
    .toLowerCase();
}

/**
 * The current price (tomans) of one unit of a holding.
 * - A personal asset (custom_…) has no market price: its own current price, else its buy price.
 * - Anything else is the price book's price for its id (old stored id forms resolve through
 *   toPriceId). Without one, the holding's own current or buy price.
 *
 * @param {object} holding - { assetId, customPrice?, currentPrice?, buyPrice?, isCustomItem? }
 * @param {Record<string, number>} [priceMap={}] - the price book's prices by id
 * @returns {number}
 */
export function resolveHoldingUnitRealPrice(holding, priceMap = {}) {
  if (!holding) return 0;
  const assetId = String(holding.assetId || holding.id || '').trim();
  const ownPrice = [holding.customPrice, holding.currentPrice]
    .map((v) => (v === undefined || v === null || v === '' ? 0 : Number(v) || 0))
    .find((v) => v > 0) || 0;
  const buyPrice = Number(holding.buyPrice) || 0;

  if (!holding.isCustomItem && !isCustomAssetId(assetId)) {
    const market = Number(priceMap?.[toPriceId(assetId, priceMap || {})]) || 0;
    if (market > 0) return Math.round(market);
  }
  if (ownPrice > 0) return Math.round(ownPrice);
  if (buyPrice > 0) return Math.round(buyPrice);
  return 0;
}

