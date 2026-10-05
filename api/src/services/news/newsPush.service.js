/**
 * newsPush.service.js — A push to the browsers that asked for it when important news comes in
 *
 * Only news the model rated most important (importance 3) and published in the last
 * NEWS_PUSH.freshMinutes (not a channel's backlog on its first read). Several in one run make one
 * notification; at most one every NEWS_PUSH.minIntervalMinutes. News is public, so the payload is
 * plain ({ plain: 1, title, body, path, tag }; public/sw.js shows it as it is), unlike the sealed
 * due-date reminders. The Android app shows its own local notification (web: newsAlerts.js).
 */

import { NEWS_PUSH } from "../../config/news.config.js";
import { isWebPushConfigured, sendWebPush } from "../../lib/webPush.js";
import { dbGetNewsAlertSubscriptions, dbDeleteExpiredPushSubscription } from "../../repositories/push.repository.js";
import { getStateStore } from "../../repositories/stateStore.repository.js";

const LAST_PUSH_KEY = "news:push:last";
const fa = (n) => Number(n).toLocaleString("fa-IR");

/** The notification for this run's important news, or null */
export function newsPushPayload(items, now) {
  const fresh = items
    .filter((n) => n.importance >= 3 && now - n.publishedAt <= NEWS_PUSH.freshMinutes * 60000)
    .sort((a, b) => b.publishedAt - a.publishedAt);
  if (!fresh.length) return null;
  const [first] = fresh;
  return {
    plain: 1,
    title: fresh.length > 1 ? `${fa(fresh.length)} خبر مهم` : "خبر مهم",
    body: fresh.length > 1 ? fresh.map((n) => `• ${n.title}`).join("\n") : `${first.title}\n${first.summary !== first.title ? first.summary : ""}`.trim(),
    path: `/news?open=${encodeURIComponent(first.id)}`,
    tag: "news",
  };
}

/**
 * Send it (best-effort)
 * @returns {Promise<{ sent: number, expired: number, skipped?: string }>}
 */
export async function notifyImportantNews(env, items, { now = Date.now() } = {}) {
  const payload = newsPushPayload(items, now);
  if (!payload) return { sent: 0, expired: 0, skipped: "none" };
  if (!isWebPushConfigured(env)) return { sent: 0, expired: 0, skipped: "not-configured" };
  const store = getStateStore(env);
  const last = parseInt((await store?.get(LAST_PUSH_KEY)) || "0", 10) || 0;
  if (now - last < NEWS_PUSH.minIntervalMinutes * 60000) return { sent: 0, expired: 0, skipped: "too-soon" };
  await store?.put(LAST_PUSH_KEY, String(now), { expirationTtl: 86400 });

  const subs = await dbGetNewsAlertSubscriptions(env, NEWS_PUSH.maxDevices);
  const data = JSON.stringify(payload);
  let sent = 0;
  let expired = 0;
  for (let i = 0; i < subs.length; i += 10) {
    await Promise.all(subs.slice(i, i + 10).map(async (row) => {
      const res = await sendWebPush(env, { subscription: row.subscription_json, data, ttl: 3600 }).catch(() => ({ success: false }));
      if (res.success) sent++;
      else if (res.expired) {
        expired++;
        await dbDeleteExpiredPushSubscription(env, row.device_id).catch(() => {});
      }
    }));
  }
  return { sent, expired };
}
