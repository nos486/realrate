/**
 * rubikaRoutes.js — Admin API of the Rubika bot (admin panel → ربات روبیکا)
 *
 *   GET  /api/admin/rubika       settings (never the token), last status, the feeds to choose from
 *   PUT  /api/admin/rubika       save { enabled?, channel?, feeds?, token?, dailyReport?, unlinkAdmin? }
 *   POST /api/admin/rubika/test  check the token and the channel, and post a test message
 *   POST /api/admin/rubika/run   post the waiting news now
 *   POST /api/admin/rubika/link  a one-time code the admin sends to the bot to link their account
 *   POST /api/bot/rubika/webhook/<secret>[/receiveUpdate|/receiveInlineMessage]  Rubika's updates;
 *        not a session route: the secret in the path proves the request (rubikaBot.service.js)
 */

import { jsonResponse } from "../lib/helpers.js";
import { AppError } from "../lib/AppError.js";
import { logger } from "../lib/logger.js";
import { requireAdmin } from "./botRoutes.js";
import { getNewsFeeds } from "../services/news/news.service.js";
import { safeEqual } from "../services/bot/webhook.js";
import { getRubikaConfig, publicRubikaConfig, saveRubikaConfig, getRubikaStatus, newRubikaLinkCode } from "../services/bot/rubika/rubikaConfig.service.js";
import { runRubikaBot, syncRubikaWebhook, rubikaWebhookSecret } from "../services/bot/rubika/rubikaBot.service.js";
import { handleRubikaUpdate } from "../services/bot/rubika/rubikaChat.service.js";
import { getMe, getChat, sendMessage } from "../services/bot/rubika/rubikaApi.js";

/** The webhook's path: its secret and, optionally, the endpoint Rubika appends */
export const RUBIKA_WEBHOOK_ROUTE = /^\/api\/bot\/rubika\/webhook\/([a-f0-9]{64})(?:\/(receiveUpdate|receiveInlineMessage))?$/;

async function overview(env) {
  const [config, status, feeds] = await Promise.all([getRubikaConfig(env), getRubikaStatus(env), getNewsFeeds(env)]);
  return {
    config: publicRubikaConfig(config),
    status,
    feeds: feeds.map(({ id, title, enabled }) => ({ id, title, enabled })),
  };
}

export async function handleAdminGetRubika(request, env) {
  await requireAdmin(request, env);
  return jsonResponse({ success: true, ...(await overview(env)) }, 200, request);
}

export async function handleAdminSaveRubika(request, env, { fetchFn } = {}) {
  await requireAdmin(request, env);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") throw AppError.badRequest("درخواست نامعتبر است.");
  const config = await saveRubikaConfig(env, {
    enabled: body.enabled,
    channel: body.channel,
    feeds: body.feeds,
    token: body.token,
    dailyReport: body.dailyReport,
    unlinkAdmin: body.unlinkAdmin === true,
  });
  // Rubika posts the admin's messages and button presses to the webhook while the bot is on
  const webhook = await syncRubikaWebhook(config, { fetchFn });
  return jsonResponse({ success: true, webhook: webhook && { ok: webhook.ok, error: webhook.error || "" }, ...(await overview(env)) }, 200, request);
}

/** Check the saved token and channel step by step: who the bot is, whether the channel is a channel, then a test message */
export async function handleAdminTestRubika(request, env, { fetchFn } = {}) {
  await requireAdmin(request, env);
  const { token, channel } = await getRubikaConfig(env);
  const opts = { fetchFn };
  const answer = (fields) => jsonResponse({ success: true, ...fields }, 200, request);
  if (!token) return answer({ ok: false, step: "token", error: "توکن ربات وارد نشده است." });
  const me = await getMe(token, opts);
  if (!me.ok) return answer({ ok: false, step: "token", error: `توکن پذیرفته نشد: ${me.error}` });
  const bot = { username: me.result?.bot?.username || "", name: me.result?.bot?.bot_title || "" };
  if (!channel) return answer({ ok: false, step: "channel", bot, error: "کانال وارد نشده است." });
  const chat = await getChat(token, channel, opts);
  if (!chat.ok) {
    return answer({
      ok: false, step: "channel", bot,
      error: `کانال پیدا نشد: ${chat.error}. ربات باید در کانال ادمین باشد؛ اگر با @نام پیدا نمی‌شود، یک پست کانال را برای ربات فوروارد کنید تا شناسه‌ی کانال ذخیره شود.`,
    });
  }
  const type = chat.result?.chat?.chat_type;
  if (type !== "Channel" && type !== "Group") {
    return answer({ ok: false, step: "channel", bot, error: "این شناسه‌ی کانال نیست (احتمالاً خود ربات یا یک کاربر است). شناسه‌ی کانالی را وارد کنید که ربات در آن ادمین است." });
  }
  const sent = await sendMessage(token, channel, "✅ RealRate bot connected", opts);
  if (!sent.ok) {
    return answer({ ok: false, step: "send", bot, error: `ارسال ناموفق بود: ${sent.error}. ربات باید اجازه‌ی ارسال پیام در کانال را داشته باشد.` });
  }
  return answer({ ok: true, bot, chat: { title: chat.result?.chat?.title || "", type } });
}

export async function handleAdminRunRubika(request, env, { fetchFn } = {}) {
  await requireAdmin(request, env);
  const result = await runRubikaBot(env, { fetchFn });
  return jsonResponse({ success: true, result, ...(await overview(env)) }, 200, request);
}

export async function handleAdminRubikaLinkCode(request, env) {
  await requireAdmin(request, env);
  const { code, expiresAt } = await newRubikaLinkCode(env);
  return jsonResponse({ success: true, code, expiresAt, ...(await overview(env)) }, 200, request);
}

/**
 * Rubika's updates. Always answers 200 for a genuine request, so Rubika never retries a bad update
 * @param {Request} request
 * @param {object} env
 * @param {{ secret: string, fetchFn?: Function }} params - secret: from the path
 */
export async function handleRubikaWebhook(request, env, { secret, fetchFn } = {}) {
  const { token } = await getRubikaConfig(env);
  if (!token || !safeEqual(secret || "", await rubikaWebhookSecret(token))) throw AppError.forbidden("دسترسی غیرمجاز.");
  const body = await request.json().catch(() => null);
  if (body) await handleRubikaUpdate(env, body, { fetchFn }).catch((err) => logger.error("[Rubika] update failed", { error: err?.message }));
  return jsonResponse({ status: "OK" }, 200, request);
}
