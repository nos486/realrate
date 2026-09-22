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
import {
  getItemCategory,
  getItemBadge,
  getItemUnit,
} from '../config/displayEngine.js';

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
let cachedStaticItemMap = null;

export function getStaticCatalogAssets(marketItems) {
  if (marketItems && marketItems === cachedMarketItemsRef && cachedStaticAssets && cachedStaticPriceMap && cachedStaticItemMap) {
    return { staticAssets: cachedStaticAssets, staticPriceMap: cachedStaticPriceMap, staticItemMap: cachedStaticItemMap };
  }

  const staticAssets = [];
  const staticPriceMap = {};
  // Maps every key variant → the full resolved asset object (for live name/brand lookup)
  const staticItemMap = {};

  // ── 3. Investment Funds (Charisma, Emofid, etc.) ───────────────────────────
  const funds = marketItems?.funds || [];
  const fundSymbolsSet = new Set();

  funds.forEach((f) => {
    const p = Math.round(Number(f.priceToman || f.marketPrice || f.price || 0));
    const sourceLabel = getSourceDisplayName(f) || f.sourceName || 'صندوق‌های سرمایه‌گذاری';
    const subText = f.symbol ? `نماد: ${f.symbol} • ${sourceLabel}` : sourceLabel;
    const category = getItemCategory(f);
    const badge = getItemBadge(f);
    const unit = getItemUnit(f);

    const resolved = {
      ...f,
      price: p,
      priceToman: p,
      priceType: f.priceType || category,
      priceTypeLabel: badge,
      badge,
      sourceName: sourceLabel,
      subText,
      unit,
      category,
    };

    staticAssets.push(resolved);

    // Helper to register a key in both maps
    const regFund = (key) => { if (key) { staticPriceMap[key] = p; staticItemMap[key] = resolved; } };

    regFund(f.id);
    const cleanId = String(f.id || '').replace(/^src_def_/, '').replace(/^derived_/, '');
    if (cleanId) {
      regFund(cleanId);
      regFund(cleanId.toLowerCase());
      regFund(cleanId.toUpperCase());
      regFund(`src_def_${cleanId}`);
      regFund(`src_def_${cleanId.toLowerCase()}`);

      if (cleanId.includes('__')) {
        const parts = cleanId.split('__');
        const suffix = parts[parts.length - 1];
        if (suffix) {
          regFund(suffix);
          regFund(suffix.toLowerCase());
          regFund(suffix.toUpperCase());
          regFund(`bourse_${suffix}`);
        }
      }
    }
    if (f.symbol) {
      regFund(f.symbol);
      regFund(f.symbol.toLowerCase());
      regFund(f.symbol.toUpperCase());
      regFund(`bourse_${f.symbol}`);
      const norm = normalizePersianText(f.symbol);
      if (norm) {
        regFund(norm);
        regFund(`bourse_${norm}`);
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
    const sourceLabel = getSourceDisplayName(b) || b.sourceName || b.sourceTitle || 'بورس اوراق بهادار تهران (TSETMC / BRS API)';
    const subText = b.symbol ? `نماد: ${b.symbol} • ${sourceLabel}` : sourceLabel;
    const category = getItemCategory(b);
    const badge = getItemBadge(b);
    const unit = getItemUnit(b);

    const resolved = {
      ...b,
      price: p,
      priceToman: p,
      priceType: b.priceType || category,
      priceTypeLabel: badge,
      badge,
      sourceName: sourceLabel,
      subText,
      unit,
      category,
    };

    staticAssets.push(resolved);

    // Helper to register a key in both maps
    const regBourse = (key) => { if (key) { staticPriceMap[key] = p; staticItemMap[key] = resolved; } };

    regBourse(b.id);
    const cleanBId = String(b.id || '').replace(/^src_def_/, '').replace(/^derived_/, '');
    if (cleanBId) {
      regBourse(cleanBId);
      regBourse(`bourse_${cleanBId}`);
    }
    if (b.symbol) {
      regBourse(b.symbol);
      regBourse(`bourse_${b.symbol}`);
      if (normSymbol) {
        regBourse(normSymbol);
        regBourse(`bourse_${normSymbol}`);
      }
    }
  });

  cachedMarketItemsRef = marketItems;
  cachedStaticAssets = staticAssets;
  cachedStaticPriceMap = staticPriceMap;
  cachedStaticItemMap = staticItemMap;

  return { staticAssets, staticPriceMap, staticItemMap };
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
 * @returns {{ resolvedAssets: Array, priceMap: object, itemMap: object, summary: object }}
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
  // itemMap: every key variant → full resolved asset object (for portfolio name/brand lookups)
  const itemMap = {};

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

    // Populate primary ID and aliases into priceMap (and itemMap) for portfolio compatibility
    const idLower = item.id.toLowerCase();
    const regGold = (key, val = effectivePrice) => { if (key) { priceMap[key] = val; itemMap[key] = resolved; } };

    regGold(item.id);
    regGold(idLower);
    regGold(`src_def_${idLower}`);

    if (item.id === 'full_coin') {
      regGold('full_new'); regGold('full_old');
      regGold('src_def_full_new'); regGold('src_def_full_old');
    } else if (item.id === 'half_coin') {
      regGold('half'); regGold('src_def_half');
    } else if (item.id === 'quarter_coin') {
      regGold('quarter'); regGold('src_def_quarter');
    } else if (item.id === 'gerami_coin') {
      regGold('bank_gram'); regGold('gram');
      regGold('src_def_bank_gram');
    } else if (item.id === 'ons_gold') {
      regGold('gold_ounce'); regGold('src_def_gold_ounce');
      regGold('XAU'); regGold('xau');
      const tomanVal = usdVal > 0 ? Math.round(goldVal * usdVal) : 0;
      regGold('ons_gold_toman', tomanVal); regGold('gold_ounce_toman', tomanVal); regGold('xau_toman', tomanVal);
    } else if (item.id === 'ons_silver') {
      regGold('silver_ounce'); regGold('src_def_silver_ounce');
      regGold('XAG'); regGold('xag');
      const tomanVal = usdVal > 0 ? Math.round(silverVal * usdVal) : 0;
      regGold('ons_silver_toman', tomanVal); regGold('silver_ounce_toman', tomanVal); regGold('xag_toman', tomanVal);
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
    const regFx = (key, val = calculatedToman) => { if (key) { priceMap[key] = val; itemMap[key] = resolved; } };

    regFx(cur.code); regFx(codeLower);
    regFx(`src_def_${codeLower}`);
    regFx(`forex_${codeLower}`);

    if (cur.code === 'USD') {
      regFx('usd'); regFx('usd_toman'); regFx('USDT'); regFx('usdt'); regFx('src_def_usd');
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
    const regCrypto = (key, val = p) => { if (key) { priceMap[key] = val; itemMap[key] = resolved; } };
    if (code) {
      regCrypto(code); regCrypto(codeLower); regCrypto(`crypto_${codeLower}`);
    }
  });

  // ── 3.5 Cash & Bank Accounts (Toman) ─────────────────────────────────────────
  const cashResolved = {
    id: 'toman',
    code: 'TOMAN',
    name: 'تومان نقد',
    category: 'cash',
    badge: 'نقد',
    unit: 'تومان',
    price: 1,
    priceToman: 1,
    priceType: 'cash',
    priceTypeLabel: 'وجه نقد',
    subText: 'موجودی ریالی / حساب بانکی (نرخ ثابت ۱ تومان)',
    aliases: ['تومان', 'نقد', 'ریال', 'پول نقد', 'حساب بانکی', 'toman', 'cash'],
  };
  resolvedAssets.push(cashResolved);
  const regCash = (key) => { if (key) { priceMap[key] = 1; itemMap[key] = cashResolved; } };
  regCash('toman');
  regCash('TOMAN');
  regCash('src_def_toman');
  regCash('cash');
  regCash('rial');

  // ── 4. Static Catalogs (Funds & Bourse: independent of USD/Gold spot) ──────
  const { staticAssets, staticPriceMap, staticItemMap } = getStaticCatalogAssets(marketItems);
  Object.assign(priceMap, staticPriceMap);
  // Merge catalog itemMap — catalog entries OVERRIDE computed non-catalog keys
  // so that bourse/fund ids always point to the correctly resolved live object.
  Object.assign(itemMap, staticItemMap);

  const allResolvedAssets = resolvedAssets.concat(staticAssets);

  return {
    resolvedAssets: allResolvedAssets,
    priceMap,
    itemMap,
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
