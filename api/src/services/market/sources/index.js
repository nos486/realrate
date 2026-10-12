/**
 * sources/index.js — The price source adapters, by the `sourceType` a source names in its config
 *
 * An adapter only reads its endpoint (`fetchRaw`) and turns the answer into items (`parse`):
 * everything else — choosing it, merging a catalog with its previous list, the jump guard,
 * storing, the price book — is the pipeline's (sourceSync.service.js). See ISourceAdapter.js.
 */

import { telegramSourceAdapter } from "./telegramSource.adapter.js";
import { forexApiSourceAdapter } from "./forexApi.source.adapter.js";
import { bourseSymbolsSourceAdapter } from "./bourseSymbols.source.adapter.js";
import { emofidFundsSourceAdapter } from "./emofidFunds.source.adapter.js";
import { charismaFundsSourceAdapter } from "./charismaFunds.source.adapter.js";
import { charismaPlansSourceAdapter } from "./charismaPlans.source.adapter.js";
import { apiUrlSourceAdapter } from "./apiUrl.source.adapter.js";
import { tgjuIndicatorsSourceAdapter } from "./tgjuIndicators.source.adapter.js";

export {
  telegramSourceAdapter,
  forexApiSourceAdapter,
  bourseSymbolsSourceAdapter,
  emofidFundsSourceAdapter,
  charismaFundsSourceAdapter,
  charismaPlansSourceAdapter,
  apiUrlSourceAdapter,
  tgjuIndicatorsSourceAdapter,
};

export * from "./parsingUtils.js";

/** Every adapter */
export const sourceAdapters = [
  telegramSourceAdapter,
  apiUrlSourceAdapter,
  forexApiSourceAdapter,
  tgjuIndicatorsSourceAdapter,
  bourseSymbolsSourceAdapter,
  emofidFundsSourceAdapter,
  charismaFundsSourceAdapter,
  charismaPlansSourceAdapter,
];

const BY_TYPE = new Map(sourceAdapters.map((a) => [a.id, a]));

/**
 * The adapter a source names (`sourceType`), or null for an unknown type
 * @param {object} src
 * @returns {import("./ISourceAdapter.js").SourceAdapter|null}
 */
export function getAdapterForSource(src) {
  return BY_TYPE.get(String(src?.sourceType || "").trim().toLowerCase()) || null;
}
