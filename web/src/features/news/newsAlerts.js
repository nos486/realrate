/**
 * newsAlerts.js — A notification when important news comes in (importance 3)
 *
 *  - website and PWA: a Web Push from the server (api/src/services/news/newsPush.service.js),
 *    turned on per browser (/api/alerts/push/news); it arrives even with the site closed
 *  - Android app: no server push there, so while the app is running it checks the important
 *    news every two minutes and shows a local notification for each new one
 * Tapping the notification opens that item on the news page.
 */

import { isNativeApp } from '../../shared/native/nativeApp.js';
import { requestNotificationPermission } from '../../shared/native/dueNotifications.js';
import {
  isWebPushSupported,
  ensurePushSubscription,
  getPushDeviceId,
  NEWS_PUSH_FLAG_KEY,
} from '../../shared/push/webPushClient.js';
import { httpClient } from '../../shared/api/httpClient.js';
import { getNews } from './newsApi.js';

const NATIVE_KEY = 'realrate_news_alerts_native';
const SEEN_KEY = 'realrate_news_alerts_seen';
const CHECK_MS = 2 * 60_000;

const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* storage blocked */ }
};

/** Whether this device can get them at all */
export const newsAlertsSupported = () => isNativeApp() || isWebPushSupported();

/** @returns {Promise<boolean>} on for this device */
export async function getNewsAlertsEnabled() {
  if (isNativeApp()) return read(NATIVE_KEY) === '1';
  if (!isWebPushSupported()) return false;
  try {
    const res = await httpClient.get(`/api/alerts/push/news?deviceId=${encodeURIComponent(getPushDeviceId())}`);
    write(NEWS_PUSH_FLAG_KEY, res.enabled ? '1' : null);
    return Boolean(res.enabled);
  } catch {
    return read(NEWS_PUSH_FLAG_KEY) === '1';
  }
}

/** Turn them on or off (asks for the notification permission when turning on) */
export async function setNewsAlertsEnabled(enabled) {
  if (isNativeApp()) {
    if (enabled && (await requestNotificationPermission()) !== 'granted') {
      throw new Error('اجازه‌ی نمایش اعلان داده نشد.');
    }
    write(NATIVE_KEY, enabled ? '1' : null);
    if (enabled) write(SEEN_KEY, String(Date.now()));
    return enabled;
  }
  const deviceId = enabled ? (await ensurePushSubscription()).deviceId : getPushDeviceId();
  await httpClient.put('/api/alerts/push/news', { deviceId, enabled }, { silent: true });
  write(NEWS_PUSH_FLAG_KEY, enabled ? '1' : null);
  return enabled;
}

/** A positive 31-bit id for a news item's local notification */
function notificationIdOf(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 2_000_000_000) + 1;
}

/** Android app: local notifications for important news that came in since the last check */
async function checkNative() {
  if (read(NATIVE_KEY) !== '1') return;
  const seen = parseInt(read(SEEN_KEY) || '0', 10) || Date.now();
  const res = await getNews({ limit: 5, important: true }).catch(() => null);
  const fresh = (res?.items || []).filter((n) => n.importance >= 3 && n.publishedAt > seen);
  if (!fresh.length) return;
  write(SEEN_KEY, String(Math.max(...fresh.map((n) => n.publishedAt))));
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.schedule({
    notifications: fresh.slice(0, 3).map((n) => ({
      id: notificationIdOf(n.id),
      title: 'خبر مهم',
      body: n.title,
      largeBody: n.summary && n.summary !== n.title ? `${n.title}\n${n.summary}` : n.title,
      extra: { kind: 'news', path: `/news?open=${encodeURIComponent(n.id)}` },
    })),
  }).catch(() => {});
}

/** Start the Android app's check (nothing elsewhere); returns a stop function */
export function startNewsAlerts() {
  if (!isNativeApp()) return () => {};
  checkNative();
  const timer = setInterval(checkNative, CHECK_MS);
  const onVisible = () => document.visibilityState === 'visible' && checkNative();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
