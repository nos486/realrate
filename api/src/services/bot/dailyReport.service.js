/**
 * dailyReport.service.js — Bot feature: the admin's daily report in Telegram (and, through
 * `sendDailyReportOnce`, in Rubika)
 *
 * When the admin turned it on (panel → ربات تلگرام) and has started the bot, the report of
 * `/report` (adminCommands.service.js) is sent once per Tehran day, at the first run after
 * REPORT_HOUR_TEHRAN. The day it was sent is kept in `app_state`, so a retry or a second isolate
 * never sends it twice.
 */

import { getStateStore } from "../../repositories/stateStore.repository.js";
import { getBotConfig } from "./botConfig.service.js";
import { buildReport } from "./adminCommands.service.js";
import { sendMessage } from "./telegramApi.js";
import { tehranDay } from "../../lib/usageQuota.js";
import { REPORT_HOUR_TEHRAN } from "../../config/telegramBot.config.js";

const SENT_KEY = "bot:report:day";
const TTL_SEC = 3 * 86400;

const tehranHour = (date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tehran", hour: "2-digit", hourCycle: "h23" }).format(date));

/**
 * Send the report once per Tehran day, for any messenger
 * @param {object} env
 * @param {{ on: boolean, dayKey: string, send: (text: string) => Promise<unknown> }} target - on: the
 *   admin wants it and is linked; dayKey: the `app_state` key of the day it was last sent
 * @param {number} now
 * @returns {Promise<boolean>} whether it was sent now
 */
export async function sendDailyReportOnce(env, { on, dayKey, send }, now = Date.now()) {
  const store = getStateStore(env);
  const date = new Date(now);
  if (!on || !store || tehranHour(date) < REPORT_HOUR_TEHRAN) return false;
  const day = tehranDay(date);
  if ((await store.get(dayKey)) === day) return false;
  // Marked first: a failed send is not retried every minute for the rest of the evening
  await store.put(dayKey, day, { expirationTtl: TTL_SEC });
  await send(await buildReport(env, now));
  return true;
}

/** @returns {Promise<{ sent: number }>} always 0 sent news: the report is not a channel post */
export async function sendDailyReport(env, { now = Date.now(), fetchFn } = {}) {
  const config = await getBotConfig(env);
  await sendDailyReportOnce(env, {
    on: config.dailyReport && Boolean(config.adminChatId),
    dayKey: SENT_KEY,
    send: (text) => sendMessage(config.token, config.adminChatId, text, { plain: true, fetchFn }),
  }, now);
  return { sent: 0 };
}
