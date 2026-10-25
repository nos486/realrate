/**
 * rubikaChat.service.js — Rubika bot feature: talk to the admin in a private Rubika chat
 *
 * The same features as the Telegram admin chat (adminChat.service.js), sharing its parts:
 * - Linking: the panel makes a one-time code (rubikaConfig.service.js); the admin sends it to the
 *   bot (`/start 123456` or the code alone). That chat and that sender's Rubika id are then the
 *   admin; only that id can run commands or press buttons.
 * - `notifyRubikaAdmin` sends a request with ✅ / ❌ buttons for an action (botActions.js, kept by
 *   `saveBotAction` and run by `runBotAction`, so a request answered in one messenger or the panel
 *   is not applied twice).
 * - Commands (`/report`, `/users`, `/user`, `/requests`, `/help`) are the shared ADMIN_COMMANDS; the
 *   user-card buttons are the shared `runUserButton`. Their Telegram keyboards become Rubika keypads.
 * - Forwarding a post of a channel to the bot saves that channel's id as the bot's channel: Rubika
 *   shows a channel's id nowhere else.
 * Rubika has no pop-up answer to a button press: the note is put in the message instead.
 */

import { getStateStore } from "../../../repositories/stateStore.repository.js";
import { getRubikaConfig, linkRubikaAdmin, setRubikaChannel } from "./rubikaConfig.service.js";
import { sendMessage, editMessageText, editMessageKeypad, toKeypad } from "./rubikaApi.js";
import { answerAdminCommand, isUserButton, runUserButton } from "../adminCommands.service.js";
import { saveBotAction, isActionButton, runBotAction } from "../adminChat.service.js";
import { BOT_ACTIONS } from "../botActions.js";
import { safeEqual } from "../webhook.js";
import { logger } from "../../../lib/logger.js";

const WELCOME = "✅ به‌عنوان ادمین RealRate متصل شدید؛ درخواست‌های کاربران را از همین‌جا می‌بینید و با دکمه‌ها پاسخ می‌دهید.\nگزارش و مدیریت کاربران: /report ، /users ، /requests ، /help";

const isLinkedAdmin = (config, senderId) => Boolean(config.adminUserId) && String(senderId || "") === config.adminUserId;

/**
 * Tell the admin about something and let them answer with a button
 * @param {object} env
 * @param {{ text: string, action: { type: string } }} message - action: see botActions.js
 * @param {{ fetchFn?: Function }} [opts]
 * @returns {Promise<boolean>} whether it was sent (false when the bot is off or no admin is linked)
 */
export async function notifyRubikaAdmin(env, { text, action }, opts = {}) {
  const config = await getRubikaConfig(env);
  const store = getStateStore(env);
  if (!config.enabled || !config.token || !config.adminChatId || !store || !BOT_ACTIONS[action?.type]) return false;
  const id = await saveBotAction(store, action);
  const res = await sendMessage(config.token, config.adminChatId, text, {
    ...opts,
    keypad: toKeypad({ inline_keyboard: [[{ text: "✅ تأیید", callback_data: `a:${id}` }, { text: "❌ رد", callback_data: `r:${id}` }]] }),
  });
  if (!res.ok) logger.warn("[Rubika] telling the admin failed", { error: res.error });
  return res.ok;
}

/** The link code in a message: `/start 123456`, `/link 123456`, the code alone, or a start link's id */
function sentCode(message) {
  const start = String(message?.aux_data?.start_id || "").trim();
  if (/^\d{6}$/.test(start)) return start;
  const match = /^(?:\/(?:start|link)\s+)?(\d{6})$/i.exec(String(message?.text || "").trim());
  return match ? match[1] : "";
}

async function handleMessage(env, config, chatId, message, opts) {
  if (message?.sender_type && message.sender_type !== "User") return;
  const senderId = String(message?.sender_id || "");
  if (!chatId || !senderId) return;
  const send = (text, extra = {}) => sendMessage(config.token, chatId, text, { ...opts, ...extra });

  const code = sentCode(message);
  if (code && config.linkCode && config.linkCodeExpiresAt > Date.now() && safeEqual(code, config.linkCode)) {
    await linkRubikaAdmin(env, { chatId, userId: senderId });
    await send(WELCOME);
    return;
  }
  // Everything else only from the linked admin (their Rubika id)
  if (!isLinkedAdmin(config, senderId)) return;

  const forwarded = message.forwarded_from;
  if (forwarded?.type_from === "Channel" && forwarded.from_chat_id) {
    await setRubikaChannel(env, String(forwarded.from_chat_id));
    await send(`📣 کانال ربات روی این کانال تنظیم شد:\n${forwarded.from_chat_id}\nدر پنل مدیریت «تست اتصال» را بزنید.`);
    return;
  }
  const text = String(message.text || "").trim();
  if (/^\/start\b/i.test(text)) return void (await send(WELCOME));
  if (!text.startsWith("/")) return;
  const answer = await answerAdminCommand(env, text, { config, opts, notify: notifyRubikaAdmin });
  if (answer) await send(answer.text, { keypad: toKeypad(answer.replyMarkup) });
}

async function handleButton(env, config, inline, opts) {
  if (!isLinkedAdmin(config, inline?.sender_id)) return;
  const chatId = String(inline.chat_id || "");
  const messageId = inline.message_id;
  const data = String(inline.aux_data?.button_id || "");
  if (!chatId || !data) return;
  const by = `rubika:${config.adminUserId}`;

  if (isUserButton(data)) {
    let outcome;
    try {
      outcome = await runUserButton(env, data, by);
    } catch (err) {
      logger.error("[Rubika] the admin's user action failed", { error: err?.message });
      outcome = { answer: `⚠️ انجام نشد: ${String(err?.message || "خطا").slice(0, 120)}` };
    }
    if (outcome.text && (outcome.fresh || !messageId)) {
      await sendMessage(config.token, chatId, outcome.text, { ...opts, keypad: toKeypad(outcome.replyMarkup) });
    } else if (outcome.text) {
      await editMessageText(config.token, chatId, messageId, outcome.text, opts);
      await editMessageKeypad(config.token, chatId, messageId, toKeypad(outcome.replyMarkup), opts);
    } else if (outcome.answer) {
      await sendMessage(config.token, chatId, outcome.answer, opts);
    }
    return;
  }
  if (isActionButton(data)) {
    const note = await runBotAction(env, data, by);
    // The request's buttons go; the outcome is a reply (Rubika's press does not carry the message's text)
    if (messageId) await editMessageKeypad(config.token, chatId, messageId, null, opts);
    await sendMessage(config.token, chatId, note, opts);
  }
}

/**
 * One webhook body from Rubika: `{ update }` (a message) or `{ inline_message }` (a button press)
 * @param {object} env
 * @param {object} body
 * @param {{ fetchFn?: Function }} [opts]
 */
export async function handleRubikaUpdate(env, body, opts = {}) {
  const config = await getRubikaConfig(env);
  if (!config.enabled || !config.token) return;
  if (body?.inline_message) return handleButton(env, config, body.inline_message, opts);
  const update = body?.update;
  if (update?.type === "NewMessage" && update.new_message) {
    await handleMessage(env, config, String(update.chat_id || ""), update.new_message, opts);
  }
}
