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
 * Resolve the current live unit real price (in Tomans) for any holding item.
 * Supports:
 * - Gold & Coins (18k, 24k, melted, mesghal, Bahar Azadi coins, Gerami, etc.)
 * - World Ounces (ons_gold, ons_silver converted to Tomans)
 * - Forex Currencies (USD, EUR, AED, TRY, GBP, etc. in Tomans)
 * - Cryptocurrencies (USDT, BTC, ETH in Tomans)
 * - Mutual & ETF Funds (Charisma, Emofid, etc.)
 * - Investment Plans (Charisma Plans, etc.)
 * - Tehran Stock Exchange (Bourse stocks and Bourse ETFs)
 * - Custom Personal Assets (with customPrice / currentPrice fallback)
 *
 * @param {object} holding - The holding item
 * @param {object} [priceMap={}] - Pricing engine price map
 * @param {object} [boursePricesMap={}] - Live bourse symbols map (sym -> price)
 * @param {object} [meta={}] - Optional metadata (usdToman, goldUsd, silverUsd)
 * @returns {number} The resolved unit real price in Tomans
 */
export function resolveHoldingUnitRealPrice(holding, priceMap = {}, boursePricesMap = {}, meta = {}) {
  if (!holding) return 0;

  const rawAssetId = String(holding.assetId || holding.id || '').trim();
  const cleanAssetId = rawAssetId.replace(/^src_def_/, '').replace(/^derived_/, '').trim();
  const buyPriceNum = Number(holding.buyPrice) || 0;
  const customPriceNum = Number(
    holding.customPrice !== undefined && holding.customPrice !== null && holding.customPrice !== ''
      ? holding.customPrice
      : (holding.currentPrice !== undefined && holding.currentPrice !== null && holding.currentPrice !== ''
        ? holding.currentPrice
        : 0)
  );

  const isCustomId =
    holding.isCustomItem ||
    cleanAssetId.startsWith('custom_') ||
    cleanAssetId === 'custom' ||
    rawAssetId.startsWith('custom_') ||
    rawAssetId === 'custom';

  // 1. Custom personal items: use user-entered custom current price, or fallback to buy price
  if (isCustomId) {
    if (customPriceNum > 0) return Math.round(customPriceNum);
    if (buyPriceNum > 0) return Math.round(buyPriceNum);
    return 0;
  }

  const usdRate = Number(
    meta?.usdToman ||
    priceMap['usd'] ||
    priceMap['USD'] ||
    priceMap['usd_toman'] ||
    priceMap['USDT'] ||
    0
  );

  // 2. Special handling for Global Ounces (XAU, XAG) in Tomans
  const idLower = cleanAssetId.toLowerCase();
  if (idLower === 'ons_gold' || idLower === 'gold_ounce' || idLower === 'xau') {
    if (priceMap['ons_gold_toman'] && Number(priceMap['ons_gold_toman']) > 0) {
      return Math.round(Number(priceMap['ons_gold_toman']));
    }
    const spotUsd = Number(priceMap['ons_gold'] || meta?.goldUsd || 0);
    if (spotUsd > 0 && usdRate > 0) {
      return Math.round(spotUsd * usdRate);
    }
  }

  if (idLower === 'ons_silver' || idLower === 'silver_ounce' || idLower === 'xag') {
    if (priceMap['ons_silver_toman'] && Number(priceMap['ons_silver_toman']) > 0) {
      return Math.round(Number(priceMap['ons_silver_toman']));
    }
    const spotUsd = Number(priceMap['ons_silver'] || meta?.silverUsd || 0);
    if (spotUsd > 0 && usdRate > 0) {
      return Math.round(spotUsd * usdRate);
    }
  }

  // 3. Candidate keys collection
  const candidateKeys = [];
  const addKey = (k) => {
    if (k && !candidateKeys.includes(k)) candidateKeys.push(k);
  };

  if (cleanAssetId) {
    addKey(cleanAssetId);
    addKey(cleanAssetId.toLowerCase());
    addKey(cleanAssetId.toUpperCase());
    addKey(`src_def_${cleanAssetId}`);
    addKey(`src_def_${cleanAssetId.toLowerCase()}`);
    addKey(`derived_${cleanAssetId}`);

    // If partitioned like charisma_plans__gold or emofid__ayyar
    if (cleanAssetId.includes('__')) {
      const parts = cleanAssetId.split('__');
      const suffix = parts[parts.length - 1];
      if (suffix) {
        addKey(suffix);
        addKey(suffix.toLowerCase());
        addKey(suffix.toUpperCase());
        addKey(`bourse_${suffix}`);
      }
    }
  }

  if (rawAssetId && rawAssetId !== cleanAssetId) {
    addKey(rawAssetId);
    addKey(rawAssetId.toLowerCase());
    addKey(rawAssetId.toUpperCase());
  }

  // Bourse symbol variations
  if (cleanAssetId.startsWith('bourse_')) {
    const sym = cleanAssetId.replace(/^bourse_/, '');
    const norm = normalizePersianText(sym);
    addKey(sym);
    addKey(`bourse_${sym}`);
    if (norm) {
      addKey(norm);
      addKey(`bourse_${norm}`);
    }
  } else {
    addKey(`bourse_${cleanAssetId}`);
    addKey(`bourse_${cleanAssetId.toLowerCase()}`);
  }

  // Symbol variations
  if (holding.symbol) {
    const sym = String(holding.symbol).trim();
    const norm = normalizePersianText(sym);
    addKey(sym);
    addKey(sym.toLowerCase());
    addKey(sym.toUpperCase());
    addKey(`bourse_${sym}`);
    if (norm) {
      addKey(norm);
      addKey(`bourse_${norm}`);
    }
  }

  // Code variations
  if (holding.code) {
    const code = String(holding.code).trim();
    addKey(code);
    addKey(code.toLowerCase());
    addKey(code.toUpperCase());
  }

  // Extract symbol from assetName if bourse or fund
  if (holding.assetName && (holding.assetType === 'bourse' || holding.assetType === 'bourse_fund' || rawAssetId.startsWith('bourse_'))) {
    const match = holding.assetName.match(/(?:سهام|صندوق)?\s*([^\s()]+)/);
    if (match && match[1]) {
      const extracted = match[1].trim();
      const norm = normalizePersianText(extracted);
      addKey(extracted);
      addKey(`bourse_${extracted}`);
      if (norm) {
        addKey(norm);
        addKey(`bourse_${norm}`);
      }
    }
  }

  // A. Check in priceMap
  if (priceMap && typeof priceMap === 'object') {
    for (const key of candidateKeys) {
      const val = priceMap[key];
      if (typeof val === 'number' && val > 0) {
        return Math.round(val);
      }
      if (typeof val === 'string') {
        const num = Number(val);
        if (!isNaN(num) && num > 0) return Math.round(num);
      }
    }
  }

  // B. Check in boursePricesMap
  if (boursePricesMap && typeof boursePricesMap === 'object') {
    for (const key of candidateKeys) {
      const cleanKey = key.replace(/^bourse_/, '');
      const val = boursePricesMap[key] || boursePricesMap[cleanKey];
      if (typeof val === 'number' && val > 0) {
        return Math.round(val);
      }
      if (typeof val === 'string') {
        const num = Number(val);
        if (!isNaN(num) && num > 0) return Math.round(num);
      }
    }
  }

  // C. Fallback: holding custom/current price or buy price
  if (customPriceNum > 0) return Math.round(customPriceNum);
  if (buyPriceNum > 0) return Math.round(buyPriceNum);

  return 0;
}

