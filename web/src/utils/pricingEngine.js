/**
 * pricingEngine.js — Single Source of Truth client-side pricing engine
 * Calculates live prices for Gold, Coins, Forex, and Bourse from Canonical Specs
 * Ensures 100% price consistency across Search, Portfolio, and Main Page.
 */

import {
  TROY_OUNCE_GRAMS,
  GOLD_SPECS,
  COIN_SPECS,
  SILVER_SPECS,
  FOREX_SPECS,
  CRYPTO_SPECS,
  calculateGold24kGram,
  calculateIntrinsicValue,
  calculateForexTomanPrice,
} from './financialSpecs.js';

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
 *
 * @param {object} params
 * @param {object} params.marketItems - Payload from /api/market/items
 * @param {number} params.usdToman - Client's active USD rate in Tomans
 * @param {number} params.goldUsd - Gold ounce spot rate in USD
 * @param {number} params.silverUsd - Silver ounce spot rate in USD
 * @returns {{ resolvedAssets: Array, priceMap: object, summary: object }}
 */
export function computeUnifiedPrices({
  marketItems = {},
  usdToman = 0,
  goldUsd = 0,
  silverUsd = 0,
}) {
  const usdVal = Number(usdToman) || Number(marketItems?.meta?.live_usd_toman) || Number(marketItems?.meta?.default_usd_toman) || 0;
  const goldVal = Number(goldUsd) || Number(marketItems?.meta?.gold_usd) || 2890;
  const silverVal = Number(silverUsd) || Number(marketItems?.meta?.silver_usd) || 33.5;

  const gold24kGramToman = calculateGold24kGram(goldVal, usdVal);
  const silverGramToman = usdVal > 0 ? (silverVal / TROY_OUNCE_GRAMS) * usdVal : 0;

  const resolvedAssets = [];
  const priceMap = {};

  // ── 1. Gold & Coins ──────────────────────────────────────────────────────────
  const goldAndCoins = (marketItems?.goldAndCoins && marketItems.goldAndCoins.length > 0)
    ? marketItems.goldAndCoins
    : [
        ...Object.values(GOLD_SPECS),
        ...Object.values(COIN_SPECS),
        ...Object.values(SILVER_SPECS),
      ];

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
        // No source: Use calculated real intrinsic value (ارزش واقعی طلا/سکه)
        effectivePrice = intrinsicPrice;
        priceType = 'intrinsic';
        priceTypeLabel = 'ارزش واقعی (محاسباتی)';
        bubble = 0;
        bubblePct = 0;
        subDetails = `محاسبه بر اساس ارزش ذاتی (انس ${goldVal}$ و دلار ${usdVal > 0 ? usdVal.toLocaleString('fa-IR') : '۰'} ت)`;
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

    // Populate primary ID and aliases into priceMap for portfolio compatibility
    const idLower = item.id.toLowerCase();
    priceMap[item.id] = effectivePrice;
    priceMap[idLower] = effectivePrice;
    priceMap[`src_def_${idLower}`] = effectivePrice;

    if (item.id === 'full_coin') {
      priceMap['full_new'] = effectivePrice;
      priceMap['full_old'] = effectivePrice;
      priceMap['src_def_full_new'] = effectivePrice;
      priceMap['src_def_full_old'] = effectivePrice;
    } else if (item.id === 'half_coin') {
      priceMap['half'] = effectivePrice;
      priceMap['src_def_half'] = effectivePrice;
    } else if (item.id === 'quarter_coin') {
      priceMap['quarter'] = effectivePrice;
      priceMap['src_def_quarter'] = effectivePrice;
    } else if (item.id === 'gerami_coin') {
      priceMap['bank_gram'] = effectivePrice;
      priceMap['gram'] = effectivePrice;
      priceMap['src_def_bank_gram'] = effectivePrice;
    } else if (item.id === 'ons_gold') {
      priceMap['gold_ounce'] = effectivePrice;
      priceMap['src_def_gold_ounce'] = effectivePrice;
    } else if (item.id === 'ons_silver') {
      priceMap['silver_ounce'] = effectivePrice;
      priceMap['src_def_silver_ounce'] = effectivePrice;
    }
  });

  // ── 2. Forex Currencies ─────────────────────────────────────────────────────
  const currencies = (marketItems?.currencies && marketItems.currencies.length > 0)
    ? marketItems.currencies
    : FOREX_SPECS.map(c => ({
        id: c.code,
        code: c.code,
        name: c.name,
        category: 'currency',
        badge: 'ارز',
        unit: 'تومان',
        flag: c.flag,
        symbol: c.symbol,
        usdCrossRate: c.defaultCross,
      }));

  currencies.forEach((cur) => {
    const cross = Number(cur.usdCrossRate || 1.0);
    const calculatedToman = calculateForexTomanPrice(cross, usdVal);
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
    const codeLower = cur.code.toLowerCase();
    priceMap[cur.code] = calculatedToman;
    priceMap[codeLower] = calculatedToman;
    priceMap[`src_def_${codeLower}`] = calculatedToman;
    priceMap[`forex_${codeLower}`] = calculatedToman;

    if (cur.code === 'USD') {
      priceMap['usd'] = calculatedToman;
      priceMap['usd_toman'] = calculatedToman;
      priceMap['USDT'] = calculatedToman;
      priceMap['usdt'] = calculatedToman;
      priceMap['src_def_usd'] = calculatedToman;
    }
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

  // ── 4. Cryptocurrencies (USDT, BTC, ETH) ───────────────────────────────────
  const cryptos = (marketItems?.crypto && marketItems.crypto.length > 0)
    ? marketItems.crypto
    : Object.values(CRYPTO_SPECS);

  cryptos.forEach((cr) => {
    let p = 0;
    const code = (cr.code || cr.id || cr.symbol || '').toUpperCase();
    if (code === 'USDT') {
      p = usdVal;
    } else if (cr.priceToman || cr.price) {
      p = Math.round(Number(cr.priceToman || cr.price));
    } else if (cr.usdPrice && usdVal > 0) {
      p = Math.round(Number(cr.usdPrice) * usdVal);
    }

    const resolved = {
      ...cr,
      id: cr.id || code,
      code,
      symbol: cr.symbol || code,
      name: cr.name,
      category: 'crypto',
      badge: 'رمزارز',
      price: p,
      priceType: 'crypto',
      priceTypeLabel: 'رمزارز',
      subText: cr.formulaText || cr.subText || (p > 0 ? `قیمت: ${p.toLocaleString('fa-IR')} ت` : 'بازار بین‌المللی رمزارزها'),
      unit: cr.unit || 'واحد',
      aliases: cr.aliases || [],
    };

    resolvedAssets.push(resolved);
    const codeLower = code.toLowerCase();
    if (code) {
      priceMap[code] = p;
      priceMap[codeLower] = p;
      priceMap[`crypto_${codeLower}`] = p;
    }
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
