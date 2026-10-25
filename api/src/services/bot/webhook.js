/**
 * webhook.js — The Telegram webhook: the address Telegram posts the bot's updates to and the
 * secret that proves a request came from Telegram
 *
 * The secret is not stored: it is an HMAC of the bot token, so it changes with the token and
 * only someone who has the token (the Worker) can make it.
 */

import { API_ORIGIN } from "../../lib/siteOrigin.js";
import { setWebhook, deleteWebhook } from "./telegramApi.js";

export const WEBHOOK_PATH = "/api/bot/telegram/webhook";

const toHex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * The value Telegram sends in X-Telegram-Bot-Api-Secret-Token for this token; another messenger
 * passes its own `purpose` (Rubika's secret is in its webhook's path)
 */
export async function webhookSecret(token, purpose = "realrate-telegram-webhook") {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(token), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(purpose)));
}

/** Compare two strings without stopping at the first difference */
export function safeEqual(a, b) {
  const x = new TextEncoder().encode(String(a));
  const y = new TextEncoder().encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

/**
 * Point Telegram at the Worker when the bot is on, and take it away when it is off
 * @param {{ enabled: boolean, token: string }} config
 * @param {{ fetchFn?: Function }} [opts]
 * @returns {Promise<{ ok: boolean, error?: string }|null>} null when there is no token
 */
export async function syncWebhook(config, opts = {}) {
  if (!config.token) return null;
  if (!config.enabled) return deleteWebhook(config.token, opts);
  return setWebhook(config.token, `${API_ORIGIN}${WEBHOOK_PATH}`, await webhookSecret(config.token), opts);
}
