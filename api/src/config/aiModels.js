/**
 * aiModels.js — The models the admin can pick for the news section's AI (screening and summarizing
 * news, and the daily analysis)
 *
 * `workers` runs on Workers AI (the `AI` binding), `gemini` on Google Gemini (the same key as the voice
 * features, config/ai.config.js). The first row is the default, used until the admin picks another
 * (admin → تنظیمات سایت → مدل‌های هوش مصنوعی). Shared with the web app through a symlink.
 */

export const NEWS_MODEL_CHOICES = [
  { id: "glm-5.3-flash", label: "GLM 5.3 Flash (Workers AI)", kind: "workers" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", kind: "gemini", model: "gemini-3.5-flash-lite" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", kind: "gemini", model: "gemini-3.5-flash" },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", kind: "gemini", model: "gemini-3.6-flash" },
];

export const DEFAULT_NEWS_MODEL_CHOICE = NEWS_MODEL_CHOICES[0].id;

/** The choice with this id, or null */
export const newsModelChoiceById = (id) => NEWS_MODEL_CHOICES.find((m) => m.id === id) || null;
