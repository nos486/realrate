/**
 * messengers.js — The messengers the app has a bot in (Telegram, Rubika), as one table
 *
 * The rest of the API talks to "the bots" through here, never to one messenger: the news poll
 * queues its articles for every channel, a user's request reaches the admin in every messenger
 * they linked, and the cron runs every bot. Each messenger keeps its own settings, queue and
 * status, so one being off or failing never touches the others. A new messenger is one more row.
 */

import { runBot } from "./bot.service.js";
import { enqueueFeedNews } from "./newsChannel.service.js";
import { notifyAdmin } from "./adminChat.service.js";
import { runRubikaBot } from "./rubika/rubikaBot.service.js";
import { enqueueRubikaNews } from "./rubika/rubikaChannel.service.js";
import { notifyRubikaAdmin } from "./rubika/rubikaChat.service.js";
import { logger } from "../../lib/logger.js";

export const MESSENGERS = [
  { id: "telegram", run: runBot, enqueue: enqueueFeedNews, notify: notifyAdmin },
  { id: "rubika", run: runRubikaBot, enqueue: enqueueRubikaNews, notify: notifyRubikaAdmin },
];

/** Each messenger on its own: a failure is logged and counts as nothing done */
const each = (label, fn) => Promise.all(MESSENGERS.map((m) => Promise.resolve()
  .then(() => fn(m))
  .catch((err) => {
    logger.warn(`[Bot] ${label} failed`, { messenger: m.id, error: err?.message });
    return null;
  })));

/**
 * Queue the published international news for every channel
 * @returns {Promise<number>} articles added, over all channels
 */
export async function enqueueChannelNews(env, items, now = Date.now()) {
  return (await each("queuing news", (m) => m.enqueue(env, items, now))).reduce((sum, n) => sum + (n || 0), 0);
}

/**
 * Tell the admin about a request in every messenger they linked
 * @param {object} env
 * @param {{ text: string, action: { type: string } }} message
 * @returns {Promise<boolean>} whether it reached them anywhere
 */
export async function notifyAdmins(env, message, opts = {}) {
  return (await each("telling the admin", (m) => m.notify(env, message, opts))).some(Boolean);
}

/** The minute's run of every bot */
export const runMessengers = (env, opts = {}) => each("run", (m) => m.run(env, opts));
