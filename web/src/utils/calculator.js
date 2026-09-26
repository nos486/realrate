/**
 * calculator.js — The home calculator: intrinsic value and bubble of gold and coins at the rates
 * the user entered
 *
 * Market prices are never computed here: every price is the price book's (tomans, one id per
 * item). The user's dollar and ounce rates only decide the intrinsic values, bubbles and the
 * recommendation.
 */

import {
  GOLD_SPECS,
  COIN_SPECS,
  getCanonicalAssetName,
  calculateGold24kGram,
  calculateIntrinsicValue,
  calculateSilverGram,
  calculateSilver925,
  calculateSilverOunce,
  calculateBubble,
} from './financialSpecs.js';
import { BASE_PRICE_IDS, SPEC_BY_ID } from './priceBook.js';

/** The gold and coins the calculator analyzes, with their target bubble setting */
const ANALYZED = [
  { id: 'gold_18k', spec: GOLD_SPECS.gold_18k, setting: null },
  { id: 'mesghal', spec: GOLD_SPECS.mesghal, setting: null },
  { id: 'full_coin', spec: COIN_SPECS.full_coin, setting: 'bubble_pct_full' },
  { id: 'half_coin', spec: COIN_SPECS.half_coin, setting: 'bubble_pct_half' },
  { id: 'quarter_coin', spec: COIN_SPECS.quarter_coin, setting: 'bubble_pct_quarter' },
];

/**
 * @param {object} params
 * @param {number} params.usdToman - the dollar rate the user entered (or the live one)
 * @param {number} params.goldUsd - the gold ounce in dollars
 * @param {number} [params.silverUsd] - the silver ounce in dollars
 * @param {{ items?: Record<string, object> }|null} [params.book] - the price book
 * @param {object} [params.globalSettings]
 * @returns {object} calcData
 */
export function calculateMarketData({
  usdToman = 0,
  goldUsd = 0,
  silverUsd = 0,
  book = null,
  globalSettings = {},
}) {
  const items = book?.items || {};
  const usd_toman = Number(usdToman) || 0;
  const gold_usd = Number(goldUsd) || Number(items[BASE_PRICE_IDS.goldOunce]?.params?.usd) || 0;
  const silver_usd = Number(silverUsd) || Number(items[BASE_PRICE_IDS.silverOunce]?.params?.usd) || 0;

  if (!usd_toman || usd_toman <= 0) {
    return {
      success: false,
      requires_usd: true,
      message: 'لطفاً ابتدا قیمت دلار (تومان) را وارد کنید.',
    };
  }

  // 1. Gold and coins: the book's market price against the intrinsic value at these rates
  const itemsAnalysis = ANALYZED.map(({ id, spec, setting }) => {
    const item = items[id] || null;
    const intrinsic = calculateIntrinsicValue(spec, gold_usd, usd_toman);
    const targetBubblePct = Number(
      (setting ? globalSettings?.[setting] : null) ?? item?.params?.targetBubblePct ?? spec.targetBubblePct ?? 0,
    );
    const expected_price = Math.round(intrinsic * (1 + targetBubblePct / 100));
    // Only a price a source gave is a market price (an intrinsic-only item is not)
    const market = item?.sourceId && item.price > 0 ? item.price : null;

    let bubble = null;
    let bubble_pct = null;
    let diff_from_expected = null;
    let diff_from_expected_pct = null;
    if (market !== null) {
      const bData = calculateBubble(market, intrinsic);
      bubble = bData.bubble;
      bubble_pct = bData.bubblePct;
      diff_from_expected = market - expected_price;
      diff_from_expected_pct = expected_price
        ? parseFloat(((diff_from_expected / expected_price) * 100).toFixed(1))
        : null;
    }

    return {
      id,
      name: getCanonicalAssetName(id, spec.name),
      intrinsic: Math.round(intrinsic),
      target_bubble_pct: targetBubblePct,
      expected_price,
      market: market ? Math.round(market) : null,
      bubble: bubble !== null ? Math.round(bubble) : null,
      bubble_pct,
      diff_from_expected: diff_from_expected !== null ? Math.round(diff_from_expected) : null,
      diff_from_expected_pct,
      updated_at: item?.updatedAt || null,
      showOnHomePage: !item?.params?.hideOnHome,
    };
  });

  // Recommendation: lowest bubble percentage (only considering visible items)
  const availableItems = itemsAnalysis.filter((i) => i.market !== null && i.bubble_pct !== null && i.showOnHomePage);
  let recommendation = null;
  if (availableItems.length > 0) {
    const best = [...availableItems].sort((a, b) => a.bubble_pct - b.bubble_pct)[0];
    recommendation = {
      best_id: best.id,
      best_name: best.name,
      best_bubble_pct: best.bubble_pct,
      reason: `«${best.name}» با حباب ${best.bubble_pct}٪ دارای کمترین حباب و بالاترین ارزش خرید اقتصادی می‌باشد.`,
    };
  }

  // 2. Currencies (and the gold ounce), at their book prices
  const bookUsd = Number(items[BASE_PRICE_IDS.usd]?.price) || 0;
  const currencies = Object.values(items)
    .filter((item) => item.category === 'currency' || item.id === BASE_PRICE_IDS.goldOunce)
    .map((item) => {
      const spec = SPEC_BY_ID.get(item.id) || {};
      const p = item.params || {};
      const crossRate = p.usdCross ?? p.usd ?? (bookUsd ? item.price / bookUsd : null);
      return {
        id: item.id,
        code: String(spec.code || item.id).toUpperCase(),
        priceType: item.id,
        name: item.name,
        flag: spec.flag || '🌐',
        symbol: spec.symbol || String(spec.code || item.id).toUpperCase(),
        usd_cross_rate: crossRate !== null ? parseFloat(Number(crossRate).toFixed(4)) : null,
        toman_price: item.price,
        sourceId: item.sourceId,
        showOnHomePage: !p.hideOnHome,
      };
    });

  // 3. Silver at these rates
  const silver_999_gram = calculateSilverGram(silver_usd, usd_toman);
  const silver_925_gram = calculateSilver925(silver_usd, usd_toman);
  const silver_ounce = calculateSilverOunce(silver_usd, usd_toman);

  return {
    success: true,
    timestamp: new Date().toISOString(),
    inputs: { usd_toman, gold_usd, silver_usd },
    gold: {
      gold_24k_gram: Math.round(calculateGold24kGram(gold_usd, usd_toman)),
      gold_18k_gram: Math.round(calculateIntrinsicValue(GOLD_SPECS.gold_18k, gold_usd, usd_toman)),
      mesghal_17k: Math.round(calculateIntrinsicValue(GOLD_SPECS.mesghal, gold_usd, usd_toman)),
      bank_gram_intrinsic: calculateIntrinsicValue(COIN_SPECS.gerami_coin, gold_usd, usd_toman),
    },
    silver: {
      silver_usd,
      silver_999_gram: Math.round(silver_999_gram),
      silver_925_gram: Math.round(silver_925_gram),
      silver_ounce: Math.round(silver_ounce),
    },
    currencies,
    analysis: itemsAnalysis,
    recommendation,
    globalSettings,
  };
}
