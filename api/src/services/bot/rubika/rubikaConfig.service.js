/**
 * rubikaConfig.service.js — The Rubika bot's settings and last-run status (admin panel → ربات روبیکا)
 *
 * Stored in `app_state` (`rubika:config`, `rubika:status`), like Telegram's (botConfig.service.js).
 * The token is never given back out: the admin sees only whether one is set and where it came
 * from. A `RUBIKA_BOT_TOKEN` secret wins over a token saved from the panel.
 *
 * The admin links their Rubika account with a one-time code: the panel makes one
 * (`newRubikaLinkCode`), the admin sends it to the bot, and the bot keeps that chat and sender
 * (`linkRubikaAdmin`). Rubika's updates carry no username, so a code is what proves the account.
 */

import { getStateStore } from "../../../repositories/stateStore.repository.js";
import { AppError } from "../../../lib/AppError.js";
import { RUBIKA_LIMITS } from "../../../config/rubikaBot.config.js";
import { isRubikaToken } from "./rubikaApi.js";

const CONFIG_KEY = "rubika:config";
const STATUS_KEY = "rubika:status";

/**
 * A channel as the Bot API wants it: its id (`c0…`; a group's `g0…`), or `@name` (from `@name`,
 * `name` or a rubika.ir link); "" when it is neither
 */
export function normalizeRubikaChannel(input) {
  const raw = String(input || "").trim();
  if (/^[cg]0[A-Za-z0-9]{10,60}$/.test(raw)) return raw;
  const name = raw.replace(/^(https?:\/\/)?(www\.)?rubika\.ir\//i, "").replace(/^@/, "").split(/[/?#]/)[0];
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name) ? `@${name}` : "";
}

const readSaved = async (store) => (await store?.get(CONFIG_KEY, "json").catch(() => null)) || {};

/**
 * The saved settings with the token resolved
 * @returns {Promise<{ enabled: boolean, channel: string, feeds: string[]|null, adminChatId: string,
 *   adminUserId: string, dailyReport: boolean, linkCode: string, linkCodeExpiresAt: number,
 *   token: string, tokenSource: "env"|"admin"|"" }>}
 *   feeds: the feed ids whose articles are posted; null means every feed. adminChatId /
 *   adminUserId: the admin's chat with the bot and their Rubika id, set once they sent the code
 */
export async function getRubikaConfig(env) {
  const saved = await readSaved(getStateStore(env));
  const envToken = String(env?.RUBIKA_BOT_TOKEN || "").trim();
  const token = envToken || (typeof saved.token === "string" ? saved.token : "");
  return {
    enabled: saved.enabled === true,
    channel: typeof saved.channel === "string" ? saved.channel : "",
    feeds: Array.isArray(saved.feeds) ? saved.feeds.filter((id) => typeof id === "string") : null,
    adminChatId: saved.adminChatId ? String(saved.adminChatId) : "",
    adminUserId: saved.adminUserId ? String(saved.adminUserId) : "",
    dailyReport: saved.dailyReport === true,
    linkCode: typeof saved.linkCode === "string" ? saved.linkCode : "",
    linkCodeExpiresAt: Number(saved.linkCodeExpiresAt) || 0,
    token,
    tokenSource: envToken ? "env" : token ? "admin" : "",
  };
}

/**
 * The settings as the admin may see them (no token, no chat ids); the link code only while it is valid
 * @param {object} config - getRubikaConfig's
 * @param {number} [now]
 */
export function publicRubikaConfig({ token, adminChatId, adminUserId, linkCode, linkCodeExpiresAt, ...rest }, now = Date.now()) {
  const live = Boolean(linkCode) && linkCodeExpiresAt > now;
  return {
    ...rest,
    tokenSet: Boolean(token),
    adminLinked: Boolean(adminChatId && adminUserId),
    linkCode: live ? linkCode : "",
    linkCodeExpiresAt: live ? linkCodeExpiresAt : 0,
  };
}

/**
 * Save the admin's changes; only the fields sent change
 * @param {object} env
 * @param {{ enabled?: boolean, channel?: string, feeds?: string[]|null, token?: string|null, dailyReport?: boolean, unlinkAdmin?: boolean }} patch
 *   token: a new token, or null to remove the saved one. unlinkAdmin: forget the linked account
 */
export async function saveRubikaConfig(env, patch = {}) {
  const store = getStateStore(env);
  if (!store) throw AppError.badRequest("پایگاه داده در دسترس نیست.");
  const saved = await readSaved(store);
  const next = {
    enabled: saved.enabled === true,
    channel: saved.channel || "",
    feeds: saved.feeds ?? null,
    token: saved.token || "",
    adminChatId: saved.adminChatId || "",
    adminUserId: saved.adminUserId || "",
    dailyReport: saved.dailyReport === true,
    linkCode: saved.linkCode || "",
    linkCodeExpiresAt: Number(saved.linkCodeExpiresAt) || 0,
    linkCodeMisses: Number(saved.linkCodeMisses) || 0,
  };

  if (patch.enabled !== undefined) next.enabled = patch.enabled === true;
  if (patch.channel !== undefined) {
    const channel = String(patch.channel || "").trim() ? normalizeRubikaChannel(patch.channel) : "";
    if (patch.channel && !channel) throw AppError.badRequest("شناسه‌ی کانال معتبر نیست (مثل @mychannel یا شناسه‌ای که با c0 شروع می‌شود).");
    next.channel = channel;
  }
  if (patch.dailyReport !== undefined) next.dailyReport = patch.dailyReport === true;
  if (patch.feeds !== undefined) {
    next.feeds = Array.isArray(patch.feeds) ? [...new Set(patch.feeds.filter((id) => typeof id === "string"))] : null;
  }
  if (patch.unlinkAdmin === true) {
    next.adminChatId = "";
    next.adminUserId = "";
  }
  if (patch.token === null) next.token = "";
  else if (typeof patch.token === "string" && patch.token.trim()) {
    if (!isRubikaToken(patch.token.trim())) throw AppError.badRequest("توکن ربات روبیکا معتبر نیست (همان توکنی که BotFather روبیکا داده است).");
    next.token = patch.token.trim();
  }
  if (next.enabled && (!next.channel || !(String(env?.RUBIKA_BOT_TOKEN || "").trim() || next.token))) {
    throw AppError.badRequest("برای فعال کردن ربات روبیکا، توکن و کانال را وارد کنید.");
  }
  await store.put(CONFIG_KEY, JSON.stringify(next));
  return getRubikaConfig(env);
}

/**
 * A fresh code for linking the admin's account (the previous one stops working)
 * @returns {Promise<{ code: string, expiresAt: number }>}
 */
export async function newRubikaLinkCode(env, now = Date.now()) {
  const store = getStateStore(env);
  if (!store) throw AppError.badRequest("پایگاه داده در دسترس نیست.");
  const digits = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  const code = String(digits).padStart(6, "0");
  const expiresAt = now + RUBIKA_LIMITS.linkCodeMinutes * 60_000;
  await store.put(CONFIG_KEY, JSON.stringify({ ...(await readSaved(store)), linkCode: code, linkCodeExpiresAt: expiresAt, linkCodeMisses: 0 }));
  return { code, expiresAt };
}

/**
 * Count a wrong code sent while one is valid; past RUBIKA_LIMITS.linkCodeTries the code is void
 * (a million codes cannot be tried one by one, and the admin just makes a new one)
 * @returns {Promise<boolean>} whether the code was voided
 */
export async function recordRubikaLinkMiss(env) {
  const store = getStateStore(env);
  if (!store) return false;
  const saved = await readSaved(store);
  if (!saved.linkCode) return false;
  const misses = (Number(saved.linkCodeMisses) || 0) + 1;
  const voided = misses >= RUBIKA_LIMITS.linkCodeTries;
  await store.put(CONFIG_KEY, JSON.stringify({ ...saved, ...(voided ? { linkCode: "", linkCodeExpiresAt: 0, linkCodeMisses: 0 } : { linkCodeMisses: misses }) }));
  return voided;
}

/** Remember the admin's chat once they have sent the code; the code is used up */
export async function linkRubikaAdmin(env, { chatId, userId }) {
  const store = getStateStore(env);
  if (!store) return;
  const saved = await readSaved(store);
  await store.put(CONFIG_KEY, JSON.stringify({ ...saved, adminChatId: String(chatId), adminUserId: String(userId), linkCode: "", linkCodeExpiresAt: 0, linkCodeMisses: 0 }));
}

/**
 * Set the channel (the admin forwarded one of its posts to the bot)
 * @returns {Promise<string>} the channel as saved, "" when the id is not one
 */
export async function setRubikaChannel(env, channel) {
  const store = getStateStore(env);
  const normalized = normalizeRubikaChannel(channel);
  if (!store || !normalized) return "";
  await store.put(CONFIG_KEY, JSON.stringify({ ...(await readSaved(store)), channel: normalized }));
  return normalized;
}

/** The last run's result (what was sent, the last error) */
export async function getRubikaStatus(env) {
  return (await getStateStore(env)?.get(STATUS_KEY, "json").catch(() => null)) || null;
}

/** Keep the status, merging the fields given */
export async function saveRubikaStatus(env, patch) {
  const store = getStateStore(env);
  if (!store) return;
  const current = (await store.get(STATUS_KEY, "json").catch(() => null)) || {};
  await store.put(STATUS_KEY, JSON.stringify({ ...current, ...patch }));
}
