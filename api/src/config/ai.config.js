/**
 * ai.config.js — The model the cheque scan runs on
 *
 * Google Gemini, called with the key in the GEMINI_API_KEY Worker secret
 * (`npx wrangler secret put GEMINI_API_KEY`).
 */

export const CHEQUE_SCAN_MODEL = { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" };

export const GEMINI_API_KEY_SECRET = "GEMINI_API_KEY";
