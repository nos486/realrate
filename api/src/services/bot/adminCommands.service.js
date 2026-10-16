/**
 * adminCommands.service.js — The admin's commands in the bot's private chat: a report on the users
 * and their growth, finding a user, and managing one (block, sign out, groups) with buttons
 *
 * Commands are a table (`ADMIN_COMMANDS`): one more command is one more entry. Every answer is
 * plain text (user names and emails need no escaping). Only the linked admin reaches this (the
 * check is in adminChat.service.js). Only counts and account facts are read, never a user's records.
 * Button data: `ub:<userId>` block, `uu:<userId>` unblock, `us:<userId>` sign out everywhere,
 * `ug:<groupKey>:<userId>` toggle a group, `uv:<userId>` open the user's card.
 */

import { USER_FILTERS, dbGetUsersPage, dbGetUserStats, dbGetDailyGrowth, dbGetUserDetail, dbSetUserDisabled } from "../../repositories/admin.repository.js";
import { dbDeleteUserSessions } from "../../repositories/account.repository.js";
import { dbListGroups, dbGetUserGroupKeys, dbListGroupRequests, dbAddGroupMember, dbRemoveGroupMember } from "../../repositories/userGroups.repository.js";
import { isUserAdmin } from "../../lib/auth.js";
import { USERS_LIST_SIZE } from "../../config/telegramBot.config.js";
import { sendMessage } from "./telegramApi.js";
import { getBotStatus } from "./botConfig.service.js";
import { notifyAdmin } from "./adminChat.service.js";

const DAY_MS = 86_400_000;
const faNum = (n) => Number(n || 0).toLocaleString("fa-IR");

/** The quick filters /users understands, with their Persian names */
const FILTER_NAMES = {
  new: "جدید (۷ روز)",
  inactive: "غیرفعال (۳۰ روز)",
  unverified: "ایمیل تأییدنشده",
  blocked: "مسدود",
  app: "کاربر اپ اندروید",
  e2ee: "رمزنگاری سراسری",
};

const userLabel = (u) => u.customName || u.name || u.email;

/** "امروز" / "۳ روز پیش" / "—" for an ISO date */
function ago(iso, now) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "—";
  const days = Math.floor((now - t) / DAY_MS);
  return days <= 0 ? "امروز" : `${faNum(days)} روز پیش`;
}

/** The report: headline counts, the last 7 days, pending requests and the channel's state */
export async function buildReport(env, now = Date.now()) {
  const [stats, series, requests, status] = await Promise.all([
    dbGetUserStats(env, { now }),
    dbGetDailyGrowth(env, 7, { now }),
    dbListGroupRequests(env),
    getBotStatus(env),
  ]);
  const f = stats.filters;
  const week = series.reduce((sum, d) => ({ signups: sum.signups + d.signups, active: Math.max(sum.active, d.active) }), { signups: 0, active: 0 });
  const lines = [
    "📊 گزارش RealRate",
    "",
    `👥 کاربران: ${faNum(stats.registeredUsers)}`,
    `🟢 فعال امروز: ${faNum(stats.activeToday)} · اپ اندروید امروز: ${faNum(stats.appActiveToday)}`,
    `🆕 ثبت‌نام ۷ روز اخیر: ${faNum(f.new)} · غیرفعال ۳۰ روز: ${faNum(f.inactive)}`,
    `⚠️ ایمیل تأییدنشده: ${faNum(f.unverified)} · مسدود: ${faNum(f.blocked)}`,
    `📱 کاربر اپ (۳۰ روز): ${faNum(stats.appActive30)} · رمزنگاری سراسری: ${faNum(f.e2ee)}`,
    `🌐 پرتفوی عمومی: ${faNum(stats.publicPortfolios)}`,
    "",
    `📈 ۷ روز اخیر (ثبت‌نام / فعال):`,
    ...series.map((d) => `${d.day.slice(5)}  ${faNum(d.signups)} / ${faNum(d.active)}`),
    `مجموع ثبت‌نام: ${faNum(week.signups)} · بیشترین فعال در روز: ${faNum(week.active)}`,
    "",
    `📬 درخواست در انتظار: ${faNum(requests.length)}${requests.length ? " (/requests)" : ""}`,
    `📣 کانال: ${faNum(status?.sentTotal)} خبر فرستاده شده · ${faNum(status?.waiting)} در صف${status?.error ? ` · خطا: ${status.error}` : ""}`,
  ];
  return lines.join("\n");
}

/** One user's card and the buttons that manage them */
export async function buildUserCard(env, userId, now = Date.now()) {
  const detail = await dbGetUserDetail(env, userId, { now });
  if (!detail) return null;
  const [groups, memberOf] = await Promise.all([dbListGroups(env), dbGetUserGroupKeys(env, userId)]);
  const admin = isUserAdmin(detail.email, env);
  const lines = [
    `👤 ${userLabel(detail)}${admin ? " (مدیر)" : ""}`,
    `✉️ ${detail.email}`,
    `وضعیت: ${detail.disabled ? "🚫 مسدود" : "✅ فعال"} · ایمیل ${detail.emailVerified ? "تأییدشده" : "تأییدنشده"}`,
    `عضویت: ${ago(detail.createdAt, now)} · آخرین ورود: ${ago(detail.lastLogin, now)}`,
    `ورود: ${faNum(detail.loginCount)} بار · روزهای فعال (۳۰ روز): ${faNum(detail.activeDays30)}`,
    `نشست فعال: ${faNum(detail.activeSessions)} · رمزنگاری سراسری: ${detail.vaultEnabled ? "فعال" : "خاموش"}`,
    `اپ اندروید: ${detail.usesApp ? detail.appVersion || "بله" : "ندارد"}`,
    `گروه‌ها: ${memberOf.length ? memberOf.join("، ") : "—"}`,
    `شناسه: ${detail.id}`,
  ];
  const rows = [];
  if (!admin) {
    rows.push([detail.disabled
      ? { text: "✅ رفع مسدودی", callback_data: `uu:${detail.id}` }
      : { text: "🚫 مسدود کردن", callback_data: `ub:${detail.id}` }]);
  }
  rows.push([{ text: "🚪 خروج از همه‌ی دستگاه‌ها", callback_data: `us:${detail.id}` }]);
  for (const g of groups) {
    const data = `ug:${g.key}:${detail.id}`;
    // Telegram allows 64 bytes of button data
    if (new TextEncoder().encode(data).length > 64) continue;
    rows.push([{ text: `${memberOf.includes(g.key) ? "➖ خروج از" : "➕ افزودن به"} «${g.name}»`, callback_data: data }]);
  }
  return { text: lines.join("\n"), replyMarkup: { inline_keyboard: rows } };
}

/** A list of users, each with a button that opens their card */
async function usersList(env, { q = "", filter = "all" } = {}) {
  const { users, total } = await dbGetUsersPage(env, { q, filter, limit: USERS_LIST_SIZE, sort: "createdAt", dir: "desc" });
  if (!users.length) return { text: "کاربری پیدا نشد." };
  const title = [q && `«${q}»`, FILTER_NAMES[filter]].filter(Boolean).join(" · ") || "تازه‌ترین کاربران";
  return {
    text: `👥 ${title}: ${faNum(total)} کاربر${total > users.length ? ` (${faNum(users.length)} تا نشان داده شد؛ جست‌وجو را دقیق‌تر کنید)` : ""}`,
    replyMarkup: { inline_keyboard: users.map((u) => [{ text: `${u.disabled ? "🚫 " : ""}${userLabel(u)} · ${u.email}`.slice(0, 60), callback_data: `uv:${u.id}` }]) },
  };
}

/** The pending group requests, each with approve / reject buttons (the same actions as a live request) */
async function pendingRequests(env, config, opts) {
  const [requests, groups] = await Promise.all([dbListGroupRequests(env), dbListGroups(env)]);
  if (!requests.length) return { text: "درخواستی در انتظار نیست. ✅" };
  const byId = new Map(groups.map((g) => [g.id, g]));
  for (const r of requests.slice(0, 10)) {
    const group = byId.get(r.groupId);
    if (!group) continue;
    await notifyAdmin(env, {
      text: `📬 ${r.email}${r.name ? ` (${r.name})` : ""} می‌خواهد عضو «${group.name}» شود.${r.note ? `\nپیام: ${r.note}` : ""}`,
      action: { type: "group-request", groupId: group.id, userId: r.userId },
    }, opts);
  }
  return { text: `${faNum(requests.length)} درخواست در انتظار است${requests.length > 10 ? " (۱۰ تای اول فرستاده شد)" : ""}.` };
}

const HELP = [
  "دستورهای مدیر:",
  "/report — گزارش کاربران، رشد و کانال",
  "/users — تازه‌ترین کاربران؛ /users متن برای جست‌وجو",
  `/users ${Object.keys(FILTER_NAMES).join("|")} — فیلتر سریع`,
  "/user ایمیل یا شناسه — کارت کاربر با دکمه‌های مسدود کردن، خروج از دستگاه‌ها و گروه‌ها",
  "/requests — درخواست‌های در انتظار (پرو و…) با دکمه‌ی تأیید و رد",
].join("\n");

/** Command name → handler `(env, args, ctx) → { text, replyMarkup? }` */
export const ADMIN_COMMANDS = {
  help: async () => ({ text: HELP }),
  report: async (env) => ({ text: await buildReport(env) }),
  stats: async (env) => ({ text: await buildReport(env) }),
  users: async (env, args) => {
    const word = args.trim().toLowerCase();
    return Object.hasOwn(FILTER_NAMES, word) && USER_FILTERS[word] ? usersList(env, { filter: word }) : usersList(env, { q: args.trim() });
  },
  user: async (env, args) => {
    const q = args.trim();
    if (!q) return { text: "ایمیل یا شناسه‌ی کاربر را بعد از دستور بنویسید: /user name@example.com" };
    const { users } = await dbGetUsersPage(env, { q, limit: 2 });
    if (!users.length) return { text: "کاربری پیدا نشد." };
    // One match (or an exact email) opens the card; several show the list to choose from
    const exact = users.find((u) => u.email.toLowerCase() === q.toLowerCase() || u.id === q);
    if (exact || users.length === 1) return (await buildUserCard(env, (exact || users[0]).id)) || { text: "کاربری پیدا نشد." };
    return usersList(env, { q });
  },
  requests: (env, _args, ctx) => pendingRequests(env, ctx.config, ctx.opts),
};

/**
 * Run the command of a message from the admin
 * @param {object} env
 * @param {{ token: string }} config
 * @param {{ chat: { id: number|string }, text: string }} message
 * @param {{ fetchFn?: Function }} [opts]
 * @returns {Promise<boolean>} whether the text was a known command
 */
export async function runAdminCommand(env, config, message, opts = {}) {
  const match = /^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(String(message.text || "").trim());
  const handler = match && ADMIN_COMMANDS[match[1].toLowerCase()];
  if (!handler) return false;
  let answer;
  try {
    answer = await handler(env, match[2] || "", { config, opts });
  } catch (err) {
    answer = { text: `⚠️ انجام نشد: ${String(err?.message || "خطا").slice(0, 120)}` };
  }
  await sendMessage(config.token, message.chat.id, answer.text, { ...opts, plain: true, replyMarkup: answer.replyMarkup });
  return true;
}

/** Block / sign out / group buttons: `{ verb, rest }` → the new card or a note */
const USER_ACTIONS = {
  async uv(env, [userId]) {
    return userId;
  },
  async ub(env, [userId]) {
    const account = await dbGetUserDetail(env, userId);
    if (!account) return null;
    if (isUserAdmin(account.email, env)) return { note: "حساب مدیر را نمی‌توان مسدود کرد." };
    await dbSetUserDisabled(env, userId, true);
    await dbDeleteUserSessions(env, userId);
    return { userId, note: "🚫 مسدود شد و از همه‌ی دستگاه‌ها خارج شد." };
  },
  async uu(env, [userId]) {
    await dbSetUserDisabled(env, userId, false);
    return { userId, note: "✅ دوباره فعال شد." };
  },
  async us(env, [userId]) {
    const ended = await dbDeleteUserSessions(env, userId);
    return { userId, note: ended ? `🚪 از ${faNum(ended)} نشست خارج شد.` : "نشست فعالی نداشت." };
  },
  async ug(env, [groupKey, userId], by) {
    const group = (await dbListGroups(env)).find((g) => g.key === groupKey);
    if (!group) return { note: "گروه دیگر وجود ندارد." };
    const member = (await dbGetUserGroupKeys(env, userId)).includes(group.key);
    if (member) await dbRemoveGroupMember(env, group.id, userId);
    else await dbAddGroupMember(env, group.id, userId, by);
    return { userId, note: member ? `➖ از «${group.name}» خارج شد.` : `➕ به «${group.name}» اضافه شد.` };
  },
};

/** Whether button data belongs to these actions */
export const isUserButton = (data) => /^u[a-z]:/.test(String(data || ""));

/**
 * A press on a user button: do it, then show the user's card again (with the new state)
 * @returns {Promise<{ answer: string, text?: string, replyMarkup?: object, fresh?: boolean }>} the pop-up note and the message's new content (`fresh`: send it as a new message)
 */
export async function runUserButton(env, data, by) {
  const [verb, ...rest] = String(data).split(":");
  const action = USER_ACTIONS[verb];
  if (!action) return { answer: "این دکمه معتبر نیست." };
  const result = await action(env, rest, by);
  const userId = typeof result === "string" ? result : result?.userId || rest[rest.length - 1];
  const note = typeof result === "string" ? "" : result?.note || "";
  const card = userId ? await buildUserCard(env, userId) : null;
  if (!card) return { answer: note || "کاربر پیدا نشد." };
  // Opening a card from a list sends it as a new message, so the list stays
  return { answer: note, text: note ? `${card.text}\n\n${note}` : card.text, replyMarkup: card.replyMarkup, fresh: verb === "uv" };
}
