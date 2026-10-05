/**
 * push.repository.js — Database storage for Web Push subscriptions and sealed reminders
 *
 * Stores opaque sealed payloads and push subscriptions per device.
 * Enforces zero-knowledge: payloads are stored untouched without decryption.
 */

import { ensureSchema } from './schema.repository.js';
import { validatePushSubscriptionInput, validatePushRemindersInput } from '../domain/sealedPush.js';

export async function dbGetPushSubscription(env, deviceId) {
  await ensureSchema(env);
  const row = await env.DB.prepare(`
    SELECT device_id, user_id, subscription_json, created_at, updated_at
    FROM push_subscriptions WHERE device_id = ?
  `).bind(deviceId).first();

  if (!row) return null;
  let subscription = null;
  try {
    subscription = JSON.parse(row.subscription_json);
  } catch {}

  return {
    deviceId: row.device_id,
    userId: row.user_id,
    subscription,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function dbGetPushSubscriptionsForUser(env, userId) {
  await ensureSchema(env);
  const { results = [] } = await env.DB.prepare(`
    SELECT device_id, user_id, subscription_json, created_at, updated_at
    FROM push_subscriptions WHERE user_id = ?
  `).bind(String(userId)).all();

  return results.map((row) => {
    let subscription = null;
    try {
      subscription = JSON.parse(row.subscription_json);
    } catch {}
    return {
      deviceId: row.device_id,
      userId: row.user_id,
      subscription,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export async function dbSavePushSubscription(env, userId, input) {
  await ensureSchema(env);
  const { value, error } = validatePushSubscriptionInput(input);
  if (error) throw new Error(error);

  const { deviceId, subscription } = value;
  const now = new Date().toISOString();
  const subJson = JSON.stringify(subscription);

  await env.DB.batch([
    // A browser that now belongs to another account keeps none of the previous account's reminders
    env.DB.prepare(`
      DELETE FROM push_reminders WHERE device_id = ? AND user_id != ?
    `).bind(deviceId, String(userId)),
    env.DB.prepare(`
      INSERT INTO push_subscriptions (device_id, user_id, subscription_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET
        user_id = excluded.user_id,
        subscription_json = excluded.subscription_json,
        updated_at = excluded.updated_at
    `).bind(deviceId, String(userId), subJson, now, now),
  ]);

  return { success: true, deviceId };
}

export async function dbDeletePushSubscription(env, userId, deviceId) {
  await ensureSchema(env);
  const stmts = [
    env.DB.prepare(`
      DELETE FROM push_reminders WHERE device_id = ? AND user_id = ?
    `).bind(deviceId, String(userId)),
    env.DB.prepare(`
      DELETE FROM push_subscriptions WHERE device_id = ? AND user_id = ?
    `).bind(deviceId, String(userId)),
  ];

  await env.DB.batch(stmts);
  return { success: true };
}

export async function dbSavePushReminders(env, userId, input) {
  await ensureSchema(env);
  const { value, error } = validatePushRemindersInput(input);
  if (error) throw new Error(error);

  const { deviceId, items } = value;

  // Verify device belongs to this user
  const sub = await env.DB.prepare(`
    SELECT user_id FROM push_subscriptions WHERE device_id = ?
  `).bind(deviceId).first();

  if (!sub || String(sub.user_id) !== String(userId)) {
    throw new Error('اشتراک این دستگاه یافت نشد یا متعلق به کاربر دیگری است.');
  }

  const now = new Date().toISOString();
  const stmts = [
    // Clear previously scheduled reminders for this device to prevent staleness
    env.DB.prepare(`
      DELETE FROM push_reminders WHERE device_id = ?
    `).bind(deviceId),
  ];

  for (const item of items) {
    stmts.push(
      env.DB.prepare(`
        INSERT INTO push_reminders (device_id, user_id, kind, record_id, due_date, reason, fire_date, sealed_payload, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        deviceId,
        String(userId),
        item.kind,
        item.recordId,
        item.dueDate,
        item.reason,
        item.fireDate,
        item.sealed,
        now
      )
    );
  }

  await env.DB.batch(stmts);
  return { success: true, count: items.length };
}

export async function dbGetDuePushReminders(env, fireDate) {
  await ensureSchema(env);
  const { results = [] } = await env.DB.prepare(`
    SELECT r.device_id, r.user_id, r.kind, r.record_id, r.due_date, r.reason, r.fire_date, r.sealed_payload, s.subscription_json
    FROM push_reminders r
    INNER JOIN push_subscriptions s ON s.device_id = r.device_id AND s.user_id = r.user_id
    WHERE r.fire_date = ?
  `).bind(fireDate).all();

  return results.map((row) => {
    let subscription = null;
    try {
      subscription = JSON.parse(row.subscription_json);
    } catch {}
    return {
      deviceId: row.device_id,
      userId: row.user_id,
      kind: row.kind,
      recordId: row.record_id,
      dueDate: row.due_date,
      reason: row.reason,
      fireDate: row.fire_date,
      sealed_payload: row.sealed_payload,
      subscription,
    };
  });
}

export async function dbDeletePushReminder(env, deviceId, kind, recordId, dueDate, reason) {
  await ensureSchema(env);
  await env.DB.prepare(`
    DELETE FROM push_reminders
    WHERE device_id = ? AND kind = ? AND record_id = ? AND due_date = ? AND reason = ?
  `).bind(deviceId, kind, recordId, dueDate, reason).run();
}

export async function dbPurgeOldPushReminders(env, beforeDate) {
  await ensureSchema(env);
  await env.DB.prepare(`
    DELETE FROM push_reminders WHERE fire_date < ?
  `).bind(beforeDate).run();
}

/** Whether this browser gets a push for important news (false without a subscription) */
export async function dbGetNewsAlerts(env, userId, deviceId) {
  await ensureSchema(env);
  const row = await env.DB.prepare(
    "SELECT news_alerts FROM push_subscriptions WHERE device_id = ? AND user_id = ?"
  ).bind(deviceId, String(userId)).first();
  return { subscribed: Boolean(row), enabled: Boolean(row?.news_alerts) };
}

/** Turn important-news pushes on or off for a subscribed browser; false when it isn't subscribed */
export async function dbSetNewsAlerts(env, userId, deviceId, enabled) {
  await ensureSchema(env);
  const res = await env.DB.prepare(
    "UPDATE push_subscriptions SET news_alerts = ? WHERE device_id = ? AND user_id = ?"
  ).bind(enabled ? 1 : 0, deviceId, String(userId)).run();
  return Number(res?.meta?.changes ?? 0) > 0;
}

/** The browsers that want important news */
export async function dbGetNewsAlertSubscriptions(env, limit = 200) {
  await ensureSchema(env);
  const { results = [] } = await env.DB.prepare(
    "SELECT device_id, user_id, subscription_json FROM push_subscriptions WHERE news_alerts = 1 ORDER BY updated_at DESC LIMIT ?"
  ).bind(limit).all();
  return results;
}

/** Forget a browser whose subscription the push service no longer knows */
export async function dbDeleteExpiredPushSubscription(env, deviceId) {
  await ensureSchema(env);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM push_reminders WHERE device_id = ?").bind(deviceId),
    env.DB.prepare("DELETE FROM push_subscriptions WHERE device_id = ?").bind(deviceId),
  ]);
}

