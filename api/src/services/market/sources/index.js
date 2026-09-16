/**
 * sources/index.js — Registry and Factory for Price Source Adapters
 */

import { telegramSourceAdapter } from "./telegramSource.adapter.js";
import { forexApiSourceAdapter } from "./forexApi.source.adapter.js";
import { bourseSymbolsSourceAdapter } from "./bourseSymbols.source.adapter.js";
import { emofidFundsSourceAdapter } from "./emofidFunds.source.adapter.js";
import { charismaFundsSourceAdapter } from "./charismaFunds.source.adapter.js";
import { apiUrlSourceAdapter } from "./apiUrl.source.adapter.js";

export {
  telegramSourceAdapter,
  forexApiSourceAdapter,
  bourseSymbolsSourceAdapter,
  emofidFundsSourceAdapter,
  charismaFundsSourceAdapter,
  apiUrlSourceAdapter,
};

export * from "./parsingUtils.js";

/**
 * List of registered price source adapters in evaluation priority order
 */
export const sourceAdapters = [
  forexApiSourceAdapter,
  bourseSymbolsSourceAdapter,
  emofidFundsSourceAdapter,
  charismaFundsSourceAdapter,
  telegramSourceAdapter,
  apiUrlSourceAdapter,
];

/**
 * Resolves the appropriate adapter for a given price source configuration
 * @param {object} sourceConfig
 * @returns {import("./ISourceAdapter.js").SourceAdapter}
 */
export function getAdapterForSource(sourceConfig) {
  if (!sourceConfig) return telegramSourceAdapter;

  const type = String(sourceConfig.sourceType || sourceConfig.source_type || "").toLowerCase().trim();

  // 1. Direct explicit type match (highest precedence contract)
  if (type) {
    const directMatch = sourceAdapters.find((a) => a.id === type);
    if (directMatch) return directMatch;
  }

  // 2. Adapter-specific supports evaluation
  for (const adapter of sourceAdapters) {
    if (typeof adapter.supports === "function" && adapter.supports(sourceConfig)) {
      return adapter;
    }
  }

  // 3. Fallback: generic HTTP API endpoint vs telegram channel
  if (sourceConfig.endpoint || sourceConfig.apiUrl || sourceConfig.usd_api_url) {
    return apiUrlSourceAdapter;
  }

  return telegramSourceAdapter;
}
