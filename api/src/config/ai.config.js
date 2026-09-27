/**
 * ai.config.js — The Workers AI models the cheque scan may use (shared with the web app)
 */

export const CHEQUE_SCAN_MODELS = [
  { id: '@cf/meta/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout', default: true },
  { id: '@cf/mistralai/mistral-small-3.1-24b-instruct', label: 'Mistral Small 3.1' },
  { id: '@cf/google/gemma-3-12b-it', label: 'Gemma 3 12B' },
];

export const DEFAULT_CHEQUE_SCAN_MODEL = CHEQUE_SCAN_MODELS.find((m) => m.default) || CHEQUE_SCAN_MODELS[0];

/**
 * Resolves a model id. If not in the allowed list, falls back to default.
 *
 * @param {string} [modelId]
 * @returns {string} Allowed model ID
 */
export function resolveChequeScanModel(modelId) {
  if (!modelId || typeof modelId !== 'string') return DEFAULT_CHEQUE_SCAN_MODEL.id;
  const found = CHEQUE_SCAN_MODELS.find((m) => m.id === modelId.trim());
  return found ? found.id : DEFAULT_CHEQUE_SCAN_MODEL.id;
}
