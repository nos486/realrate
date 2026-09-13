/**
 * unifiedItemsRoute.js — Single Source of Truth API for all market assets & prices
 * /api/market/items — Unified catalog of gold, coins, forex, bourse, and derived assets
 */

import { getLatestMarketRates } from "../services/priceSources.js";
import { getGlobalSettings } from "../lib/settings.js";
import { jsonResponse } from "../lib/helpers.js";
import { dbGetDerivedAssets } from "../lib/db.js";
import { getBourseSymbols } from "../services/bourseSymbols.js";
import {
  GOLD_SPECS,
  COIN_SPECS,
  SILVER_SPECS,
  FOREX_SPECS,
} from "../lib/financialSpecs.js";

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

    // Helper to resolve bubble percentage setting
    const getBubblePct = (id, fallback) => {
      if (id === 'full_coin') return globalSettings?.bubble_pct_full ?? fallback;
      if (id === 'half_coin') return globalSettings?.bubble_pct_half ?? fallback;
      if (id === 'quarter_coin') return globalSettings?.bubble_pct_quarter ?? fallback;
      if (id === 'gerami_coin') return globalSettings?.bubble_pct_gerami ?? fallback;
      return fallback;
    };

    // 1. Gold, Coin, and Silver definitions with physical specs and live source market prices
    const allPhysicalSpecs = [
      ...Object.values(GOLD_SPECS),
      ...Object.values(COIN_SPECS),
      ...Object.values(SILVER_SPECS),
    ];

    const standardGoldAndCoins = allPhysicalSpecs.map((spec) => {
      const p = prices[spec.id] || null;
      let marketPrice = p?.price || null;
      let sourceName = p?.label || null;
      let sourceId = p?.sourceId || null;
      let updatedAt = p?.datetime || null;

      if (spec.id === 'ons_gold') {
        marketPrice = gold_usd;
        sourceName = sourceName || 'بازار جهانی طلا (XAU)';
      } else if (spec.id === 'ons_silver') {
        marketPrice = silver_usd;
        sourceName = sourceName || 'بازار جهانی نقره (XAG)';
      }

      return {
        ...spec,
        targetBubblePct: getBubblePct(spec.id, spec.targetBubblePct || 0),
        marketPrice,
        sourceName,
        sourceId,
        updatedAt,
      };
    });

    // 2. Forex Currencies with USD Cross Rates
    const currenciesList = FOREX_SPECS.map((cur) => {
      const lower = cur.code.toLowerCase();
      const rawPrice = Number(prices[lower]?.price || prices[cur.code]?.price || 0);
      const usdCrossRate = rawPrice > 0 ? rawPrice : cur.defaultCross;

      if (cur.code === 'USD') {
        return {
          id: 'USD',
          code: 'USD',
          name: cur.name,
          category: 'currency',
          badge: 'ارز',
          unit: 'تومان',
          flag: cur.flag,
          symbol: cur.symbol,
          usdCrossRate: 1.0,
          marketPrice: live_usd_toman,
          sourceName: live_usd_item?.label || 'دلار آزاد',
          updatedAt: live_usd_item?.datetime || null,
        };
      }

      return {
        id: cur.code,
        code: cur.code,
        name: cur.name,
        category: 'currency',
        badge: 'ارز',
        unit: 'تومان',
        flag: cur.flag,
        symbol: cur.symbol,
        usdCrossRate,
        marketPrice: null, // Always dynamically calculated from client USD
        sourceName: prices[lower]?.label || 'نرخ برابری جهانی (Open ER-API)',
        updatedAt: prices[lower]?.datetime || null,
      };
    });

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
