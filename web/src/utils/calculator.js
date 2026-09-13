/**
 * calculator.js — Pure client-side gold, currency, and bubble calculation engine
 * Zero latency, 100% synchronous in-memory calculation
 */

import {
  TROY_OUNCE_GRAMS,
  GOLD_SPECS,
  COIN_SPECS,
  SILVER_SPECS,
  FOREX_SPECS,
  CURRENCY_METADATA_MAP,
  getCanonicalAssetSpec,
  getCanonicalAssetName,
  calculateGold24kGram,
  calculateIntrinsicValue,
  calculateForexTomanPrice,
  calculateSilverGram,
  calculateSilver925,
  calculateSilverOunce,
} from './financialSpecs.js';

// Re-export dynamic currency metadata map (backed by financialSpecs.js single source of truth)
export { CURRENCY_METADATA_MAP };


/**
 * Perform all financial, gold, coin bubble, and currency conversions on the client
 * @param {object} params
 * @param {number} params.usdToman
 * @param {number} params.goldUsd
 * @param {number} [params.silverUsd]
 * @param {object} [params.marketPrices]
 * @param {object} [params.forex]
 * @param {object} [params.globalSettings]
 * @returns {object} calcData
 */
export function calculateMarketData({
  usdToman = 0,
  goldUsd = 0,
  silverUsd = null,
  marketPrices = {},
  forex = {},
  globalSettings = {},
}) {
  const usd_toman = Number(usdToman) || 0;
  const gold_usd = Number(goldUsd) || Number(marketPrices?.ons_gold?.price) || Number(globalSettings?.default_gold_usd) || 2890;
  const silver_usd = silverUsd !== null && silverUsd !== undefined
    ? Number(silverUsd)
    : (Number(marketPrices?.ons_silver?.price) || 33.5);

  if (!usd_toman || usd_toman <= 0) {
    return {
      success: false,
      requires_usd: true,
      message: 'لطفاً ابتدا قیمت دلار (تومان) را وارد کنید.',
    };
  }

  // 1. Gold intrinsic calculations (canonical specifications)
  const gold_24k_gram = calculateGold24kGram(gold_usd, usd_toman);
  const gold_18k_gram = calculateIntrinsicValue(GOLD_SPECS.gold_18k, gold_usd, usd_toman);
  const mesghal_17k = calculateIntrinsicValue(GOLD_SPECS.mesghal, gold_usd, usd_toman);
  const full_intrinsic = calculateIntrinsicValue(COIN_SPECS.full_coin, gold_usd, usd_toman);
  const half_intrinsic = calculateIntrinsicValue(COIN_SPECS.half_coin, gold_usd, usd_toman);
  const quarter_intrinsic = calculateIntrinsicValue(COIN_SPECS.quarter_coin, gold_usd, usd_toman);

  function analyzeItem(id, name, intrinsic, targetBubblePct, marketItem) {
    const market = marketItem && typeof marketItem.price === 'number' && marketItem.price > 0
      ? marketItem.price
      : null;
    const expected_price = Math.round(intrinsic * (1 + targetBubblePct / 100));

    let bubble = null;
    let bubble_pct = null;
    let diff_from_expected = null;
    let diff_from_expected_pct = null;

    if (market !== null) {
      bubble = market - intrinsic;
      bubble_pct = parseFloat(((bubble / intrinsic) * 100).toFixed(1));
      diff_from_expected = market - expected_price;
      diff_from_expected_pct = parseFloat(((diff_from_expected / expected_price) * 100).toFixed(1));
    }

    return {
      id,
      name,
      intrinsic: Math.round(intrinsic),
      target_bubble_pct: targetBubblePct,
      expected_price,
      market: market ? Math.round(market) : null,
      bubble: bubble !== null ? Math.round(bubble) : null,
      bubble_pct,
      diff_from_expected: diff_from_expected !== null ? Math.round(diff_from_expected) : null,
      diff_from_expected_pct,
      updated_at: marketItem ? marketItem.datetime : null,
      showOnHomePage: marketItem?.showOnHomePage !== undefined ? Boolean(marketItem.showOnHomePage) : true,
    };
  }

  const itemsAnalysis = [
    analyzeItem('gold_18k', getCanonicalAssetName('gold_18k', 'طلا ۱۸ عیار'), gold_18k_gram, 0, marketPrices?.gold_18k),
    analyzeItem('mesghal', getCanonicalAssetName('mesghal', 'مثقال طلا (مظنه)'), mesghal_17k, 0, marketPrices?.mesghal),
    analyzeItem('full_coin', getCanonicalAssetName('full_coin', 'سکه تمام بهار آزادی'), full_intrinsic, globalSettings?.bubble_pct_full ?? 15, marketPrices?.full_coin),
    analyzeItem('half_coin', getCanonicalAssetName('half_coin', 'نیم سکه بهار آزادی'), half_intrinsic, globalSettings?.bubble_pct_half ?? 20, marketPrices?.half_coin),
    analyzeItem('quarter_coin', getCanonicalAssetName('quarter_coin', 'ربع سکه بهار آزادی'), quarter_intrinsic, globalSettings?.bubble_pct_quarter ?? 25, marketPrices?.quarter_coin),
  ];

  // Recommendation: lowest bubble percentage (only considering visible items)
  const availableItems = itemsAnalysis.filter(i => i.market !== null && i.bubble_pct !== null && i.showOnHomePage !== false);
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

  // 2. Currencies sourced dynamically from active sources in marketPrices / forex
  const seenCodes = new Set(['USD']);
  const usdSource = marketPrices?.usd_toman || marketPrices?.usd;
  const showUsdOnHome = usdSource?.showOnHomePage !== undefined ? Boolean(usdSource.showOnHomePage) : true;
  const usdSpec = getCanonicalAssetSpec('USD') || {};
  const currencies = [
    {
      code: 'USD',
      priceType: 'usd',
      name: usdSpec.name || 'دلار',
      flag: usdSpec.flag || '🇺🇸',
      symbol: usdSpec.symbol || '$',
      usd_cross_rate: 1.0,
      toman_price: Math.round(usd_toman),
      note: 'نرخ دلار نقدی بازار آزاد',
      showOnHomePage: showUsdOnHome,
    },
  ];

  // Collect candidate currency keys dynamically from marketPrices and forex
  const candidateKeys = new Set();
  const nonCurrencyKeys = new Set([
    'usd', 'usd_toman', 'gold_18k', 'gold_24k', 'gold_melted', 'mesghal',
    'full_coin', 'half_coin', 'quarter_coin', 'gerami_coin',
    'ons_gold', 'ons_silver', 'bourse', 'bourse_fund', 'forex', 'custom_feed',
    'multi_output', 'last_updated', 'price', 'rates', 'datetime', 'label',
    'sourceid', 'isprimary', 'showonhomepage'
  ]);

  if (forex && typeof forex === 'object') {
    Object.keys(forex).forEach((k) => {
      const lower = k.toLowerCase();
      const upper = k.toUpperCase();
      if (!nonCurrencyKeys.has(lower) && upper.length >= 3 && upper.length <= 4) {
        candidateKeys.add(upper);
      }
    });
  }
  if (marketPrices && typeof marketPrices === 'object') {
    Object.keys(marketPrices).forEach((k) => {
      const lower = k.toLowerCase();
      const upper = k.toUpperCase();
      if (!nonCurrencyKeys.has(lower) && upper.length >= 3 && upper.length <= 4) {
        candidateKeys.add(upper);
      }
    });
  }

  // Standard priority order for common currencies display
  const PRIORITY_ORDER = ['EUR', 'TRY', 'AED', 'GBP', 'CHF', 'CAD', 'AUD', 'CNY', 'JPY', 'KWD', 'SAR', 'QAR'];
  const sortedCandidateKeys = Array.from(candidateKeys).sort((a, b) => {
    const idxA = PRIORITY_ORDER.indexOf(a);
    const idxB = PRIORITY_ORDER.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  sortedCandidateKeys.forEach((code) => {
    if (code === 'USD' || nonCurrencyKeys.has(code.toLowerCase()) || seenCodes.has(code)) return;
    const lowerKey = code.toLowerCase();
    const srcData = marketPrices?.[lowerKey] || marketPrices?.[code];
    const rawCross = srcData?.price || forex?.[code] || forex?.[lowerKey] || null;

    if (rawCross && Number(rawCross) > 0) {
      seenCodes.add(code);
      const crossRate = Number(rawCross);
      const tomanPrice = Math.round(crossRate * usd_toman);
      const meta = CURRENCY_METADATA_MAP[code] || {
        name: srcData?.label ? srcData.label.replace(/\(.*\)/, '').trim() : `${code}`,
        flag: '🌐',
        symbol: code,
      };

      const note = crossRate > 1
        ? `۱ ${meta.name.split(' ')[0]} = ${crossRate.toFixed(4)} دلار`
        : `۱ دلار = ${(1 / crossRate).toFixed(2)} ${meta.name.split(' ')[0]}`;

      currencies.push({
        code,
        priceType: lowerKey,
        name: meta.name,
        flag: meta.flag,
        symbol: meta.symbol,
        usd_cross_rate: parseFloat(crossRate.toFixed(4)),
        toman_price: tomanPrice,
        note,
        sourceLabel: srcData?.label,
        sourceId: srcData?.sourceId,
        showOnHomePage: srcData?.showOnHomePage !== undefined ? Boolean(srcData.showOnHomePage) : true,
      });
    }
  });

  const quick_currencies = {};
  currencies.forEach((c) => {
    quick_currencies[c.code] = c.toman_price;
  });

  // 3. Silver calculations (canonical formulas from financialSpecs.js)
  const silver_999_gram = calculateSilverGram(silver_usd, usd_toman);
  const silver_925_gram = calculateSilver925(silver_usd, usd_toman);
  const silver_ounce = calculateSilverOunce(silver_usd, usd_toman);

  return {
    success: true,
    timestamp: new Date().toISOString(),
    inputs: { usd_toman, gold_usd, silver_usd },
    gold: {
      gold_24k_gram: Math.round(gold_24k_gram),
      gold_18k_gram: Math.round(gold_18k_gram),
      mesghal_17k: Math.round(mesghal_17k),
      bank_gram_intrinsic: calculateIntrinsicValue(COIN_SPECS.gerami_coin, gold_usd, usd_toman),
    },
    silver: {
      silver_usd,
      silver_999_gram: Math.round(silver_999_gram),
      silver_925_gram: Math.round(silver_925_gram),
      silver_ounce: Math.round(silver_ounce),
    },
    quick_currencies,
    currencies,
    market_data: marketPrices,
    analysis: itemsAnalysis,
    recommendation,
    globalSettings,
  };
}
