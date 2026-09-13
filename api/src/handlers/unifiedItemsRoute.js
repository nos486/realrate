/**
 * unifiedItemsRoute.js — Single Source of Truth API for all market assets & prices
 * /api/market/items — Unified catalog of gold, coins, forex, bourse, and derived assets
 */

import { getLatestMarketRates, PROMINENT_FOREX_CURRENCIES } from "../services/priceSources.js";
import { getGlobalSettings } from "../lib/settings.js";
import { jsonResponse } from "../lib/helpers.js";
import { dbGetDerivedAssets } from "../lib/db.js";
import { getBourseSymbols } from "../services/bourseSymbols.js";

// Metadata for currencies (flags, symbols, Persian names)
const CURRENCY_META = {
  USD: { name: 'دلار آمریکا', flag: '🇺🇸', symbol: '$', defaultCross: 1.0 },
  EUR: { name: 'یورو اروپا', flag: '🇪🇺', symbol: '€', defaultCross: 1.082 },
  GBP: { name: 'پوند انگلیس', flag: '🇬🇧', symbol: '£', defaultCross: 1.294 },
  AED: { name: 'درهم امارات', flag: '🇦🇪', symbol: 'د.إ', defaultCross: 0.2723 },
  TRY: { name: 'لیر ترکیه', flag: '🇹🇷', symbol: '₺', defaultCross: 0.0206 },
  CHF: { name: 'فرانک سوئیس', flag: '🇨🇭', symbol: 'CHF', defaultCross: 1.135 },
  CAD: { name: 'دلار کانادا', flag: '🇨🇦', symbol: 'CA$', defaultCross: 0.724 },
  AUD: { name: 'دلار استرالیا', flag: '🇦🇺', symbol: 'AU$', defaultCross: 0.655 },
  CNY: { name: 'یوان چین', flag: '🇨🇳', symbol: '¥', defaultCross: 0.138 },
  JPY: { name: 'ین ژاپن', flag: '🇯🇵', symbol: '¥', defaultCross: 0.0066 },
  SAR: { name: 'ریال عربستان', flag: '🇸🇦', symbol: '﷼', defaultCross: 0.266 },
  QAR: { name: 'ریال قطر', flag: '🇶🇦', symbol: '﷼', defaultCross: 0.274 },
  KWD: { name: 'دینار کویت', flag: '🇰🇼', symbol: 'د.ك', defaultCross: 3.25 },
  OMR: { name: 'ریال عمان', flag: '🇴🇲', symbol: '﷼', defaultCross: 2.60 },
  BHD: { name: 'دینار بحرین', flag: '🇧🇭', symbol: '.د.ب', defaultCross: 2.65 },
  IQD: { name: 'دینار عراق', flag: '🇮🇶', symbol: 'ع.د', defaultCross: 0.00076 },
  RUB: { name: 'روبل روسیه', flag: '🇷🇺', symbol: '₽', defaultCross: 0.0108 },
  AFN: { name: 'افغانی افغانستان', flag: '🇦🇫', symbol: '؋', defaultCross: 0.0145 },
  AZN: { name: 'منات آذربایجان', flag: '🇦🇿', symbol: '₼', defaultCross: 0.588 },
  INR: { name: 'روپیه هند', flag: '🇮🇳', symbol: '₹', defaultCross: 0.0118 },
  SEK: { name: 'کرون سوئد', flag: '🇸🇪', symbol: 'kr', defaultCross: 0.093 },
  NOK: { name: 'کرون نروژ', flag: '🇳🇴', symbol: 'kr', defaultCross: 0.091 },
  SGD: { name: 'دلار سنگاپور', flag: '🇸🇬', symbol: 'S$', defaultCross: 0.75 },
  KRW: { name: 'وون کره جنوبی', flag: '🇰🇷', symbol: '₩', defaultCross: 0.00072 },
  BRL: { name: 'رئال برزیل', flag: '🇧🇷', symbol: 'R$', defaultCross: 0.178 },
};

export async function handleGetUnifiedMarketItems(env, request) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const categoryFilter = url.searchParams.get("category") || "";
    const limit = parseInt(url.searchParams.get("limit") || "2000", 10);

    // Parallel fetch of base data
    const [prices, globalSettings, derivedAssets, bourseSymbols] = await Promise.all([
      getLatestMarketRates(env),
      getGlobalSettings(env),
      dbGetDerivedAssets(env, true),
      getBourseSymbols(env, q, limit),
    ]);

    const gold_usd = prices.ons_gold?.price || globalSettings?.default_gold_usd || 2890;
    const silver_usd = prices.ons_silver?.price || 33.5;
    const live_usd_item = prices.usd_toman || prices.usd || null;
    const live_usd_toman = live_usd_item ? live_usd_item.price : (globalSettings?.default_usd_toman || 62000);

    // 1. Gold & Coin definitions with physical specs and live source market prices
    const standardGoldAndCoins = [
      {
        id: 'gold_18k',
        name: 'طلا ۱۸ عیار',
        category: 'gold',
        badge: 'طلا',
        unit: 'گرم',
        carat: 18,
        weight: 1.0,
        gold24kWeight: 0.75, // 18 / 24
        targetBubblePct: 0,
        marketPrice: prices.gold_18k?.price || null,
        sourceName: prices.gold_18k?.label || null,
        sourceId: prices.gold_18k?.sourceId || null,
        updatedAt: prices.gold_18k?.datetime || null,
        formulaText: '(انس طلا ÷ ۳۱.۱۰۳۵) × دلار × ۰.۷۵',
      },
      {
        id: 'mesghal',
        name: 'مثقال طلا (مظنه ۱۷ عیار)',
        category: 'gold',
        badge: 'طلا',
        unit: 'مثقال',
        carat: 17,
        weight: 4.608,
        gold24kWeight: 4.608 * (17 / 24), // ~3.24864
        targetBubblePct: 0,
        marketPrice: prices.mesghal?.price || null,
        sourceName: prices.mesghal?.label || null,
        sourceId: prices.mesghal?.sourceId || null,
        updatedAt: prices.mesghal?.datetime || null,
        formulaText: '(انس طلا ÷ ۳۱.۱۰۳۵) × دلار × ۴.۶۰۸ × ۰.۷۰۵',
      },
      {
        id: 'gold_24k',
        name: 'طلای ۲۴ عیار',
        category: 'gold',
        badge: 'طلا',
        unit: 'گرم',
        carat: 24,
        weight: 1.0,
        gold24kWeight: 1.0,
        targetBubblePct: 0,
        marketPrice: prices.gold_24k?.price || null,
        sourceName: prices.gold_24k?.label || null,
        sourceId: prices.gold_24k?.sourceId || null,
        updatedAt: prices.gold_24k?.datetime || null,
        formulaText: '(انس طلا ÷ ۳۱.۱۰۳۵) × دلار',
      },
      {
        id: 'full_coin',
        name: 'سکه تمام بهار آزادی (امامی)',
        category: 'coin',
        badge: 'سکه',
        unit: 'عدد',
        carat: 21.6,
        weight: 8.133,
        gold24kWeight: 7.3197, // 8.133 * (21.6 / 24)
        targetBubblePct: globalSettings?.bubble_pct_full ?? 15,
        marketPrice: prices.full_coin?.price || null,
        sourceName: prices.full_coin?.label || null,
        sourceId: prices.full_coin?.sourceId || null,
        updatedAt: prices.full_coin?.datetime || null,
        formulaText: 'وزن ۸.۱۳۳ گرم، عیار ۹۰۰ (ارزش طلای خام: ۷.۳۱۹۷ گرم ۲۴ عیار)',
      },
      {
        id: 'half_coin',
        name: 'نیم سکه بهار آزادی',
        category: 'coin',
        badge: 'سکه',
        unit: 'عدد',
        carat: 21.6,
        weight: 4.066,
        gold24kWeight: 3.6594, // 4.066 * (21.6 / 24)
        targetBubblePct: globalSettings?.bubble_pct_half ?? 20,
        marketPrice: prices.half_coin?.price || null,
        sourceName: prices.half_coin?.label || null,
        sourceId: prices.half_coin?.sourceId || null,
        updatedAt: prices.half_coin?.datetime || null,
        formulaText: 'وزن ۴.۰۶۶ گرم، عیار ۹۰۰ (ارزش طلای خام: ۳.۶۵۹۴ گرم ۲۴ عیار)',
      },
      {
        id: 'quarter_coin',
        name: 'ربع سکه بهار آزادی',
        category: 'coin',
        badge: 'سکه',
        unit: 'عدد',
        carat: 21.6,
        weight: 2.033,
        gold24kWeight: 1.8297, // 2.033 * (21.6 / 24)
        targetBubblePct: globalSettings?.bubble_pct_quarter ?? 25,
        marketPrice: prices.quarter_coin?.price || null,
        sourceName: prices.quarter_coin?.label || null,
        sourceId: prices.quarter_coin?.sourceId || null,
        updatedAt: prices.quarter_coin?.datetime || null,
        formulaText: 'وزن ۲.۰۳۳ گرم، عیار ۹۰۰ (ارزش طلای خام: ۱.۸۲۹۷ گرم ۲۴ عیار)',
      },
      {
        id: 'gerami_coin',
        name: 'سکه گرمی بانک مرکزی',
        category: 'coin',
        badge: 'سکه',
        unit: 'عدد',
        carat: 22,
        weight: 1.01,
        gold24kWeight: 1.01 * (22 / 24), // ~0.925833
        targetBubblePct: globalSettings?.bubble_pct_gerami ?? 30,
        marketPrice: prices.gerami_coin?.price || null,
        sourceName: prices.gerami_coin?.label || null,
        sourceId: prices.gerami_coin?.sourceId || null,
        updatedAt: prices.gerami_coin?.datetime || null,
        formulaText: 'وزن ۱.۰۱ گرم، عیار ۲۲ (ارزش طلای خام: ۰.۹۲۵۸ گرم ۲۴ عیار)',
      },
      {
        id: 'ons_gold',
        name: 'انس طلای جهانی (XAU)',
        category: 'gold',
        badge: 'انس',
        unit: 'دلار',
        weight: 31.1034768,
        carat: 24,
        gold24kWeight: 31.1034768,
        targetBubblePct: 0,
        marketPrice: gold_usd,
        sourceName: prices.ons_gold?.label || 'بازار جهانی طلا',
        sourceId: prices.ons_gold?.sourceId || null,
        updatedAt: prices.ons_gold?.datetime || null,
        formulaText: 'هر تروا انس طلا در بازارهای بین‌المللی',
      },
      {
        id: 'ons_silver',
        name: 'انس نقره جهانی (XAG)',
        category: 'silver',
        badge: 'انس',
        unit: 'دلار',
        weight: 31.1034768,
        marketPrice: silver_usd,
        sourceName: prices.ons_silver?.label || 'بازار جهانی نقره',
        sourceId: prices.ons_silver?.sourceId || null,
        updatedAt: prices.ons_silver?.datetime || null,
        formulaText: 'هر تروا انس نقره در بازارهای بین‌المللی',
      },
      {
        id: 'silver_gram',
        name: 'نقره خام ۹۹۹ (گرم)',
        category: 'silver',
        badge: 'نقره',
        unit: 'گرم',
        weight: 1.0,
        marketPrice: prices.silver_gram?.price || null,
        sourceName: prices.silver_gram?.label || null,
        sourceId: prices.silver_gram?.sourceId || null,
        updatedAt: prices.silver_gram?.datetime || null,
        formulaText: '(انس نقره ÷ ۳۱.۱۰۳۵) × دلار',
      },
    ];

    // 2. Forex Currencies with USD Cross Rates
    const currenciesList = [];
    // Always include USD first
    currenciesList.push({
      id: 'USD',
      code: 'USD',
      name: 'دلار آمریکا',
      category: 'currency',
      badge: 'ارز',
      unit: 'تومان',
      flag: '🇺🇸',
      symbol: '$',
      usdCrossRate: 1.0,
      marketPrice: live_usd_toman,
      sourceName: live_usd_item?.label || 'دلار آزاد',
      updatedAt: live_usd_item?.datetime || null,
    });

    for (const cur of PROMINENT_FOREX_CURRENCIES) {
      const meta = CURRENCY_META[cur.code] || { name: cur.name, flag: '🌐', symbol: cur.code, defaultCross: 1.0 };
      const lower = cur.code.toLowerCase();
      const rawPrice = Number(prices[lower]?.price || prices[cur.code]?.price || 0);
      const usdCrossRate = rawPrice > 0 ? rawPrice : meta.defaultCross;

      currenciesList.push({
        id: cur.code,
        code: cur.code,
        name: meta.name,
        category: 'currency',
        badge: 'ارز',
        unit: 'تومان',
        flag: meta.flag,
        symbol: meta.symbol,
        usdCrossRate,
        marketPrice: null, // Always calculated from client USD
        sourceName: prices[lower]?.label || 'نرخ برابری جهانی (Open ER-API)',
        updatedAt: prices[lower]?.datetime || null,
      });
    }

    // 3. Tehran Stock Exchange (Bourse) symbols
    const bourseList = (bourseSymbols || []).map(b => ({
      id: `bourse_${b.symbol}`,
      symbol: b.symbol,
      name: b.name,
      category: 'bourse',
      badge: 'بورس',
      unit: 'برگ سهم',
      priceToman: b.priceToman || b.price,
      priceRial: b.priceRial || (b.priceToman ? b.priceToman * 10 : 0),
      marketPrice: b.priceToman || b.price,
      sourceName: 'بورس اوراق بهادار تهران (TSETMC)',
    }));

    // 4. Dynamic Derived Assets from DB
    const derivedList = (derivedAssets || []).map(d => ({
      id: d.id,
      name: d.name,
      category: d.category || 'derived',
      badge: 'فرمول',
      unit: d.unit || 'گرم',
      formula: d.formula,
      formulaDisplay: d.formulaDisplay,
      isDerived: true,
      description: d.description,
    }));

    return jsonResponse({
      success: true,
      timestamp: new Date().toISOString(),
      meta: {
        gold_usd,
        silver_usd,
        live_usd_toman,
        default_usd_toman: globalSettings?.default_usd_toman || 62000,
        globalSettings,
      },
      goldAndCoins: standardGoldAndCoins,
      currencies: currenciesList,
      bourse: bourseList,
      derivedAssets: derivedList,
      counts: {
        goldAndCoins: standardGoldAndCoins.length,
        currencies: currenciesList.length,
        bourse: bourseList.length,
        derivedAssets: derivedList.length,
      }
    }, 200, request);
  } catch (err) {
    console.error("handleGetUnifiedMarketItems error:", err);
    return jsonResponse({ success: false, error: err.message }, 500, request);
  }
}
