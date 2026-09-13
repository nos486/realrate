/**
 * priceSources.js — Backward-compatible wrapper for Price Aggregator and Sources
 * Logic has been migrated to api/src/services/market/
 */

export * from "./market/priceAggregator.service.js";
export * from "./market/sources/index.js";
import {
  FOREX_SPECS,
  WORLD_FOREX_NAMES,
  normalizeForexToUsdCrossRate,
} from "../domain/specs/index.js";

export const PROMINENT_FOREX_CURRENCIES = FOREX_SPECS;
export { WORLD_FOREX_NAMES, normalizeForexToUsdCrossRate };
