/**
 * ai.config.js — The models the cheque scan runs on
 *
 * Google Gemini, called with the key in the GEMINI_API_KEY Worker secret
 * (`npx wrangler secret put GEMINI_API_KEY`). The first model reads the cheque; when Google
 * answers that it is overloaded (503) or out of quota (429), the next one is tried, once. Each
 * model has its own quota at Google, so the fallback doesn't draw on the one that ran out.
 */

export const CHEQUE_SCAN_MODELS = [
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
];

export const GEMINI_API_KEY_SECRET = "GEMINI_API_KEY";
