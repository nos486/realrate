/**
 * unifiedItemsRoute.js — Single Source of Truth API for all market assets & prices
 * /api/market/items — Unified catalog of gold, coins, forex, and bourse
 */

import { getLatestMarketRates } from "../services/priceSources.js";
import { getGlobalSettings } from "../repositories/settings.repository.js";
import { jsonResponse } from "../lib/helpers.js";
import { getBourseSymbols } from "../services/bourseSymbols.js";
import {
  GOLD_SPECS,
  COIN_SPECS,
  SILVER_SPECS,
  FOREX_SPECS,
  extractFundName,
} from "../domain/specs/index.js";
import { logger } from "../lib/logger.js";
import { MAX_MARKET_ITEMS_LIMIT } from "../config/constants.js";

export async function handleGetUnifiedMarketItems(env, request) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const categoryFilter = url.searchParams.get("category") || "";
    const limit = parseInt(url.searchParams.get("limit") || String(MAX_MARKET_ITEMS_LIMIT), 10);

    // Parallel fetch of base data
    const [prices, globalSettings, bourseSymbols] = await Promise.all([
      getLatestMarketRates(env),
      getGlobalSettings(env),
      getBourseSymbols(env, q, limit),
    ]);

    const live_usd_toman = Number(prices.usd?.price || prices.usd_toman?.price || globalSettings?.default_usd_toman || 62000);
    const gold_usd = Number(prices.ons_gold?.price || 2890);
    const silver_usd = Number(prices.ons_silver?.price || 33.5);

    // 1. Standard Gold, Coins & Silver (100% computed via mathematical formulas)
    const allSpecs = [
      ...Object.values(GOLD_SPECS),
      ...Object.values(COIN_SPECS),
      ...Object.values(SILVER_SPECS),
    ];

    const standardGoldAndCoins = allSpecs.map((spec) => {
      let marketPrice = 0;
      if (spec.calculate) {
        marketPrice = spec.calculate({
          live_usd_toman,
          gold_usd,
          silver_usd,
          globalSettings,
          prices,
        });
      } else if (prices[spec.id]?.price) {
        marketPrice = Number(prices[spec.id].price);
      }

      const pToman = Math.round(marketPrice || 0);

      return {
        id: spec.id,
        symbol: spec.symbol || spec.id,
        name: spec.name,
        category: spec.category,
        badge: spec.badge,
        unit: spec.unit,
        priceToman: pToman,
        priceRial: pToman * 10,
        marketPrice: pToman,
        formulaText: spec.formulaText || null,
        changePercent: prices[spec.id]?.changePercent || 0,
        sourceName: prices[spec.id]?.label || 'محاسباتی سامانه RealRate',
        updatedAt: prices[spec.id]?.datetime || null,
      };
    });

    // 2. Forex Currencies
    const forexList = Object.values(FOREX_SPECS);
    const currenciesList = forexList.map((cur) => {
      const lower = cur.code.toLowerCase();
      let usdCrossRate = 0;

      if (cur.code === 'USD') {
        usdCrossRate = 1.0;
      } else if (prices[lower]?.usdCrossRate) {
        usdCrossRate = Number(prices[lower].usdCrossRate);
      } else if (prices[lower]?.price) {
        usdCrossRate = Number(prices[lower].price);
      }

      return {
        id: `forex_${lower}`,
        code: cur.code,
        name: cur.name,
        category: 'currency',
        badge: 'ارز',
        unit: cur.unit || 'تومان',
        symbol: cur.symbol,
        usdCrossRate,
        marketPrice: null, // Always dynamically calculated from client USD
        sourceName: prices[lower]?.label || 'نرخ برابری جهانی (Open ER-API)',
        updatedAt: prices[lower]?.datetime || null,
      };
    });

    // 3. Tehran Stock Exchange (Bourse) symbols
    const bourseList = (bourseSymbols || []).map(b => {
      const isFund = Boolean(b.isFund);
      const fundName = isFund ? extractFundName(b) : null;
      return {
        id: `bourse_${b.symbol}`,
        symbol: b.symbol,
        name: b.name,
        category: isFund ? 'bourse_fund' : 'bourse',
        badge: isFund ? 'صندوق' : 'بورس',
        unit: isFund ? 'واحد' : 'برگ سهم',
        isFund,
        fundName,
        priceToman: b.priceToman || b.price,
        priceRial: b.priceRial || (b.priceToman ? b.priceToman * 10 : 0),
        marketPrice: b.priceToman || b.price,
        sourceName: isFund ? (fundName || 'صندوق‌های سرمایه‌گذاری بورس') : 'بورس اوراق بهادار تهران (TSETMC)',
      };
    });

    return jsonResponse({
      success: true,
      timestamp: new Date().toISOString(),
      meta: {
        gold_usd,
        silver_usd,
        live_usd_toman,
        default_usd_toman: globalSettings?.default_usd_toman || 62000,
        reference_rates: prices.reference_rates || [],
        globalSettings,
      },
      goldAndCoins: standardGoldAndCoins,
      currencies: currenciesList,
      bourse: bourseList,
      counts: {
        goldAndCoins: standardGoldAndCoins.length,
        currencies: currenciesList.length,
        bourse: bourseList.length,
      }
    }, 200, request);
  } catch (err) {
    logger.error("handleGetUnifiedMarketItems error:", { error: err.message, stack: err.stack });
    return jsonResponse({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: err.message,
      },
      message: err.message,
    }, 500, request);
  }
}
