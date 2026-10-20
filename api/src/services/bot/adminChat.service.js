/**
 * adminChat.service.js — Bot feature: talk to the admin in a private Telegram chat
 *
 * - The admin enters their Telegram username in the panel and sends /start to the bot once; the
 *   bot then knows their chat (a bot cannot write to someone who has not started it). Only that
 *   user — checked by their Telegram id, not the changeable username — can press the buttons, and
 *   a later /start from another account with that username does not take the link over.
 * - `notifyAdmin` sends the admin a message with ✅ / ❌ buttons for an action (botActions.js).
 *   The button carries only a short token; the action is kept in `app_state` for a week.
 * - The linked admin can also write commands (adminCommands.service.js): a report, users to find and
 *   manage. Their buttons (`u…:` data) are handled there; the ✅ / ❌ ones of an action here.
 * - `handleBotUpdate` is called by the webhook (botRoutes.js) with each update Telegram posts.
 */

import { getStateStore } from "../../repositories/stateStore.repository.js";
import { getBotConfig, linkBotAdmin } from "./botConfig.service.js";
import { sendMessage, editMessageText, answerCallbackQuery, setMyCommands } from "./telegramApi.js";
import { BOT_COMMANDS } from "../../config/telegramBot.config.js";
import { runAdminCommand, isUserButton, runUserButton } from "./adminCommands.service.js";
import { BOT_ACTIONS } from "./botActions.js";
import { logger } from "../../lib/logger.js";

const ACTION_TTL_SEC = 7 * 86400;
const actionKey = (id) => `bot:action:${id}`;

const randomId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

/**
 * Tell the admin about something and let them answer with a button
 * @param {object} env
 * @param {{ text: string, action: { type: string } }} message - action: see botActions.js
 * @param {{ fetchFn?: Function }} [opts]
 * @returns {Promise<boolean>} whether it was sent (false when the bot is off or the admin has not started it)
 */
export async function notifyAdmin(env, { text, action }, opts = {}) {
  const config = await getBotConfig(env);
  const store = getStateStore(env);
  if (!config.enabled || !config.token || !config.adminChatId || !store || !BOT_ACTIONS[action?.type]) return false;
  const id = randomId();
  await store.put(actionKey(id), JSON.stringify(action), { expirationTtl: ACTION_TTL_SEC });
  const res = await sendMessage(config.token, config.adminChatId, text, {
    ...opts,
    plain: true,
    replyMarkup: { inline_keyboard: [[{ text: "✅ تأیید", callback_data: `a:${id}` }, { text: "❌ رد", callback_data: `r:${id}` }]] },
  });
  if (!res.ok) logger.warn("[Bot] telling the admin failed", { error: res.error });
  return res.ok;
}

/** The Telegram username matches the one the admin entered (case does not matter) */
const sameUsername = (a, b) => Boolean(a) && Boolean(b) && String(a).toLowerCase() === String(b).toLowerCase();

async function handleMessage(env, config, message, opts) {
  if (message?.chat?.type !== "private") return;
  const text = String(message.text || "");
  if (/^\/start(\s|@|$)/.test(text)) {
    if (!sameUsername(message.from?.username, config.adminUsername)) return;
    // Once linked, the admin is their Telegram id: whoever takes the username over later (after
    // the admin renames) cannot link in their place. Linking another account: save the username
    // again as empty, then as the new one (saveBotConfig unlinks on a change)
    if (config.adminUserId && String(message.from?.id) !== config.adminUserId) return;
    await linkBotAdmin(env, { chatId: message.chat.id, userId: message.from.id });
    await setMyCommands(config.token, message.chat.id, BOT_COMMANDS, opts);
    await sendMessage(config.token, message.chat.id, "✅ به‌عنوان ادمین RealRate متصل شدید؛ درخواست‌های کاربران را از همین‌جا می‌بینید و با دکمه‌ها پاسخ می‌دهید.\nگزارش و مدیریت کاربران: /report ، /users ، /requests ، /help", { ...opts, plain: true });
    return;
  }
  // Commands: only from the linked admin (their Telegram id, not the changeable username)
  if (text.startsWith("/") && config.adminUserId && String(message.from?.id) === config.adminUserId) {
    await runAdminCommand(env, config, message, opts);
  }
}

async function handleCallback(env, config, query, opts) {
  // Only the linked admin may press (their Telegram id, set when they started the bot)
  if (!config.adminUserId || String(query.from?.id) !== config.adminUserId) {
    await answerCallbackQuery(config.token, query.id, "دسترسی ندارید.", opts);
    return;
  }
  if (isUserButton(query.data)) {
    let outcome;
    try {
      outcome = await runUserButton(env, query.data, `telegram:${config.adminUsername}`);
    } catch (err) {
      logger.error("[Bot] the admin's user action failed", { error: err?.message });
      outcome = { answer: `⚠️ انجام نشد: ${String(err?.message || "خطا").slice(0, 120)}` };
    }
    await answerCallbackQuery(config.token, query.id, outcome.answer, opts);
    if (outcome.text && outcome.fresh && query.message) {
      await sendMessage(config.token, query.message.chat.id, outcome.text, { ...opts, plain: true, replyMarkup: outcome.replyMarkup });
    } else if (outcome.text && query.message) {
      await editMessageText(config.token, query.message.chat.id, query.message.message_id, outcome.text, { ...opts, replyMarkup: outcome.replyMarkup });
    }
    return;
  }
  const [verb, id] = String(query.data || "").split(":");
  const store = getStateStore(env);
  const action = verb === "a" || verb === "r" ? await store?.get(actionKey(id), "json") : null;
  const handler = BOT_ACTIONS[action?.type];
  const done = (text) => Promise.all([
    answerCallbackQuery(config.token, query.id, text, opts),
    query.message ? editMessageText(config.token, query.message.chat.id, query.message.message_id, `${query.message.text || ""}\n\n${text}`, opts) : null,
  ]);
  if (!handler) return void (await done("این درخواست منقضی شده است."));
  // Taken first, so a double press answers once
  await store.delete(actionKey(id));
  let result;
  try {
    result = await handler[verb === "a" ? "approve" : "reject"](env, action, `telegram:${config.adminUsername}`);
  } catch (err) {
    logger.error("[Bot] the admin's action failed", { type: action.type, error: err?.message });
    result = { text: `⚠️ انجام نشد: ${String(err?.message || "خطا").slice(0, 120)}` };
  }
  await done(result.text);
}

/**
 * One update from Telegram
 * @param {object} env
 * @param {object} update - Telegram's Update object
 * @param {{ fetchFn?: Function }} [opts]
 */
export async function handleBotUpdate(env, update, opts = {}) {
  const config = await getBotConfig(env);
  if (!config.enabled || !config.token) return;
  if (update?.message) await handleMessage(env, config, update.message, opts);
  else if (update?.callback_query) await handleCallback(env, config, update.callback_query, opts);
}
