/**
 * calculator.js — Pure client-side gold, currency, and bubble calculation engine
 * Zero latency, 100% synchronous in-memory calculation
 */

// Rich metadata dictionary for world currencies
export const CURRENCY_METADATA_MAP = {
  USD: { name: 'دلار آمریکا', flag: '🇺🇸', symbol: '$' },
  EUR: { name: 'یورو اروپا', flag: '🇪🇺', symbol: '€' },
  TRY: { name: 'لیر ترکیه', flag: '🇹🇷', symbol: '₺' },
  AED: { name: 'درهم امارات', flag: '🇦🇪', symbol: 'د.إ' },
  GBP: { name: 'پوند انگلیس', flag: '🇬🇧', symbol: '£' },
  CHF: { name: 'فرانک سوئیس', flag: '🇨🇭', symbol: 'CHF' },
  CAD: { name: 'دلار کانادا', flag: '🇨🇦', symbol: 'C$' },
  AUD: { name: 'دلار استرالیا', flag: '🇦🇺', symbol: 'A$' },
  CNY: { name: 'یوان چین', flag: '🇨🇳', symbol: '¥' },
  JPY: { name: 'ین ژاپن', flag: '🇯🇵', symbol: '¥' },
  KWD: { name: 'دینار کویت', flag: '🇰🇼', symbol: 'د.ك' },
  SAR: { name: 'ریال عربستان', flag: '🇸🇦', symbol: 'ر.س' },
  QAR: { name: 'ریال قطر', flag: '🇶🇦', symbol: 'ر.ق' },
  OMR: { name: 'ریال عمان', flag: '🇴🇲', symbol: 'ر.ع' },
  BHD: { name: 'دینار بحرین', flag: '🇧🇭', symbol: 'د.ب' },
  RUB: { name: 'روبل روسیه', flag: '🇷🇺', symbol: '₽' },
  INR: { name: 'روپیه هند', flag: '🇮🇳', symbol: '₹' },
  PKR: { name: 'روپیه پاکستان', flag: '🇵🇰', symbol: '₨' },
  IQD: { name: 'دینار عراق', flag: '🇮🇶', symbol: 'د.ع' },
  AFN: { name: 'افغانی افغانستان', flag: '🇦🇫', symbol: '؋' },
  SEK: { name: 'کرون سوئد', flag: '🇸🇪', symbol: 'kr' },
  NOK: { name: 'کرون نروژ', flag: '🇳🇴', symbol: 'kr' },
  DKK: { name: 'کرون دانمارک', flag: '🇩🇰', symbol: 'kr' },
  SGD: { name: 'دلار سنگاپور', flag: '🇸🇬', symbol: 'S$' },
  HKD: { name: 'دلار هنگ کنگ', flag: '🇭🇰', symbol: 'HK$' },
  KRW: { name: 'وون کره جنوبی', flag: '🇰🇷', symbol: '₩' },
  THB: { name: 'بات تایلند', flag: '🇹🇭', symbol: '฿' },
  MYR: { name: 'رینگیت مالزی', flag: '🇲🇾', symbol: 'RM' },
  NZD: { name: 'دلار نیوزیلند', flag: '🇳🇿', symbol: 'NZ$' },
  BRL: { name: 'رئال برزیل', flag: '🇧🇷', symbol: 'R$' },
  ZAR: { name: 'رند آفریقای جنوبی', flag: '🇿🇦', symbol: 'R' },
  USDT: { name: 'تتر (USDT)', flag: '🪙', symbol: '₮' },
};

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

  // 2. Currencies sourced dynamically from active sources in marketPrices / forex
  const seenCodes = new Set(['USD']);
  const currencies = [
    {
      code: 'USD',
      priceType: 'usd',
      name: 'دلار آمریکا',
      flag: '🇺🇸',
      symbol: '$',
      usd_cross_rate: 1.0,
      toman_price: Math.round(usd_toman),
      note: 'نرخ دلار نقدی بازار آزاد',
    },
  ];

  // Collect candidate currency keys dynamically from marketPrices and forex
  const candidateKeys = new Set();
  if (forex && typeof forex === 'object') {
    Object.keys(forex).forEach(k => candidateKeys.add(k.toUpperCase()));
  }
  if (marketPrices && typeof marketPrices === 'object') {
    const nonCurrencyKeys = new Set([
      'usd', 'gold_18k', 'full_coin', 'half_coin', 'quarter_coin',
      'mesghal', 'ons_gold', 'ons_silver', 'bourse', 'bourse_fund', 'forex'
    ]);
    Object.keys(marketPrices).forEach(k => {
      if (!nonCurrencyKeys.has(k.toLowerCase())) {
        candidateKeys.add(k.toUpperCase());
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
    if (code === 'USD' || seenCodes.has(code)) return;
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
