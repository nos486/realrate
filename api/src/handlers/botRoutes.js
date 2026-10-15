/**
 * botRoutes.js — Admin API of the Telegram bot (admin panel → ربات تلگرام)
 *
 *   GET  /api/admin/bot       settings (never the token), last status, the feeds to choose from
 *   PUT  /api/admin/bot       save { enabled?, channel?, feeds?, token? }
 *   POST /api/admin/bot/test  check the token and the channel, and post a test message
 *   POST /api/admin/bot/run   post the waiting news now
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import { jsonResponse } from "../lib/helpers.js";
import { AppError } from "../lib/AppError.js";
import { getNewsFeeds } from "../services/news/news.service.js";
import { getBotConfig, publicBotConfig, saveBotConfig, getBotStatus } from "../services/bot/botConfig.service.js";
import { runBot } from "../services/bot/bot.service.js";
import { getMe, getChat, sendMessage } from "../services/bot/telegramApi.js";

async function requireAdmin(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") throw AppError.forbidden("دسترسی غیرمجاز. فقط مدیر سیستم مجاز است.");
}

async function overview(env) {
  const [config, status, feeds] = await Promise.all([getBotConfig(env), getBotStatus(env), getNewsFeeds(env)]);
  return {
    config: publicBotConfig(config),
    status,
    feeds: feeds.map(({ id, title, enabled }) => ({ id, title, enabled })),
  };
}

export async function handleAdminGetBot(request, env) {
  await requireAdmin(request, env);
  return jsonResponse({ success: true, ...(await overview(env)) }, 200, request);
}

export async function handleAdminSaveBot(request, env) {
  await requireAdmin(request, env);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") throw AppError.badRequest("درخواست نامعتبر است.");
  await saveBotConfig(env, {
    enabled: body.enabled,
    channel: body.channel,
    feeds: body.feeds,
    token: body.token,
  });
  return jsonResponse({ success: true, ...(await overview(env)) }, 200, request);
}

/**
 * Check the saved token and channel step by step: who the bot is, whether the channel exists and
 * is a channel (a bot's own @username is a common slip), then a test message
 */
export async function handleAdminTestBot(request, env, { fetchFn } = {}) {
  await requireAdmin(request, env);
  const { token, channel } = await getBotConfig(env);
  const opts = { fetchFn };
  if (!token) return jsonResponse({ success: true, ok: false, step: "token", error: "توکن ربات وارد نشده است." }, 200, request);
  const me = await getMe(token, opts);
  if (!me.ok) return jsonResponse({ success: true, ok: false, step: "token", error: `توکن پذیرفته نشد: ${me.error}` }, 200, request);
  const bot = { username: me.result?.username || "", name: me.result?.first_name || "" };
  if (!channel) return jsonResponse({ success: true, ok: false, step: "channel", bot, error: "کانال وارد نشده است." }, 200, request);
  const chat = await getChat(token, channel, opts);
  if (!chat.ok) {
    return jsonResponse({ success: true, ok: false, step: "channel", bot, error: `کانال پیدا نشد: ${chat.error}. ربات باید در کانال ادمین باشد.` }, 200, request);
  }
  const type = chat.result?.type;
  if (type !== "channel" && type !== "supergroup" && type !== "group") {
    return jsonResponse({
      success: true, ok: false, step: "channel", bot,
      error: "این نام کانال نیست (احتمالاً نام خود ربات یا یک کاربر است). نام کانالی که ربات در آن ادمین است را وارد کنید.",
    }, 200, request);
  }
  const sent = await sendMessage(token, channel, "✅ RealRate bot connected", opts);
  if (!sent.ok) {
    return jsonResponse({ success: true, ok: false, step: "send", bot, error: `ارسال ناموفق بود: ${sent.error}. ربات باید اجازه‌ی ارسال پیام در کانال را داشته باشد.` }, 200, request);
  }
  return jsonResponse({ success: true, ok: true, bot, chat: { title: chat.result?.title || "", type } }, 200, request);
}

export async function handleAdminRunBot(request, env, { fetchFn } = {}) {
  await requireAdmin(request, env);
  const result = await runBot(env, { fetchFn });
  return jsonResponse({ success: true, result, ...(await overview(env)) }, 200, request);
}
