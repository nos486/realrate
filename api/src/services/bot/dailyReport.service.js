/**
 * dailyReport.service.js — Bot feature: the admin's daily report in Telegram
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

/** @returns {Promise<{ sent: number }>} always 0 sent news: the report is not a channel post */
export async function sendDailyReport(env, { now = Date.now(), fetchFn } = {}) {
  const config = await getBotConfig(env);
  const store = getStateStore(env);
  const date = new Date(now);
  if (!config.dailyReport || !config.adminChatId || !store || tehranHour(date) < REPORT_HOUR_TEHRAN) return { sent: 0 };
  const day = tehranDay(date);
  if ((await store.get(SENT_KEY)) === day) return { sent: 0 };
  // Marked first: a failed send is not retried every minute for the rest of the evening
  await store.put(SENT_KEY, day, { expirationTtl: TTL_SEC });
  await sendMessage(config.token, config.adminChatId, await buildReport(env, now), { plain: true, fetchFn });
  return { sent: 0 };
}
