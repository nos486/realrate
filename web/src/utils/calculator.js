/**
 * calculator.js — Pure client-side gold, currency, and bubble calculation engine
 * Zero latency, 100% synchronous in-memory calculation
 */

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

  // 1. Gold intrinsic calculations
  const gold_24k_gram = (gold_usd / 31.1034768) * usd_toman;
  const gold_18k_gram = gold_24k_gram * 0.75;
  const mesghal_17k = gold_24k_gram * 4.608 * 0.705;
  const full_intrinsic = gold_24k_gram * 7.3197;
  const half_intrinsic = gold_24k_gram * 3.6594;
  const quarter_intrinsic = gold_24k_gram * 1.8297;

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
    };
  }

  const itemsAnalysis = [
    analyzeItem('gold_18k', 'طلا ۱۸ عیار', gold_18k_gram, 0, marketPrices?.gold_18k),
    analyzeItem('mesghal', 'مثقال طلا (مظنه)', mesghal_17k, 0, marketPrices?.mesghal),
    analyzeItem('full_coin', 'سکه تمام ۸۶', full_intrinsic, globalSettings?.bubble_pct_full ?? 15, marketPrices?.full_coin),
    analyzeItem('half_coin', 'نیم سکه بهار آزادی', half_intrinsic, globalSettings?.bubble_pct_half ?? 20, marketPrices?.half_coin),
    analyzeItem('quarter_coin', 'ربع سکه بهار آزادی', quarter_intrinsic, globalSettings?.bubble_pct_quarter ?? 25, marketPrices?.quarter_coin),
  ];

  // Recommendation: lowest bubble percentage
  const availableItems = itemsAnalysis.filter(i => i.market !== null && i.bubble_pct !== null);
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

  // 2. Currencies sourced ONLY from active sources in marketPrices / forex
  const KNOWN_CURRENCY_SOURCES = [
    { code: 'EUR', priceType: 'eur', name: 'یورو اروپا', flag: '🇪🇺', symbol: '€' },
    { code: 'TRY', priceType: 'try', name: 'لیر ترکیه', flag: '🇹🇷', symbol: '₺' },
    { code: 'AED', priceType: 'aed', name: 'درهم امارات', flag: '🇦🇪', symbol: 'د.إ' },
    { code: 'GBP', priceType: 'gbp', name: 'پوند انگلیس', flag: '🇬🇧', symbol: '£' },
    { code: 'CHF', priceType: 'chf', name: 'فرانک سوئیس', flag: '🇨🇭', symbol: 'CHF' },
    { code: 'CAD', priceType: 'cad', name: 'دلار کانادا', flag: '🇨🇦', symbol: 'C$' },
    { code: 'AUD', priceType: 'aud', name: 'دلار استرالیا', flag: '🇦🇺', symbol: 'A$' },
    { code: 'CNY', priceType: 'cny', name: 'یوان چین', flag: '🇨🇳', symbol: '¥' },
  ];

  const currencies = [
    {
      code: 'USD',
      name: 'دلار آمریکا',
      flag: '🇺🇸',
      symbol: '$',
      usd_cross_rate: 1.0,
      toman_price: Math.round(usd_toman),
      note: 'نرخ دلار نقدی بازار آزاد',
    },
  ];

  KNOWN_CURRENCY_SOURCES.forEach((cfg) => {
    // Only include if present in sources (marketPrices) or forex compiled from sources
    const srcData = marketPrices?.[cfg.priceType];
    const rawCross = srcData?.price || forex?.[cfg.code] || null;

    if (rawCross && Number(rawCross) > 0) {
      const crossRate = Number(rawCross);
      const tomanPrice = Math.round(crossRate * usd_toman);
      currencies.push({
        code: cfg.code,
        priceType: cfg.priceType,
        name: cfg.name,
        flag: cfg.flag,
        symbol: cfg.symbol,
        usd_cross_rate: parseFloat(crossRate.toFixed(4)),
        toman_price: tomanPrice,
        note: (cfg.code === 'EUR' || cfg.code === 'GBP' || cfg.code === 'CHF')
          ? `۱ ${cfg.name.split(' ')[0]} = ${crossRate.toFixed(4)} دلار`
          : `۱ دلار = ${(1 / crossRate).toFixed(2)} ${cfg.name.split(' ')[0]}`,
        sourceLabel: srcData?.label,
        sourceId: srcData?.sourceId,
      });
    }
  });

  const quick_currencies = {};
  currencies.forEach((c) => {
    quick_currencies[c.code] = c.toman_price;
  });

  // 3. Silver calculations
  const silver_999_gram = (silver_usd / 31.1034768) * usd_toman;
  const silver_925_gram = silver_999_gram * 0.925;
  const silver_ounce = silver_usd * usd_toman;

  return {
    success: true,
    timestamp: new Date().toISOString(),
    inputs: { usd_toman, gold_usd, silver_usd },
    gold: {
      gold_24k_gram: Math.round(gold_24k_gram),
      gold_18k_gram: Math.round(gold_18k_gram),
      mesghal_17k: Math.round(mesghal_17k),
      bank_gram_intrinsic: Math.round(gold_24k_gram * 1.01 * (22 / 24)),
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
