/**
 * aiModels.js — The models the admin can pick for the news section's AI (screening and summarizing
 * news, and the daily analysis)
 *
 * `workers` runs on Workers AI (the `AI` binding), `gemini` on Google Gemini (the same key as the voice
 * features, config/ai.config.js). The first row is the default, used until the admin picks another
 * (admin → تنظیمات سایت → مدل‌های هوش مصنوعی). When the chosen model fails (deprecated, down, over
 * capacity) the rest are tried in this order (services/news/newsModel.js). Shared with the web app
 * through a symlink. Workers AI ids come from the catalog, which retires models: a retired one
 * (error 5028) is replaced here.
 *
 * `price` is the list price in dollars per million tokens ({ input, output }), for the order the
 * others are tried in when the chosen model fails: cheapest first, so a failure never falls back to
 * a costlier model than needed. Rows without a price (billed elsewhere) come after the priced ones.
 */

export const NEWS_MODEL_CHOICES = [
  // `reasoning`: the model reasons first and takes `reasoning_effort` (the others get no such option)
  { id: "glm-5.3", label: "GLM 5.3 (Workers AI)", kind: "workers", model: "@cf/zai-org/glm-5.3", reasoning: true, price: { input: 1.4, output: 4.4 } },
  { id: "deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash (Workers AI)", kind: "workers", model: "@cf/deepseek-ai/deepseek-v4.1-flash-1017", reasoning: true, price: { input: 0.3, output: 1.2 } },
  { id: "gemma-4-26b", label: "Gemma 4 26B (Workers AI)", kind: "workers", model: "@cf/google/gemma-4-26b-a4b-it", price: { input: 0.1, output: 0.3 } },
  { id: "qwen3.8-27b", label: "Qwen 3.8 27B (Workers AI)", kind: "workers", model: "@cf/qwen/qwen3.8-27b", price: { input: 0.45, output: 3.2 } },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", kind: "gemini", model: "gemini-3.5-flash-lite" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", kind: "gemini", model: "gemini-3.5-flash" },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", kind: "gemini", model: "gemini-3.6-flash" },
];

export const DEFAULT_NEWS_MODEL_CHOICE = NEWS_MODEL_CHOICES[0].id;

/**
 * The order the models are tried in: the chosen one, then the others cheapest first (by input
 * price, the bulk of the news section's tokens, then output), the unpriced ones last in list order
 * @param {string} firstId - the chosen model's id
 * @returns {Array<object>}
 */
export function newsModelFallbackOrder(firstId) {
  const first = newsModelChoiceById(firstId) || NEWS_MODEL_CHOICES[0];
  const cost = (c) => (c.price ? [c.price.input, c.price.output] : [Infinity, Infinity]);
  const rest = NEWS_MODEL_CHOICES
    .filter((c) => c.id !== first.id)
    .map((c, i) => ({ c, i }))
    .sort((a, b) => cost(a.c)[0] - cost(b.c)[0] || cost(a.c)[1] - cost(b.c)[1] || a.i - b.i)
    .map(({ c }) => c);
  return [first, ...rest];
}

/** The choice with this id, or null */
export const newsModelChoiceById = (id) => NEWS_MODEL_CHOICES.find((m) => m.id === id) || null;

/**
 * The model requests the news section may make in one day (the admin can raise or lower it in the site
 * settings): once it is used up the keywords alone decide until the next day. The run itself sends at most
 * `NEWS_LIMITS.aiCallsPerRun` per minute, so the top is what a day can use.
 */
export const NEWS_DAILY_CALLS = { default: 600, min: 50, max: 4000 };

/** A saved daily limit made valid: a whole number within the bounds, else the default */
export function cleanNewsDailyCalls(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= NEWS_DAILY_CALLS.min && n <= NEWS_DAILY_CALLS.max ? n : NEWS_DAILY_CALLS.default;
}
