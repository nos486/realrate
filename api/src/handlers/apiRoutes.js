/**
 * apiRoutes.js — Public API route handlers
 * /api/calculate — Gold/coin bubble analysis and currency calculation
 * /api/rates    — Live gold spot + forex rates
 * /api/telegram — Raw Telegram market prices
 */

import { getLatestMarketRates } from "../services/priceSources.js";
import { fetchForexRates } from "../services/forexRates.js";
import { jsonResponse, errorResponse, getCorsHeaders } from "../lib/helpers.js";

/**
 * GET /api/rates
 * Return live gold & silver spot price, USD/Toman, and forex rates
 * Reads directly from KV / unified sources cache (sub-5ms response)
 */
export async function handleFetchRates(env, analytics, globalSettings, request = null) {
  try {
    const [rates, forex] = await Promise.all([
      getLatestMarketRates(env),
      fetchForexRates(env),
    ]);

    const gold_usd = rates.ons_gold?.price || globalSettings.default_gold_usd || 2890;
    const silver_usd = rates.ons_silver?.price || 33.5;

    const live_usd_item = rates.usd_toman || null;
    const live_usd_toman = live_usd_item
      ? live_usd_item.price
      : (globalSettings.default_usd_toman || 62000);

    const silver_999_gram = (silver_usd / 31.1034768) * live_usd_toman;
    const silver_925_gram = silver_999_gram * 0.925;
    const silver_ounce = silver_usd * live_usd_toman;

    return jsonResponse({
      success: true,
      gold_usd,
      silver_usd,
      silver: {
        silver_usd,
        silver_999_gram: Math.round(silver_999_gram),
        silver_925_gram: Math.round(silver_925_gram),
        silver_ounce: Math.round(silver_ounce),
      },
      live_usd_toman,
      live_usd_item,
      forex,
      market_prices: rates,
      analytics,
      globalSettings,
    }, 200, request);
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500, request);
  }
}

/**
 * GET /api/calculate?usd_toman=&gold_usd=
 * Full gold & silver bubble analysis, coin arbitrage, and all currency conversions
 */
export async function handleCalculate(url, env, analytics, globalSettings, request = null) {
  const [rates, forex] = await Promise.all([
    getLatestMarketRates(env),
    fetchForexRates(env),
  ]);

  const usd_toman_raw = url.searchParams.get("usd_toman");
  let usd_toman = usd_toman_raw
    ? parseFloat(usd_toman_raw)
    : (rates.usd_toman ? rates.usd_toman.price : (globalSettings.default_usd_toman || null));

  const userGoldUsd = url.searchParams.get("gold_usd");
  const gold_usd = userGoldUsd
    ? parseFloat(userGoldUsd)
    : (rates.ons_gold?.price || globalSettings.default_gold_usd || 2890);

  if (!usd_toman || isNaN(usd_toman) || usd_toman <= 0) {
    return jsonResponse({ success: false, requires_usd: true, message: "لطفاً ابتدا قیمت دلار (تومان) را وارد کنید." }, 400, request);
  }

  // Gold price calculations
  const gold_24k_gram  = (gold_usd / 31.1034768) * usd_toman;
  const gold_18k_gram  = gold_24k_gram * 0.75;
  const mesghal_17k    = gold_24k_gram * 4.608 * 0.705;
  const full_intrinsic    = gold_24k_gram * 7.3197;
  const half_intrinsic    = gold_24k_gram * 3.6594;
  const quarter_intrinsic = gold_24k_gram * 1.8297;

  function analyzeItem(id, name, intrinsic, targetBubblePct, tgItem) {
    const market = (tgItem && typeof tgItem.price === "number") ? tgItem.price : null;
    const expected_price = Math.round(intrinsic * (1 + targetBubblePct / 100));
    let bubble = null, bubble_pct = null, diff_from_expected = null, diff_from_expected_pct = null;
    if (market !== null) {
      bubble = market - intrinsic;
      bubble_pct = parseFloat(((bubble / intrinsic) * 100).toFixed(1));
      diff_from_expected = market - expected_price;
      diff_from_expected_pct = parseFloat(((diff_from_expected / expected_price) * 100).toFixed(1));
    }
    return {
      id, name,
      intrinsic: Math.round(intrinsic),
      target_bubble_pct: targetBubblePct,
      expected_price,
      market: market ? Math.round(market) : null,
      bubble: bubble !== null ? Math.round(bubble) : null,
      bubble_pct,
      diff_from_expected: diff_from_expected !== null ? Math.round(diff_from_expected) : null,
      diff_from_expected_pct,
      updated_at: tgItem ? tgItem.datetime : null,
    };
  }

  const itemsAnalysis = [
    analyzeItem("gold_18k",     "طلا ۱۸ عیار",            gold_18k_gram,    0,                                         rates.gold_18k),
    analyzeItem("mesghal",      "مثقال طلا (مظنه)",       mesghal_17k,      0,                                         rates.mesghal),
    analyzeItem("full_coin",    "سکه تمام ۸۶",             full_intrinsic,   globalSettings.bubble_pct_full    ?? 15,   rates.full_coin),
    analyzeItem("half_coin",    "نیم سکه بهار آزادی",      half_intrinsic,   globalSettings.bubble_pct_half    ?? 20,   rates.half_coin),
    analyzeItem("quarter_coin", "ربع سکه بهار آزادی",      quarter_intrinsic,globalSettings.bubble_pct_quarter ?? 25,   rates.quarter_coin),
  ];

  const availableItems = itemsAnalysis.filter(i => i.market !== null && i.bubble_pct !== null);
  let recommendation = null;
  if (availableItems.length > 0) {
    const best = [...availableItems].sort((a, b) => a.bubble_pct - b.bubble_pct)[0];
    recommendation = {
      best_id: best.id, best_name: best.name, best_bubble_pct: best.bubble_pct,
      reason: `«${best.name}» با حباب ${best.bubble_pct}٪ دارای کمترین حباب و بالاترین ارزش خرید اقتصادی می‌باشد.`,
    };
  }

  const fx = (code, fallback) => (forex && typeof forex[code] === "number" && forex[code] > 0) ? forex[code] : fallback;

  const quick_currencies = {
    USD: Math.round(usd_toman),
    EUR: Math.round((1 / fx("EUR", 0.915))   * usd_toman),
    AED: Math.round((1 / fx("AED", 3.6725))  * usd_toman),
    TRY: Math.round((1 / fx("TRY", 33.50))   * usd_toman),
  };

  const currencies = [
    { code:"USD", name:"دلار آمریکا",       flag:"🇺🇸", symbol:"$",    usd_cross_rate:1.0,                                              toman_price:Math.round(usd_toman),                             note:"نرخ دلار نقدی بازار آزاد" },
    { code:"EUR", name:"یورو",              flag:"🇪🇺", symbol:"€",    usd_cross_rate:parseFloat((1/fx("EUR",0.915)).toFixed(4)),        toman_price:Math.round((1/fx("EUR",0.915))*usd_toman),         note:`۱ یورو = ${(1/fx("EUR",0.915)).toFixed(4)} دلار` },
    { code:"AED", name:"درهم امارات",       flag:"🇦🇪", symbol:"د.إ",  usd_cross_rate:parseFloat((1/fx("AED",3.6725)).toFixed(4)),      toman_price:Math.round((1/fx("AED",3.6725))*usd_toman),       note:`۱ دلار = ${fx("AED",3.6725).toFixed(4)} درهم` },
    { code:"TRY", name:"لیر ترکیه",         flag:"🇹🇷", symbol:"₺",    usd_cross_rate:parseFloat((1/fx("TRY",33.50)).toFixed(4)),       toman_price:Math.round((1/fx("TRY",33.50))*usd_toman),        note:`۱ دلار = ${fx("TRY",33.50).toFixed(2)} لیر` },
    { code:"GBP", name:"پوند انگلیس",       flag:"🇬🇧", symbol:"£",    usd_cross_rate:parseFloat((1/fx("GBP",0.782)).toFixed(4)),       toman_price:Math.round((1/fx("GBP",0.782))*usd_toman),        note:`۱ پوند = ${(1/fx("GBP",0.782)).toFixed(4)} دلار` },
    { code:"CAD", name:"دلار کانادا",       flag:"🇨🇦", symbol:"C$",   usd_cross_rate:parseFloat((1/fx("CAD",1.370)).toFixed(4)),       toman_price:Math.round((1/fx("CAD",1.370))*usd_toman),        note:`۱ دلار کانادا = ${(1/fx("CAD",1.370)).toFixed(4)} دلار` },
    { code:"AUD", name:"دلار استرالیا",     flag:"🇦🇺", symbol:"A$",   usd_cross_rate:parseFloat((1/fx("AUD",1.520)).toFixed(4)),       toman_price:Math.round((1/fx("AUD",1.520))*usd_toman),        note:`۱ دلار استرالیا = ${(1/fx("AUD",1.520)).toFixed(4)} دلار` },
    { code:"CHF", name:"فرانک سوئیس",       flag:"🇨🇭", symbol:"CHF",  usd_cross_rate:parseFloat((1/fx("CHF",0.865)).toFixed(4)),       toman_price:Math.round((1/fx("CHF",0.865))*usd_toman),        note:`۱ فرانک = ${(1/fx("CHF",0.865)).toFixed(4)} دلار` },
    { code:"CNY", name:"یوان چین",          flag:"🇨🇳", symbol:"¥",    usd_cross_rate:parseFloat((1/fx("CNY",7.18)).toFixed(4)),        toman_price:Math.round((1/fx("CNY",7.18))*usd_toman),         note:`۱ دلار = ${fx("CNY",7.18).toFixed(2)} یوان` },
    { code:"SAR", name:"ریال عربستان",      flag:"🇸🇦", symbol:"ر.س", usd_cross_rate:parseFloat((1/fx("SAR",3.75)).toFixed(4)),        toman_price:Math.round((1/fx("SAR",3.75))*usd_toman),         note:`۱ دلار = ${fx("SAR",3.75).toFixed(2)} ریال` },
    { code:"QAR", name:"ریال قطر",          flag:"🇶🇦", symbol:"ر.ق", usd_cross_rate:parseFloat((1/fx("QAR",3.64)).toFixed(4)),        toman_price:Math.round((1/fx("QAR",3.64))*usd_toman),         note:`۱ دلار = ${fx("QAR",3.64).toFixed(2)} ریال` },
    { code:"KWD", name:"دینار کویت",        flag:"🇰🇼", symbol:"د.ك", usd_cross_rate:parseFloat((1/fx("KWD",0.306)).toFixed(4)),       toman_price:Math.round((1/fx("KWD",0.306))*usd_toman),        note:`۱ دینار کویت = ${(1/fx("KWD",0.306)).toFixed(4)} دلار` },
    { code:"JPY", name:"۱۰۰ ین ژاپن",       flag:"🇯🇵", symbol:"¥",    usd_cross_rate:parseFloat((100/fx("JPY",147.50)).toFixed(4)),    toman_price:Math.round((100/fx("JPY",147.50))*usd_toman),     note:`۱۰۰ ین = ${(100/fx("JPY",147.50)).toFixed(4)} دلار` },
    { code:"RUB", name:"روبل روسیه",        flag:"🇷🇺", symbol:"₽",    usd_cross_rate:parseFloat((1/fx("RUB",88.50)).toFixed(4)),       toman_price:Math.round((1/fx("RUB",88.50))*usd_toman),        note:`۱ دلار = ${fx("RUB",88.50).toFixed(1)} روبل` },
    { code:"IQD", name:"۱,۰۰۰ دینار عراق", flag:"🇮🇶", symbol:"د.ع", usd_cross_rate:parseFloat((1000/fx("IQD",1310.0)).toFixed(4)),   toman_price:Math.round((1000/fx("IQD",1310.0))*usd_toman),   note:`۱,۰۰۰ دینار = ${(1000/fx("IQD",1310.0)).toFixed(4)} دلار` },
    { code:"AFN", name:"افغانی افغانستان",  flag:"🇦🇫", symbol:"؋",   usd_cross_rate:parseFloat((1/fx("AFN",70.50)).toFixed(4)),       toman_price:Math.round((1/fx("AFN",70.50))*usd_toman),        note:`۱ دلار = ${fx("AFN",70.50).toFixed(1)} افغانی` },
  ];


  // Silver calculations
  const silver_usd = rates.ons_silver?.price || 33.5;
  const silver_999_gram = (silver_usd / 31.1034768) * usd_toman;
  const silver_925_gram = silver_999_gram * 0.925;
  const silver_ounce = silver_usd * usd_toman;

  return new Response(JSON.stringify({
    success: true,
    timestamp: new Date().toISOString(),
    inputs: { usd_toman, gold_usd, silver_usd },
    gold: { gold_24k_gram: Math.round(gold_24k_gram), gold_18k_gram: Math.round(gold_18k_gram), mesghal_17k: Math.round(mesghal_17k) },
    silver: {
      silver_usd,
      silver_999_gram: Math.round(silver_999_gram),
      silver_925_gram: Math.round(silver_925_gram),
      silver_ounce: Math.round(silver_ounce),
    },
    quick_currencies,
    currencies,
    market_data: rates,
    analysis: itemsAnalysis,
    recommendation,
    analytics,
    globalSettings,
  }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", ...getCorsHeaders(request) },
  });
}
