/**
 * ai.config.js — The vision models the cheque scan may use (shared with the web app)
 *
 * `provider` says how a model is called (services/ai/visionProviders.js). Workers AI runs through
 * the Worker's AI binding; the others need their API key as a Worker secret
 * (`npx wrangler secret put <KEY>`), and a model whose key isn't set is listed as unavailable.
 * The first available model in this order is the default.
 */

/** The Worker secret each provider's API key is kept in */
export const AI_PROVIDER_SECRETS = {
  gemini: 'GEMINI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
};

export const CHEQUE_SCAN_MODELS = [
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', provider: 'gemini' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', provider: 'anthropic' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', provider: 'anthropic' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', provider: 'openai' },
  { id: '@cf/meta/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout (Workers AI)', provider: 'workers-ai' },
  { id: '@cf/mistralai/mistral-small-3.1-24b-instruct', label: 'Mistral Small 3.1 (Workers AI)', provider: 'workers-ai' },
  { id: '@cf/google/gemma-3-12b-it', label: 'Gemma 3 12B (Workers AI)', provider: 'workers-ai' },
];

/** A model of the list, or null */
export function getChequeScanModel(modelId) {
  if (!modelId || typeof modelId !== 'string') return null;
  return CHEQUE_SCAN_MODELS.find((m) => m.id === modelId.trim()) || null;
}

/** Whether this Worker can call the model (its binding or API key is set) */
export function isChequeScanModelAvailable(model, env) {
  if (!model) return false;
  if (model.provider === 'workers-ai') return typeof env?.AI?.run === 'function';
  return Boolean(env?.[AI_PROVIDER_SECRETS[model.provider]]);
}

/**
 * The model a scan runs on: the requested one when it is in the list, else the first available
 * (the first of the list when none is)
 * @returns {object} a CHEQUE_SCAN_MODELS entry
 */
export function resolveChequeScanModel(modelId, env) {
  return getChequeScanModel(modelId)
    || CHEQUE_SCAN_MODELS.find((m) => isChequeScanModelAvailable(m, env))
    || CHEQUE_SCAN_MODELS[0];
}
