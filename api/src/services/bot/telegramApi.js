/**
 * telegramApi.js — A small Telegram Bot API client (fetch only, no library)
 *
 * Every call answers `{ ok, result }` or `{ ok: false, error, retryAfter? }`; it never throws and
 * never lets the token appear in an error (a failed request's text is cleaned of it).
 */

import { TELEGRAM_API, BOT_LIMITS } from "../../config/telegramBot.config.js";

/** The token's shape: `<bot id>:<secret>` */
export const isBotToken = (token) => /^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(String(token || ""));

/** HTML-escape a text for parse_mode HTML */
export const escapeHtml = (text) =>
  String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * One Bot API method
 * @param {string} token
 * @param {string} method - e.g. "sendMessage"
 * @param {object} [params]
 * @param {{ fetchFn?: Function }} [opts] - fetchFn: replaces fetch (tests)
 * @returns {Promise<{ ok: boolean, result?: any, error?: string, retryAfter?: number }>}
 */
export async function callBotApi(token, method, params = {}, { fetchFn = fetch } = {}) {
  const clean = (text) => String(text ?? "").split(token).join("***").slice(0, 240);
  try {
    const res = await fetchFn(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(BOT_LIMITS.timeoutMs),
    });
    const body = await res.json().catch(() => null);
    if (body?.ok) return { ok: true, result: body.result };
    return {
      ok: false,
      error: clean(body?.description || `HTTP ${res.status}`),
      ...(body?.parameters?.retry_after ? { retryAfter: Number(body.parameters.retry_after) } : {}),
    };
  } catch (err) {
    return { ok: false, error: clean(err?.message || "request failed") };
  }
}

/** Post an HTML message (Telegram adds the link preview) */
export const sendMessage = (token, chatId, html, opts) =>
  callBotApi(token, "sendMessage", { chat_id: chatId, text: html, parse_mode: "HTML" }, opts);

/** The bot itself (its username shows the admin which bot the token is) */
export const getMe = (token, opts) => callBotApi(token, "getMe", {}, opts);

/** A chat by `@username` or id */
export const getChat = (token, chatId, opts) => callBotApi(token, "getChat", { chat_id: chatId }, opts);
