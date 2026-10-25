/**
 * rubikaApi.js — A small Rubika Bot API client (fetch only, no library)
 *
 * Rubika answers `{ status: "OK", data }`, or another status with `dev_message`. Every call here
 * answers `{ ok, result }` or `{ ok: false, error, retryAfter? }` like the Telegram client
 * (telegramApi.js), never throws and never lets the token appear in an error.
 *
 * Formatting is not markup: a message carries plain `text` and `metadata.meta_data_parts`, each
 * part a range of the text (UTF-16 offsets, which is how JavaScript counts) that is bold or a
 * link. `richText` builds both from segments. Buttons are an `inline_keypad` of rows; a press
 * comes back with the button's `id`. The admin's commands build Telegram's `inline_keyboard`
 * (adminCommands.service.js); `toKeypad` turns it into Rubika's, so both bots share them.
 */

import { RUBIKA_API, RUBIKA_LIMITS } from "../../../config/rubikaBot.config.js";

/** A token as BotFather (@BotFather in Rubika) gives it: letters and digits, no spaces */
export const isRubikaToken = (token) => /^[A-Za-z0-9_-]{30,200}$/.test(String(token || ""));

/**
 * One Bot API method
 * @param {string} token
 * @param {string} method - e.g. "sendMessage"
 * @param {object} [params]
 * @param {{ fetchFn?: Function }} [opts] - fetchFn: replaces fetch (tests)
 * @returns {Promise<{ ok: boolean, result?: any, error?: string, retryAfter?: number }>}
 */
export async function callRubikaApi(token, method, params = {}, { fetchFn = fetch } = {}) {
  const clean = (text) => String(text ?? "").split(token).join("***").slice(0, 240);
  try {
    const res = await fetchFn(`${RUBIKA_API}/${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(RUBIKA_LIMITS.timeoutMs),
    });
    const body = await res.json().catch(() => null);
    if (body?.status === "OK") return { ok: true, result: body.data ?? {} };
    const status = String(body?.status || "");
    const limited = res.status === 429 || /TOO_REQUEST/i.test(status);
    return {
      ok: false,
      error: clean([status, body?.dev_message].filter(Boolean).join(": ") || `HTTP ${res.status}`),
      ...(limited ? { retryAfter: 60 } : {}),
    };
  } catch (err) {
    return { ok: false, error: clean(err?.message || "request failed") };
  }
}

/**
 * Plain text and its formatting from segments
 * @param {Array<string|{ text: string, bold?: boolean, link?: string }>} segments
 * @returns {{ text: string, metadata?: { meta_data_parts: object[] } }}
 */
export function richText(segments) {
  let text = "";
  const parts = [];
  for (const segment of segments) {
    const piece = typeof segment === "string" ? { text: segment } : segment;
    const value = String(piece.text ?? "");
    if (value && piece.bold) parts.push({ type: "Bold", from_index: text.length, length: value.length });
    if (value && piece.link) {
      parts.push({ type: "Link", from_index: text.length, length: value.length, link_url: piece.link, link: { type: "hyperlink", hyperlink_data: { url: piece.link } } });
    }
    text += value;
  }
  return parts.length ? { text, metadata: { meta_data_parts: parts } } : { text };
}

/**
 * Telegram's `{ inline_keyboard: [[{ text, callback_data }]] }` as Rubika's inline keypad
 * @returns {{ rows: Array<{ buttons: Array<{ id: string, type: "Simple", button_text: string }> }> }|undefined}
 */
export function toKeypad(replyMarkup) {
  const rows = replyMarkup?.inline_keyboard;
  if (!Array.isArray(rows)) return undefined;
  return { rows: rows.map((row) => ({ buttons: row.map((b) => ({ id: String(b.callback_data), type: "Simple", button_text: String(b.text) })) })) };
}

/**
 * Post a message. `text` is plain, or `richText(...)`'s `{ text, metadata }`; `keypad` adds buttons
 * @param {{ fetchFn?: Function, keypad?: object }} [opts]
 */
export function sendMessage(token, chatId, text, { keypad, ...opts } = {}) {
  const body = typeof text === "string" ? { text } : text;
  return callRubikaApi(token, "sendMessage", {
    chat_id: chatId,
    ...body,
    ...(keypad?.rows?.length ? { inline_keypad: keypad } : {}),
  }, opts);
}

/** Replace a message's text (plain) */
export const editMessageText = (token, chatId, messageId, text, opts) =>
  callRubikaApi(token, "editMessageText", { chat_id: chatId, message_id: String(messageId), text }, opts);

/** Replace a message's buttons (no rows removes them) */
export const editMessageKeypad = (token, chatId, messageId, keypad, opts) =>
  callRubikaApi(token, "editMessageKeypad", { chat_id: chatId, message_id: String(messageId), inline_keypad: keypad || { rows: [] } }, opts);

/** Have Rubika post one kind of update (`type`, e.g. "ReceiveUpdate") to `url` */
export const updateBotEndpoints = (token, url, type, opts) => callRubikaApi(token, "updateBotEndpoints", { url, type }, opts);

/** The bot itself: `{ bot: { bot_id, bot_title, username } }` */
export const getMe = (token, opts) => callRubikaApi(token, "getMe", {}, opts);

/** A chat by id: `{ chat: { chat_id, chat_type, title, username } }` */
export const getChat = (token, chatId, opts) => callRubikaApi(token, "getChat", { chat_id: chatId }, opts);
