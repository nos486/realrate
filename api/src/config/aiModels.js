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
 */

export const NEWS_MODEL_CHOICES = [
  // `reasoning`: the model reasons first and takes `reasoning_effort` (the others get no such option)
  { id: "glm-5.3", label: "GLM 5.3 (Workers AI)", kind: "workers", model: "@cf/zai-org/glm-5.3", reasoning: true },
  { id: "gemma-4-26b", label: "Gemma 4 26B (Workers AI)", kind: "workers", model: "@cf/google/gemma-4-26b-a4b-it" },
  { id: "qwen3.8-27b", label: "Qwen 3.8 27B (Workers AI)", kind: "workers", model: "@cf/qwen/qwen3.8-27b" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", kind: "gemini", model: "gemini-3.5-flash-lite" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", kind: "gemini", model: "gemini-3.5-flash" },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", kind: "gemini", model: "gemini-3.6-flash" },
];

export const DEFAULT_NEWS_MODEL_CHOICE = NEWS_MODEL_CHOICES[0].id;

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
