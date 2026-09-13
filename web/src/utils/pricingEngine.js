/**
 * pricingEngine.js — Single Source of Truth client-side pricing engine
 * Calculates live prices for Gold, Coins, Forex, Bourse, and Derived Assets
 * Ensures 100% price consistency across Search, Portfolio, and Main Page.
 */

import { computeAllDerivedPrices } from './formulaEvaluator.js';

export function normalizePersianText(str) {
  if (!str) return '';
  return String(str)
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '') // zero-width
    .replace(/[ي]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/[آأإ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .trim()
    .toLowerCase();
}

/**
 * Compute real-time prices for all catalog items based on live client USD and Gold spot
 *
 * Rules:
 * 1. Forex: price = usdCrossRate * clientUsdToman
 * 2. Gold & Coins:
 *    - If marketPrice exists from active source -> use marketPrice (قیمت بازار)
 *    - If no marketPrice exists -> use intrinsicPrice (ارزش واقعی بر اساس انس، دلار و وزن/عیار)
 * 3. Bourse: price = priceToman (divided by 10 from BRS API)
 * 4. Derived Assets: calculated dynamically from formula evaluator
 *
 * @param {object} params
 * @param {object} params.marketItems - Payload from /api/market/items
 * @param {number} params.usdToman - Client's active USD rate in Tomans
 * @param {number} params.goldUsd - Gold ounce spot rate in USD
 * @param {number} params.silverUsd - Silver ounce spot rate in USD
 * @param {Array} [params.customDerivedList] - Custom derived assets if any
 * @returns {{ resolvedAssets: Array, priceMap: object, summary: object }}
 */
export function computeUnifiedPrices({
  marketItems = {},
  usdToman = 0,
  goldUsd = 0,
  silverUsd = 0,
  customDerivedList = null,
}) {
  const usdVal = Number(usdToman) || Number(marketItems?.meta?.live_usd_toman) || Number(marketItems?.meta?.default_usd_toman) || 0;
  const goldVal = Number(goldUsd) || Number(marketItems?.meta?.gold_usd) || 2890;
  const silverVal = Number(silverUsd) || Number(marketItems?.meta?.silver_usd) || 33.5;

  const gold24kGramToman = usdVal > 0 ? (goldVal / 31.1034768) * usdVal : 0;
  const silverGramToman = usdVal > 0 ? (silverVal / 31.1034768) * usdVal : 0;

  const resolvedAssets = [];
  const priceMap = {};

  // ── 1. Gold & Coins ──────────────────────────────────────────────────────────
  const goldAndCoins = marketItems?.goldAndCoins || [];
  goldAndCoins.forEach((item) => {
    const isSpecialGoldOunce = item.id === 'ons_gold';
    const isSpecialSilverOunce = item.id === 'ons_silver';

    let intrinsicPrice = 0;
    let effectivePrice = 0;
    let priceType = 'intrinsic';
    let priceTypeLabel = 'ارزش واقعی (ذاتی)';
    let bubble = 0;
    let bubblePct = 0;
    let subDetails = '';

    if (isSpecialGoldOunce) {
      effectivePrice = goldVal;
      intrinsicPrice = goldVal;
      priceType = 'spot';
      priceTypeLabel = 'انس جهانی طلا';
      subDetails = 'نرخ جهانی به دلار (XAU/USD)';
    } else if (isSpecialSilverOunce) {
      effectivePrice = silverVal;
      intrinsicPrice = silverVal;
      priceType = 'spot';
      priceTypeLabel = 'انس جهانی نقره';
      subDetails = 'نرخ جهانی به دلار (XAG/USD)';
    } else {
      // Physical gold / silver intrinsic value calculation
      const baseGram = item.category === 'silver' ? silverGramToman : gold24kGramToman;
      intrinsicPrice = Math.round(baseGram * (item.gold24kWeight || item.weight || 1));
      const targetExpected = Math.round(intrinsicPrice * (1 + (item.targetBubblePct || 0) / 100));

      const hasSourcePrice = typeof item.marketPrice === 'number' && item.marketPrice > 0;

      if (hasSourcePrice) {
        effectivePrice = Math.round(item.marketPrice);
        priceType = 'market';
        priceTypeLabel = 'قیمت بازار (سورس)';
        if (intrinsicPrice > 0) {
          bubble = effectivePrice - intrinsicPrice;
          bubblePct = parseFloat(((bubble / intrinsicPrice) * 100).toFixed(1));
        }
        subDetails = `${item.sourceName || 'سورس زنده'} • ارزش ذاتی: ${intrinsicPrice.toLocaleString('fa-IR')} ت (حباب: ${bubblePct}٪)`;
      } else {
        // No source: Use calculated real intrinsic / target value
        effectivePrice = targetExpected > 0 ? targetExpected : intrinsicPrice;
        priceType = 'intrinsic';
        priceTypeLabel = 'ارزش واقعی (محاسباتی)';
        bubble = 0;
        bubblePct = 0;
        subDetails = `محاسبه بر اساس انس (${goldVal}$) و دلار (${usdVal > 0 ? usdVal.toLocaleString('fa-IR') : '۰'} ت)`;
      }
    }

    const resolved = {
      ...item,
      price: effectivePrice,
      intrinsicPrice,
      marketPrice: item.marketPrice || null,
      priceType,
      priceTypeLabel,
      bubble,
      bubblePct,
      subText: subDetails,
      isRealMarket: priceType === 'market',
    };

    resolvedAssets.push(resolved);
    priceMap[item.id] = effectivePrice;
    priceMap[item.id.toLowerCase()] = effectivePrice;
  });

  // ── 2. Forex Currencies ─────────────────────────────────────────────────────
  const currencies = marketItems?.currencies || [];
  currencies.forEach((cur) => {
    const cross = Number(cur.usdCrossRate || 1.0);
    const calculatedToman = usdVal > 0 ? Math.round(cross * usdVal) : Math.round(cross);
    const crossDisplay = cross < 1 ? cross.toFixed(4) : cross.toFixed(2);

    const subDetails = cur.code === 'USD'
      ? (cur.sourceName || 'دلار آزاد بازار')
      : `بر مبنای دلار (${crossDisplay} $) • دلار: ${usdVal > 0 ? usdVal.toLocaleString('fa-IR') : '۰'} ت`;

    const resolved = {
      ...cur,
      price: calculatedToman,
      priceType: 'forex',
      priceTypeLabel: 'نرخ برابری ارز',
      subText: subDetails,
      unit: usdVal > 0 ? 'تومان' : 'دلار',
    };

    resolvedAssets.push(resolved);
    priceMap[cur.code] = calculatedToman;
    priceMap[cur.code.toLowerCase()] = calculatedToman;
    priceMap[`forex_${cur.code.toLowerCase()}`] = calculatedToman;
  });

  // ── 3. Tehran Stock Exchange (Bourse) ───────────────────────────────────────
  const bourse = marketItems?.bourse || [];
  bourse.forEach((b) => {
    const p = Math.round(Number(b.priceToman || b.price || 0));
    const resolved = {
      ...b,
      price: p,
      priceToman: p,
      priceType: 'bourse',
      priceTypeLabel: 'سهام بورس',
      subText: `نماد: ${b.symbol} • بورس تهران`,
      unit: b.unit || 'برگ سهم',
    };

    resolvedAssets.push(resolved);
    priceMap[b.id] = p;
    if (b.symbol) {
      priceMap[b.symbol] = p;
      priceMap[normalizePersianText(b.symbol)] = p;
    }
  });

  // ── 4. Dynamic Derived Assets ───────────────────────────────────────────────
  const baseMap = {
    usd: usdVal,
    usd_toman: usdVal,
    ons_gold: goldVal,
    gold_usd: goldVal,
    ons_silver: silverVal,
    silver_usd: silverVal,
    gold_18k: priceMap.gold_18k || Math.round(gold24kGramToman * 0.75),
    mesghal: priceMap.mesghal || Math.round(gold24kGramToman * 4.608 * 0.705),
  };

  const derivedList = customDerivedList || marketItems?.derivedAssets || [];
  const derivedPrices = Array.isArray(derivedList) && derivedList.length > 0
    ? computeAllDerivedPrices(derivedList, baseMap)
    : {};

  derivedList.forEach((d) => {
    const computedPrice = Number(derivedPrices[d.id] || 0);
    const resolved = {
      ...d,
      price: computedPrice,
      priceType: 'derived',
      priceTypeLabel: 'فرمول محاسباتی',
      subText: d.formulaDisplay ? `فرمول: ${d.formulaDisplay}` : 'محاسبه خودکار بر مبنای قیمت‌های پایه',
      unit: d.unit || 'گرم',
    };

    resolvedAssets.push(resolved);
    priceMap[d.id] = computedPrice;
    priceMap[d.id.toLowerCase()] = computedPrice;
  });

  return {
    resolvedAssets,
    priceMap,
    summary: {
      usdToman: usdVal,
      goldUsd: goldVal,
      silverUsd: silverVal,
      totalAssetsCount: resolvedAssets.length,
    },
  };
}

/**
 * Filter and rank resolved assets by query string
 *
 * @param {Array} assets
 * @param {string} query
 * @param {object} [options]
 * @returns {Array}
 */
export function searchUnifiedAssets(assets = [], query = '', options = {}) {
  const { category = '', limit = 50 } = options;
  if (!Array.isArray(assets)) return [];

  const cleanQ = normalizePersianText(query);
  const qUpper = query.trim().toUpperCase();

  let filtered = assets;

  // Filter by category if specified
  if (category) {
    if (category === 'gold_coin') {
      filtered = filtered.filter(a => a.category === 'gold' || a.category === 'coin');
    } else {
      filtered = filtered.filter(a => a.category === category);
    }
  }

  if (!cleanQ) {
    return filtered.slice(0, limit);
  }

  // Score items for ranking
  const scored = [];

  for (const item of filtered) {
    const normName = normalizePersianText(item.name || '');
    const normSym = normalizePersianText(item.symbol || item.code || '');
    const code = (item.code || item.symbol || '').toUpperCase();

    let score = 0;

    // Exact symbol / code match (highest priority)
    if (code === qUpper || normSym === cleanQ) {
      score += 1000;
    } else if (code.startsWith(qUpper) || normSym.startsWith(cleanQ)) {
      score += 500;
    } else if (code.includes(qUpper) || normSym.includes(cleanQ)) {
      score += 300;
    }

    // Exact name match
    if (normName === cleanQ) {
      score += 800;
    } else if (normName.startsWith(cleanQ)) {
      score += 400;
    } else if (normName.includes(cleanQ)) {
      score += 200;
    }

    // Aliases match (e.g. سکه گرمی, لیر, یورو)
    if (item.aliases && Array.isArray(item.aliases)) {
      if (item.aliases.some(al => normalizePersianText(al) === cleanQ)) {
        score += 600;
      } else if (item.aliases.some(al => normalizePersianText(al).includes(cleanQ))) {
        score += 150;
      }
    }

    if (score > 0) {
      scored.push({ item, score });
    }
  }

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(s => s.item);
}
