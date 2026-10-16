/**
 * botConfig.service.js — The Telegram bot's settings and last-run status (admin panel → ربات تلگرام)
 *
 * Stored in `app_state` (`bot:config`, `bot:status`). The token is never given back out: the
 * admin sees only whether one is set and where it came from. A `TELEGRAM_BOT_TOKEN` secret wins
 * over a token saved from the panel.
 */

import { getStateStore } from "../../repositories/stateStore.repository.js";
import { isBotToken } from "./telegramApi.js";
import { AppError } from "../../lib/AppError.js";

const CONFIG_KEY = "bot:config";
const STATUS_KEY = "bot:status";

/**
 * A channel as the Bot API wants it: `@name` (from `@name`, `name` or a t.me link) or a numeric
 * chat id (`-100…`); "" when it is neither
 */
export function normalizeChannel(input) {
  const raw = String(input || "").trim();
  if (/^-?\d{5,20}$/.test(raw)) return raw;
  const name = raw.replace(/^(https?:\/\/)?(www\.)?t\.me\/(s\/)?/i, "").replace(/^@/, "").split(/[/?#]/)[0];
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name) ? `@${name}` : "";
}

/**
 * The saved settings with the token resolved
 * @returns {Promise<{ enabled: boolean, channel: string, feeds: string[]|null, adminUsername: string,
 *   adminChatId: string, adminUserId: string, token: string, tokenSource: "env"|"admin"|"" }>}
 *   feeds: the feed ids whose articles are posted; null means every feed. adminUsername: the
 *   admin's Telegram username; adminChatId / adminUserId: set when that user has sent /start to
 *   the bot (the bot can only write to someone who started it)
 */
export async function getBotConfig(env) {
  const saved = (await getStateStore(env)?.get(CONFIG_KEY, "json").catch(() => null)) || {};
  const envToken = String(env?.TELEGRAM_BOT_TOKEN || "").trim();
  const token = envToken || (typeof saved.token === "string" ? saved.token : "");
  return {
    enabled: saved.enabled === true,
    channel: typeof saved.channel === "string" ? saved.channel : "",
    feeds: Array.isArray(saved.feeds) ? saved.feeds.filter((id) => typeof id === "string") : null,
    adminUsername: typeof saved.adminUsername === "string" ? saved.adminUsername : "",
    adminChatId: saved.adminChatId ? String(saved.adminChatId) : "",
    adminUserId: saved.adminUserId ? String(saved.adminUserId) : "",
    token,
    tokenSource: envToken ? "env" : token ? "admin" : "",
  };
}

/** The settings as the admin may see them (no token) */
export function publicBotConfig({ token, adminChatId, adminUserId, ...rest }) {
  return { ...rest, tokenSet: Boolean(token), adminLinked: Boolean(adminChatId && adminUserId) };
}

/** A Telegram username as stored: no "@" or link, "" when it is not one */
export function normalizeUsername(input) {
  const name = String(input || "").trim().replace(/^(https?:\/\/)?(www\.)?t\.me\//i, "").replace(/^@/, "").split(/[/?#]/)[0];
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name) ? name : "";
}

/**
 * Save the admin's changes; only the fields sent change
 * @param {object} env
 * @param {{ enabled?: boolean, channel?: string, feeds?: string[]|null, token?: string|null, adminUsername?: string }} patch
 *   token: a new token, or null to remove the saved one. adminUsername: another username unlinks
 *   the previous admin (the new one links by sending /start to the bot)
 */
export async function saveBotConfig(env, patch = {}) {
  const store = getStateStore(env);
  if (!store) throw AppError.badRequest("پایگاه داده در دسترس نیست.");
  const saved = (await store.get(CONFIG_KEY, "json").catch(() => null)) || {};
  const next = {
    enabled: saved.enabled === true,
    channel: saved.channel || "",
    feeds: saved.feeds ?? null,
    token: saved.token || "",
    adminUsername: saved.adminUsername || "",
    adminChatId: saved.adminChatId || "",
    adminUserId: saved.adminUserId || "",
  };

  if (patch.enabled !== undefined) next.enabled = patch.enabled === true;
  if (patch.channel !== undefined) {
    const channel = String(patch.channel || "").trim() ? normalizeChannel(patch.channel) : "";
    if (patch.channel && !channel) throw AppError.badRequest("نام کانال معتبر نیست (مثل @mychannel).");
    next.channel = channel;
  }
  if (patch.feeds !== undefined) {
    next.feeds = Array.isArray(patch.feeds) ? [...new Set(patch.feeds.filter((id) => typeof id === "string"))] : null;
  }
  if (patch.adminUsername !== undefined) {
    const username = String(patch.adminUsername || "").trim() ? normalizeUsername(patch.adminUsername) : "";
    if (patch.adminUsername && !username) throw AppError.badRequest("یوزرنیم تلگرام معتبر نیست (مثل @myname).");
    if (username.toLowerCase() !== next.adminUsername.toLowerCase()) {
      next.adminChatId = "";
      next.adminUserId = "";
    }
    next.adminUsername = username;
  }
  if (patch.token === null) next.token = "";
  else if (typeof patch.token === "string" && patch.token.trim()) {
    if (!isBotToken(patch.token.trim())) throw AppError.badRequest("توکن ربات معتبر نیست (شکل 123456:ABC… از BotFather).");
    next.token = patch.token.trim();
  }
  if (next.enabled && (!next.channel || !(String(env?.TELEGRAM_BOT_TOKEN || "").trim() || next.token))) {
    throw AppError.badRequest("برای فعال کردن ربات، توکن و کانال را وارد کنید.");
  }
  await store.put(CONFIG_KEY, JSON.stringify(next));
  return getBotConfig(env);
}

/** Remember the admin's chat once they have sent /start to the bot (their username matched) */
export async function linkBotAdmin(env, { chatId, userId }) {
  const store = getStateStore(env);
  if (!store) return;
  const saved = (await store.get(CONFIG_KEY, "json").catch(() => null)) || {};
  await store.put(CONFIG_KEY, JSON.stringify({ ...saved, adminChatId: String(chatId), adminUserId: String(userId) }));
}

/** The last run's result (what was sent, the last error) */
export async function getBotStatus(env) {
  return (await getStateStore(env)?.get(STATUS_KEY, "json").catch(() => null)) || null;
}

/** Keep the status, merging the fields given */
export async function saveBotStatus(env, patch) {
  const store = getStateStore(env);
  if (!store) return;
  const current = (await store.get(STATUS_KEY, "json").catch(() => null)) || {};
  await store.put(STATUS_KEY, JSON.stringify({ ...current, ...patch }));
}
