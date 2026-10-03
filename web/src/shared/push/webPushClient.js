/**
 * webPushClient.js — Client-side manager for sealed Web Push notifications
 *
 * Orchestrates:
 * 1. Non-extractable AES-GCM (256-bit) device sealing key in IndexedDB
 * 2. PushManager VAPID subscription registration and server synchronization
 * 3. Client-side sealing of upcoming 30-day reminders without server learning details
 * 4. User preferences persistence in localStorage
 */

import {
  generateSealingKey,
  sealPayload,
  validatePushSubscriptionInput,
} from '../../utils/sealedPush.js';
import { planDueNotifications } from '../native/dueNotifications.js';
import { isNativeApp } from '../native/nativeApp.js';
import { httpClient } from '../api/httpClient.js';

const KEYSTORE_DB = 'realrate_push_keystore';
const KEYSTORE_STORE = 'keys';
const KEY_NAME = 'device_sealing_key';
const DEVICE_ID_KEY = 'realrate_push_device_id';
const SETTINGS_KEY = 'realrate_web_push_settings';

export const DEFAULT_PUSH_SETTINGS = {
  enabled: false,
  leadDays: [1, 0],
  showAmount: false,
};

export function isWebPushSupported() {
  if (typeof window === 'undefined') return false;
  return (
    !isNativeApp() &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    'indexedDB' in window
  );
}

export function getPushDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      id = `dev_${crypto.randomUUID().replace(/-/g, '')}`;
    } else {
      id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getWebPushSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_PUSH_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PUSH_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_PUSH_SETTINGS };
  }
}

export function setWebPushSettings(settings) {
  const current = getWebPushSettings();
  const next = { ...current, ...settings };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

// ── IndexedDB Key Store ─────────────────────────────────────────────────────

function openPushKeystore() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(KEYSTORE_DB, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(KEYSTORE_STORE)) {
        db.createObjectStore(KEYSTORE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

export async function getDeviceSealingKey() {
  try {
    const db = await openPushKeystore();
    return new Promise((resolve) => {
      const tx = db.transaction(KEYSTORE_STORE, 'readonly');
      const store = tx.objectStore(KEYSTORE_STORE);
      const req = store.get(KEY_NAME);
      req.onsuccess = () => {
        db.close();
        resolve(req.result || null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

export async function saveDeviceSealingKey(key) {
  const db = await openPushKeystore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEYSTORE_STORE, 'readwrite');
    const store = tx.objectStore(KEYSTORE_STORE);
    const req = store.put(key, KEY_NAME);
    req.onsuccess = () => {
      db.close();
      resolve(true);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function clearDeviceSealingKey() {
  try {
    const db = await openPushKeystore();
    return new Promise((resolve) => {
      const tx = db.transaction(KEYSTORE_STORE, 'readwrite');
      const store = tx.objectStore(KEYSTORE_STORE);
      const req = store.delete(KEY_NAME);
      req.onsuccess = () => {
        db.close();
        resolve(true);
      };
      req.onerror = () => {
        db.close();
        resolve(false);
      };
    });
  } catch {
    return false;
  }
}

export async function getOrCreateDeviceSealingKey() {
  let key = await getDeviceSealingKey();
  if (!key) {
    key = await generateSealingKey(false);
    await saveDeviceSealingKey(key);
  }
  return key;
}

// ── VAPID Subscription & API ────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function fetchVapidKey() {
  return httpClient.get('/api/alerts/push/vapid-key');
}

export async function registerPushOnServer({ deviceId, subscription }) {
  const payload = { deviceId, subscription };
  const { error } = validatePushSubscriptionInput(payload);
  if (error) throw new Error(error);

  return httpClient.post('/api/alerts/push/subscription', payload);
}

export async function deletePushOnServer(deviceId) {
  return httpClient.delete(`/api/alerts/push/subscription/${encodeURIComponent(deviceId)}`);
}

export async function uploadSealedReminders({ deviceId, items }) {
  return httpClient.put('/api/alerts/push/reminders', { deviceId, items });
}

export async function sendTestPushOnServer({ deviceId, sealed }) {
  return httpClient.post('/api/alerts/push/test', { deviceId, sealed });
}

// ── Orchestration ───────────────────────────────────────────────────────────

export async function enableWebPush(settingsUpdate = {}) {
  if (!isWebPushSupported()) {
    throw new Error('مرورگر شما از اعلان وب پشتیبانی نمی‌کند.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('مجوز ارسال اعلان توسط کاربر صادر نشد.');
  }

  const { vapidPublicKey, configured } = await fetchVapidKey();
  if (!configured || !vapidPublicKey) {
    throw new Error('سرویس اعلان مرورگر روی سرور فعال نیست.');
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  const deviceId = getPushDeviceId();
  await getOrCreateDeviceSealingKey();
  await registerPushOnServer({ deviceId, subscription: sub.toJSON() });

  const updatedSettings = setWebPushSettings({ enabled: true, ...settingsUpdate });
  return { success: true, settings: updatedSettings };
}

export async function disableWebPush() {
  const deviceId = getPushDeviceId();
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
    }
  } catch {}

  await clearDeviceSealingKey();
  await deletePushOnServer(deviceId).catch(() => {});
  const updatedSettings = setWebPushSettings({ enabled: false });
  return { success: true, settings: updatedSettings };
}

/**
 * Logout: stop this browser's sealed reminders for the account signing out — the server drops
 * the subscription and its reminders (while the session is still valid), the browser's push
 * subscription and the device key are removed, and push is off for whoever signs in next.
 * Best-effort; never throws.
 */
export async function signOutWebPush() {
  if (!isWebPushSupported() || !getWebPushSettings().enabled) return;
  await deletePushOnServer(getPushDeviceId()).catch(() => {});
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch {
    // No service worker or subscription
  }
  await clearDeviceSealingKey();
  try {
    setWebPushSettings({ enabled: false });
  } catch {
    // Blocked storage
  }
}

/**
 * Re-plans and uploads sealed push reminders to the server whenever records change.
 */
export async function syncSealedReminders({
  loans = [],
  cheques = [],
  isVaultUnlocked = false,
  today,
  hideAmounts = false,
}) {
  if (!isWebPushSupported() || !isVaultUnlocked) return;
  const settings = getWebPushSettings();
  if (!settings.enabled) return;

  const key = await getDeviceSealingKey();
  if (!key) return;

  const planned = planDueNotifications({
    loans,
    cheques,
    today,
    settings: {
      enabled: true,
      leadDays: settings.leadDays,
      showAmount: settings.showAmount,
    },
    hideAmounts,
  });

  const deviceId = getPushDeviceId();
  const items = [];

  for (const notif of planned) {
    // One row per notification: the 3-day and the 1-day reminder of the same date are two
    const reason = notif.reason === 'lead' ? `lead:${notif.leadDays}` : notif.reason;
    const payload = {
      title: notif.title,
      body: notif.body,
      path: notif.extra?.path || '/',
      tag: `due_${notif.kind}_${notif.recordId}_${notif.dueDate}_${reason}`,
    };

    const sealed = await sealPayload(key, payload);
    const fireDate = notif.fireAt instanceof Date
      ? notif.fireAt.toISOString().split('T')[0]
      : String(notif.dueDate);

    items.push({
      kind: notif.kind,
      recordId: notif.recordId,
      dueDate: notif.dueDate,
      reason,
      fireDate,
      sealed,
    });
  }

  await uploadSealedReminders({ deviceId, items });
}

export async function triggerTestPush() {
  const key = await getDeviceSealingKey();
  if (!key) throw new Error('کلید رمزنگاری اعلان روی این دستگاه یافت نشد.');

  const testPayload = {
    title: 'اعلان آزمایشی RealRate',
    body: 'این یک اعلان آزمایشی رمزنگاری‌شده است که با موفقیت روی مرورگر شما دریافت شد.',
    path: '/settings',
    tag: 'test_notification',
  };

  const sealed = await sealPayload(key, testPayload);
  const deviceId = getPushDeviceId();
  return sendTestPushOnServer({ deviceId, sealed });
}
