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

/**
 * Post a message (Telegram adds the link preview). HTML by default; `plain` sends the text as it
 * is; `replyMarkup` adds inline buttons; `previewUrl` makes that link the one previewed, as a small
 * picture above the text.
 * @param {{ fetchFn?: Function, plain?: boolean, replyMarkup?: object, previewUrl?: string }} [opts]
 */
export const sendMessage = (token, chatId, html, { plain, replyMarkup, previewUrl, ...opts } = {}) =>
  callBotApi(token, "sendMessage", {
    chat_id: chatId,
    text: html,
    ...(plain ? {} : { parse_mode: "HTML" }),
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    ...(previewUrl ? { link_preview_options: { url: previewUrl, prefer_small_media: true, show_above_text: true } } : {}),
  }, opts);

/** Replace a message's text (plain) and drop its buttons */
export const editMessageText = (token, chatId, messageId, text, opts) =>
  callBotApi(token, "editMessageText", { chat_id: chatId, message_id: messageId, text, reply_markup: { inline_keyboard: [] } }, opts);

/** Answer a button press (stops the button's spinner; `text` shows as a small notice) */
export const answerCallbackQuery = (token, id, text, opts) =>
  callBotApi(token, "answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) }, opts);

/** Have Telegram post updates to `url`, each carrying `secret` in X-Telegram-Bot-Api-Secret-Token */
export const setWebhook = (token, url, secret, opts) =>
  callBotApi(token, "setWebhook", { url, secret_token: secret, allowed_updates: ["message", "callback_query"] }, opts);

export const deleteWebhook = (token, opts) => callBotApi(token, "deleteWebhook", {}, opts);

/** The bot itself (its username shows the admin which bot the token is) */
export const getMe = (token, opts) => callBotApi(token, "getMe", {}, opts);

/** A chat by `@username` or id */
export const getChat = (token, chatId, opts) => callBotApi(token, "getChat", { chat_id: chatId }, opts);
