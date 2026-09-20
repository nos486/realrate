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
  calculateSilverGram,
  calculateBubble,
} from './financialSpecs.js';
import { getSourceDisplayName } from '../config/sources.config.js';

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

// Cached static assets (Funds & Bourse) that only depend on marketItems, not on usdVal or goldVal
let cachedMarketItemsRef = null;
let cachedStaticAssets = null;
let cachedStaticPriceMap = null;

export function getStaticCatalogAssets(marketItems) {
  if (marketItems && marketItems === cachedMarketItemsRef && cachedStaticAssets && cachedStaticPriceMap) {
    return { staticAssets: cachedStaticAssets, staticPriceMap: cachedStaticPriceMap };
  }

  const staticAssets = [];
  const staticPriceMap = {};

  // ── 3. Investment Funds (Charisma, Emofid, etc.) ───────────────────────────
  const funds = marketItems?.funds || [];
  const fundSymbolsSet = new Set();

  funds.forEach((f) => {
    const p = Math.round(Number(f.priceToman || f.marketPrice || f.price || 0));
    const sourceLabel = getSourceDisplayName(f) || f.sourceName || 'صندوق‌های سرمایه‌گذاری';
    const subText = f.symbol ? `نماد: ${f.symbol} • ${sourceLabel}` : sourceLabel;
    const isPlan = Boolean(f.badge === 'طرح' || f.category === 'charisma_plans' || f.priceType === 'charisma_plans');
    const isFund = f.isFund !== undefined ? Boolean(f.isFund) : !isPlan;
    const resolved = {
      ...f,
      price: p,
      priceToman: p,
      priceType: isPlan ? 'charisma_plans' : (f.priceType || 'bourse_fund'),
      priceTypeLabel: isPlan ? 'طرح' : 'صندوق',
      sourceName: sourceLabel,
      subText,
      unit: f.unit || 'واحد',
      isFund,
      category: isPlan ? 'charisma_plans' : (f.category || 'bourse_fund'),
    };

    staticAssets.push(resolved);
    staticPriceMap[f.id] = p;
    if (f.symbol) {
      staticPriceMap[f.symbol] = p;
      const norm = normalizePersianText(f.symbol);
      if (norm) {
        staticPriceMap[norm] = p;
        fundSymbolsSet.add(norm);
      }
    }
  });

  // ── 4. Tehran Stock Exchange (Bourse) ───────────────────────────────────────
  const bourse = marketItems?.bourse || [];
  bourse.forEach((b) => {
    const normSymbol = b.symbol ? normalizePersianText(b.symbol) : '';
    // Avoid duplicating fund items in O(1) lookup
    if (normSymbol && fundSymbolsSet.has(normSymbol)) {
      return;
    }

    const p = Math.round(Number(b.priceToman || b.price || 0));
    const isFund = Boolean(b.isFund || b.category === 'bourse_fund' || b.name?.includes('صندوق'));
    const sourceLabel = getSourceDisplayName(b) || b.sourceName || b.sourceTitle || 'بورس اوراق بهادار تهران (TSETMC / BRS API)';
    const subText = b.symbol ? `نماد: ${b.symbol} • ${sourceLabel}` : sourceLabel;
    const resolved = {
      ...b,
      price: p,
      priceToman: p,
      priceType: 'bourse',
      priceTypeLabel: isFund ? 'صندوق' : 'سهام بورس',
      sourceName: sourceLabel,
      subText,
      unit: b.unit || (isFund ? 'واحد' : 'برگ سهم'),
    };

    staticAssets.push(resolved);
    staticPriceMap[b.id] = p;
    if (b.symbol) {
      staticPriceMap[b.symbol] = p;
      if (normSymbol) {
        staticPriceMap[normSymbol] = p;
      }
    }
  });

  cachedMarketItemsRef = marketItems;
  cachedStaticAssets = staticAssets;
  cachedStaticPriceMap = staticPriceMap;

  return { staticAssets, staticPriceMap };
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
  const silverGramToman = calculateSilverGram(silverVal, usdVal);

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
          const bubbleData = calculateBubble(effectivePrice, intrinsicPrice);
          bubble = bubbleData.bubble || 0;
          bubblePct = bubbleData.bubblePct || 0;
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
      priceMap['XAU'] = effectivePrice;
      priceMap['xau'] = effectivePrice;
    } else if (item.id === 'ons_silver') {
      priceMap['silver_ounce'] = effectivePrice;
      priceMap['src_def_silver_ounce'] = effectivePrice;
      priceMap['XAG'] = effectivePrice;
      priceMap['xag'] = effectivePrice;
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

  // ── 3. Cryptocurrencies (USDT, BTC, ETH) ───────────────────────────────────
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

  // ── 4. Static Catalogs (Funds & Bourse: independent of USD/Gold spot) ──────
  const { staticAssets, staticPriceMap } = getStaticCatalogAssets(marketItems);
  Object.assign(priceMap, staticPriceMap);

  const allResolvedAssets = resolvedAssets.concat(staticAssets);

  return {
    resolvedAssets: allResolvedAssets,
    priceMap,
    summary: {
      usdToman: usdVal,
      goldUsd: goldVal,
      silverUsd: silverVal,
      totalAssetsCount: allResolvedAssets.length,
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
