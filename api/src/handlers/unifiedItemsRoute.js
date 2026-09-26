/**
 * unifiedItemsRoute.js — Single Source of Truth API for all market assets & prices
 * /api/market/items — Unified catalog of gold, coins, forex, bourse, and investment funds
 */

import { getLatestMarketRates } from "../services/priceSources.js";
import { getGlobalSettings } from "../repositories/settings.repository.js";
import { jsonResponse } from "../lib/helpers.js";
import { getAllCatalogItems } from "../services/market/catalogFeeds.service.js";
import {
  GOLD_SPECS,
  COIN_SPECS,
  SILVER_SPECS,
  FOREX_SPECS,
} from "../domain/specs/index.js";
import { logger } from "../lib/logger.js";
import { MAX_MARKET_ITEMS_LIMIT } from "../config/constants.js";

import {
  getSourceConfig,
  getItemCategory,
  getItemBadge,
  getItemUnit,
} from "../domain/displayEngine.js";

export async function handleGetUnifiedMarketItems(env, request) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const categoryFilter = url.searchParams.get("category") || "";
    const rawLimit = parseInt(url.searchParams.get("limit") || String(MAX_MARKET_ITEMS_LIMIT), 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_MARKET_ITEMS_LIMIT) : MAX_MARKET_ITEMS_LIMIT;

    // Parallel fetch of base market data and all catalog sources
    const [prices, globalSettings, catalogData] = await Promise.all([
      getLatestMarketRates(env),
      getGlobalSettings(env),
      getAllCatalogItems(env, { q, limit }),
    ]);

    const gold_usd = prices.ons_gold?.price || 0;
    const silver_usd = prices.ons_silver?.price || 0;
    const live_usd_item = prices.usd_toman || prices.usd || null;
    const live_usd_toman = live_usd_item ? live_usd_item.price : 0;

    // 1. Gold, Coin, and Silver definitions with physical specs and live source market prices
    const allPhysicalSpecs = [
      ...Object.values(GOLD_SPECS),
      ...Object.values(COIN_SPECS),
      ...Object.values(SILVER_SPECS),
    ];

    const standardGoldAndCoins = allPhysicalSpecs.map((spec) => {
      const p = prices[spec.id] || null;
      let marketPrice = p?.price || null;
      let sourceId = p?.sourceId || null;
      let updatedAt = p?.datetime || null;

      const sourceConfig = getSourceConfig(sourceId || spec.id);

      if (spec.id === 'ons_gold') {
        marketPrice = gold_usd;
      } else if (spec.id === 'ons_silver') {
        marketPrice = silver_usd;
      }

      const sourceName = p?.label || sourceConfig?.name || null;
      const targetBubblePct = sourceConfig?.bubblePct ?? spec.targetBubblePct ?? 0;
      const category = sourceConfig ? getItemCategory(spec, sourceConfig) : spec.category;
      const badge = sourceConfig ? getItemBadge(spec, sourceConfig) : spec.badge;
      const unit = sourceConfig ? getItemUnit(spec, sourceConfig) : spec.unit;

      return {
        ...spec,
        category,
        badge,
        unit,
        targetBubblePct,
        marketPrice,
        sourceName,
        sourceId: sourceId || sourceConfig?.id || null,
        updatedAt,
      };
    });

    // 2. Forex Currencies with USD Cross Rates
    const forexSource = getSourceConfig("src_def_forex");
    const usdSource = getSourceConfig("src_def_usd");

    const currenciesList = FOREX_SPECS.map((cur) => {
      const lower = cur.code.toLowerCase();
      const rawPrice = Number(prices[lower]?.price || prices[cur.code]?.price || 0);
      const usdCrossRate = rawPrice > 0 ? rawPrice : cur.defaultCross;
      const targetSource = cur.code === 'USD' ? (usdSource || forexSource) : forexSource;

      const category = getItemCategory(cur, targetSource);
      const badge = getItemBadge(cur, targetSource);
      const unit = getItemUnit(cur, targetSource);

      if (cur.code === 'USD') {
        return {
          id: 'USD',
          code: 'USD',
          name: cur.name,
          category,
          badge,
          unit,
          flag: cur.flag,
          symbol: cur.symbol,
          usdCrossRate: 1.0,
          marketPrice: live_usd_toman,
          sourceName: live_usd_item?.label || usdSource?.name || 'دلار آزاد',
          updatedAt: live_usd_item?.datetime || null,
        };
      }

      return {
        id: cur.code,
        code: cur.code,
        name: cur.name,
        category,
        badge,
        unit,
        flag: cur.flag,
        symbol: cur.symbol,
        usdCrossRate,
        marketPrice: null, // Always dynamically calculated from client USD
        sourceName: prices[lower]?.label || forexSource?.name || 'نرخ برابری جهانی (Open ER-API)',
        updatedAt: prices[lower]?.datetime || null,
      };
    });

    // 3. Catalog Feeds: Bourse stocks & Mutual/ETF Funds (dynamically provided by Catalog Engine)
    const bourseList = catalogData?.bourse || [];
    const fundsList = catalogData?.funds || [];

    return jsonResponse({
      success: true,
      timestamp: new Date().toISOString(),
      meta: {
        gold_usd,
        silver_usd,
        live_usd_toman,
        reference_rates: prices.reference_rates || [],
        globalSettings,
      },
      goldAndCoins: standardGoldAndCoins,
      currencies: currenciesList,
      bourse: bourseList,
      funds: fundsList,
      counts: {
        goldAndCoins: standardGoldAndCoins.length,
        currencies: currenciesList.length,
        bourse: bourseList.length,
        funds: fundsList.length,
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
