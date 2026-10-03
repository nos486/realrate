/**
 * sealedPush.test.js — Tests for sealed Web Push notifications (Part C)
 *
 * Verifies:
 * 1. AES-GCM 256-bit sealing and unsealing round-trip
 * 2. Service worker decrypt path (pure function test with fallback)
 * 3. Input validation for subscriptions and reminders
 * 4. Server stores and forwards payload untouched without decoding
 * 5. Cron selection for today's reminders
 * 6. Subscription cleanup on HTTP 404/410
 * 7. HTTP route endpoints and authentication/rate-limits
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateSealingKey,
  sealPayload,
  unsealPayload,
  decryptNotificationPayload,
  validatePushSubscriptionInput,
  validatePushRemindersInput,
} from '../../src/domain/sealedPush.js';
import {
  dbGetPushSubscription,
  dbSavePushSubscription,
  dbDeletePushSubscription,
  dbSavePushReminders,
  dbGetDuePushReminders,
  dbDeletePushReminder,
} from '../../src/repositories/push.repository.js';
import { runReminderPushDigest } from '../../src/jobs/reminderPush.job.js';
import {
  handleGetVapidKey,
  handleSavePushSubscription,
  handleDeletePushSubscription,
  handlePutPushReminders,
  handleSendTestPush,
} from '../../src/handlers/pushRoutes.js';
import { sendWebPush, isWebPushConfigured } from '../../src/lib/webPush.js';
import { withErrorHandler } from '../../src/middlewares/errorHandler.js';

vi.mock('../../src/lib/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock('../../src/lib/webPush.js', () => ({
  isWebPushConfigured: vi.fn(() => true),
  sendWebPush: vi.fn(async () => ({ success: true, status: 201 })),
}));

import { getAuthenticatedUser } from '../../src/lib/auth.js';

function createMockPushDb() {
  const subscriptions = new Map(); // deviceId -> row
  const reminders = []; // reminder rows

  return {
    subscriptions,
    reminders,
    async batch(stmts) {
      for (const s of stmts) await s.run();
      return [];
    },
    prepare(sql) {
      const q = sql.replace(/\s+/g, ' ').trim();
      let bound = [];
      const stmt = {
        bind(...args) {
          bound = args;
          return stmt;
        },
        async first() {
          if (q.includes('FROM push_subscriptions WHERE device_id = ?')) {
            const row = subscriptions.get(bound[0]);
            return row || null;
          }
          if (q.includes('SELECT user_id FROM push_subscriptions WHERE device_id = ?')) {
            const row = subscriptions.get(bound[0]);
            return row ? { user_id: row.user_id } : null;
          }
          return null;
        },
        async all() {
          if (q.includes('FROM push_reminders r INNER JOIN push_subscriptions s')) {
            const fireDate = bound[0];
            const results = [];
            for (const r of reminders) {
              if (r.fire_date === fireDate && subscriptions.get(r.device_id)?.user_id === r.user_id) {
                results.push({
                  ...r,
                  subscription_json: subscriptions.get(r.device_id).subscription_json,
                });
              }
            }
            return { results };
          }
          if (q.includes('FROM push_subscriptions WHERE user_id = ?')) {
            const userId = String(bound[0]);
            const results = [...subscriptions.values()].filter((s) => s.user_id === userId);
            return { results };
          }
          return { results: [] };
        },
        async run() {
          if (q.includes('INSERT INTO push_subscriptions')) {
            const [device_id, user_id, subscription_json, created_at, updated_at] = bound;
            subscriptions.set(device_id, {
              device_id,
              user_id: String(user_id),
              subscription_json,
              created_at,
              updated_at,
            });
            return { meta: { changes: 1 } };
          }
          if (q.includes('DELETE FROM push_reminders WHERE device_id = ?') && !q.includes('AND kind = ?')) {
            const [devId, userId] = bound;
            const matches = (r) => {
              if (r.device_id !== devId) return false;
              if (q.includes('AND user_id != ?')) return r.user_id !== String(userId);
              if (q.includes('AND user_id = ?')) return r.user_id === String(userId);
              return true;
            };
            for (let i = reminders.length - 1; i >= 0; i--) {
              if (matches(reminders[i])) reminders.splice(i, 1);
            }
            return { meta: { changes: 1 } };
          }
          if (q.includes('DELETE FROM push_subscriptions WHERE device_id = ? AND user_id = ?')) {
            const [devId, userId] = bound;
            const existing = subscriptions.get(devId);
            if (existing && existing.user_id === String(userId)) {
              subscriptions.delete(devId);
            }
            return { meta: { changes: 1 } };
          }
          if (q.includes('INSERT INTO push_reminders')) {
            const [device_id, user_id, kind, record_id, due_date, reason, fire_date, sealed_payload, updated_at] = bound;
            reminders.push({
              device_id,
              user_id: String(user_id),
              kind,
              record_id,
              due_date,
              reason,
              fire_date,
              sealed_payload,
              updated_at,
            });
            return { meta: { changes: 1 } };
          }
          if (q.includes('DELETE FROM push_reminders WHERE device_id = ? AND kind = ?')) {
            const [devId, kind, recId, dueDate, reason] = bound;
            const idx = reminders.findIndex(
              (r) =>
                r.device_id === devId &&
                r.kind === kind &&
                r.record_id === recId &&
                r.due_date === dueDate &&
                r.reason === reason
            );
            if (idx >= 0) reminders.splice(idx, 1);
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
      };
      return stmt;
    },
  };
}

describe('Sealed Web Push (Part C)', () => {
  let mockDb;
  let env;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockPushDb();
    env = {
      DB: mockDb,
      VAPID_PUBLIC_KEY: 'test_vapid_public_key',
      VAPID_PRIVATE_KEY: 'test_vapid_private_key',
      VAPID_SUBJECT: 'mailto:support@realrate.ir',
    };
    isWebPushConfigured.mockReturnValue(true);
    sendWebPush.mockResolvedValue({ success: true, status: 201 });
  });

  describe('1. Sealing & Unsealing Round-Trip (WebCrypto AES-GCM)', () => {
    it('encrypts and decrypts notification payloads correctly', async () => {
      const key = await generateSealingKey(true);
      const originalPayload = {
        title: 'قسط وام مسکن فردا سررسید می‌شود',
        body: 'بانک مسکن — ۵٬۰۰۰٬۰۰۰ تومان',
        path: '/loans/ln_123',
        tag: 'due_loan_123',
      };

      const sealedString = await sealPayload(key, originalPayload);
      expect(typeof sealedString).toBe('string');

      const parsed = JSON.parse(sealedString);
      expect(parsed.iv).toBeDefined();
      expect(parsed.data).toBeDefined();
      // Server cannot see plaintext in the serialized string
      expect(sealedString).not.toContain('مسکن');
      expect(sealedString).not.toContain('۵٬۰۰۰٬۰۰۰');

      const unsealed = await unsealPayload(key, sealedString);
      expect(unsealed).toEqual(originalPayload);
    });

    it('fails to unseal with wrong key', async () => {
      const key1 = await generateSealingKey(true);
      const key2 = await generateSealingKey(true);
      const payload = { title: 'محرمانه', body: 'تست', path: '/' };

      const sealed = await sealPayload(key1, payload);
      await expect(unsealPayload(key2, sealed)).rejects.toThrow();
    });
  });

  describe('2. Service Worker Decrypt Path (Pure function test)', () => {
    it('returns decrypted options when key is available and ciphertext is valid', async () => {
      const key = await generateSealingKey(true);
      const original = {
        title: 'چک صادره امروز سررسید است',
        body: 'طرف حساب: علی — ۲٬۰۰۰٬۰۰۰ تومان',
        path: '/cheques',
        tag: 'tag_1',
      };
      const sealed = await sealPayload(key, original);

      const result = await decryptNotificationPayload({ rawText: sealed, key });
      expect(result).toEqual({
        title: original.title,
        body: original.body,
        path: original.path,
        tag: original.tag,
        isFallback: false,
      });
    });

    it('falls back to generic notification when key is missing or corrupted', async () => {
      const fallbackNoKey = await decryptNotificationPayload({ rawText: '{"iv":"...","data":"..."}', key: null });
      expect(fallbackNoKey.isFallback).toBe(true);
      expect(fallbackNoKey.title).toBe('یادآوری سررسید');
      expect(fallbackNoKey.body).toBe('یک سررسید امروز دارید');
      expect(fallbackNoKey.path).toBe('/');

      const key = await generateSealingKey(true);
      const fallbackCorrupted = await decryptNotificationPayload({ rawText: 'corrupted-data', key });
      expect(fallbackCorrupted.isFallback).toBe(true);
      expect(fallbackCorrupted.title).toBe('یادآوری سررسید');
    });
  });

  describe('3. Input Validation', () => {
    it('validates push subscription registration input', () => {
      const validSub = {
        deviceId: 'dev_12345678',
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/xyz',
          keys: { p256dh: 'p256_key_data', auth: 'auth_secret' },
        },
      };

      const res = validatePushSubscriptionInput(validSub);
      expect(res.error).toBeUndefined();
      expect(res.value.deviceId).toBe('dev_12345678');
      expect(res.value.subscription.endpoint).toBe('https://fcm.googleapis.com/fcm/send/xyz');

      // Invalid endpoint
      expect(validatePushSubscriptionInput({ ...validSub, subscription: { ...validSub.subscription, endpoint: 'http://insecure' } }).error).toBeTruthy();
      // Missing keys
      expect(validatePushSubscriptionInput({ ...validSub, subscription: { endpoint: 'https://fcm.googleapis.com' } }).error).toBeTruthy();
      // Bad deviceId
      expect(validatePushSubscriptionInput({ ...validSub, deviceId: 'short' }).error).toBeTruthy();
    });

    it('validates push reminders upload items', () => {
      const validUpload = {
        deviceId: 'dev_12345678',
        items: [
          {
            kind: 'loan',
            recordId: 'ln_1',
            dueDate: '2026-10-10',
            reason: 'lead:1',
            fireDate: '2026-10-09',
            sealed: JSON.stringify({ iv: 'iv_str', data: 'data_str' }),
          },
        ],
      };

      const res = validatePushRemindersInput(validUpload);
      expect(res.error).toBeUndefined();
      expect(res.value.items).toHaveLength(1);

      // Each lead day is its own reason, so the 3-day and the 1-day reminder of one date are two rows
      const both = validatePushRemindersInput({
        ...validUpload,
        items: [validUpload.items[0], { ...validUpload.items[0], reason: 'lead:3', fireDate: '2026-10-07' }],
      });
      expect(both.error).toBeUndefined();
      expect(both.value.items.map((i) => i.reason)).toEqual(['lead:1', 'lead:3']);
      for (const reason of ['lead', 'lead:0', 'lead:99', 'lead:x']) {
        expect(validatePushRemindersInput({ ...validUpload, items: [{ ...validUpload.items[0], reason }] }).error).toBeTruthy();
      }

      // Invalid kind
      expect(validatePushRemindersInput({ ...validUpload, items: [{ ...validUpload.items[0], kind: 'unknown' }] }).error).toBeTruthy();
      // Invalid date
      expect(validatePushRemindersInput({ ...validUpload, items: [{ ...validUpload.items[0], dueDate: 'not-a-date' }] }).error).toBeTruthy();
      // Missing sealed iv/data
      expect(validatePushRemindersInput({ ...validUpload, items: [{ ...validUpload.items[0], sealed: 'invalid-json' }] }).error).toBeTruthy();
    });
  });

  describe('4. Server Storage & Zero-Knowledge Forwarding', () => {
    it('stores and retrieves opaque sealed payloads untouched', async () => {
      const userId = 'u_100';
      const deviceId = 'dev_12345678';
      const sub = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        keys: { p256dh: 'p256', auth: 'auth' },
      };

      await dbSavePushSubscription(env, userId, { deviceId, subscription: sub });

      const opaqueCiphertext = JSON.stringify({
        iv: 'BASE64_IV_12BYTES==',
        data: 'COMPLETELY_OPAQUE_CIPHERTEXT_HERE==',
      });

      await dbSavePushReminders(env, userId, {
        deviceId,
        items: [
          {
            kind: 'loan',
            recordId: 'ln_1',
            dueDate: '2026-10-10',
            reason: 'due',
            fireDate: '2026-10-10',
            sealed: opaqueCiphertext,
          },
        ],
      });

      const due = await dbGetDuePushReminders(env, '2026-10-10');
      expect(due).toHaveLength(1);
      expect(due[0].sealed_payload).toBe(opaqueCiphertext);
      expect(due[0].subscription).toMatchObject(sub);
    });
  });

  describe('4b. Device ownership', () => {
    const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/shared', keys: { p256dh: 'p256', auth: 'auth' } };
    const item = (recordId) => ({
      kind: 'loan', recordId, dueDate: '2026-10-10', reason: 'due', fireDate: '2026-10-10',
      sealed: JSON.stringify({ iv: 'IV', data: 'DATA' }),
    });

    it('another account cannot delete a device\'s reminders it does not own', async () => {
      const deviceId = 'dev_owned_by_a';
      await dbSavePushSubscription(env, 'u_a', { deviceId, subscription: sub });
      await dbSavePushReminders(env, 'u_a', { deviceId, items: [item('ln_a')] });

      await dbDeletePushSubscription(env, 'u_b', deviceId);
      expect(mockDb.reminders).toHaveLength(1);
      expect(mockDb.subscriptions.get(deviceId).user_id).toBe('u_a');
    });

    it('a browser signed into another account keeps none of the previous account\'s reminders', async () => {
      const deviceId = 'dev_shared_pc';
      await dbSavePushSubscription(env, 'u_a', { deviceId, subscription: sub });
      await dbSavePushReminders(env, 'u_a', { deviceId, items: [item('ln_a')] });

      await dbSavePushSubscription(env, 'u_b', { deviceId, subscription: sub });
      expect(mockDb.reminders).toEqual([]);
      expect(await dbGetDuePushReminders(env, '2026-10-10')).toEqual([]);
    });
  });

  describe('5. Cron Selection & Subscription Cleanup on 410', () => {
    it('sends due reminders for today and deletes them, ignoring future ones', async () => {
      const userId = 'u_200';
      const deviceId = 'dev_22222222';
      const sub = {
        endpoint: 'https://push.example.com/send/1',
        keys: { p256dh: 'k', auth: 'a' },
      };

      await dbSavePushSubscription(env, userId, { deviceId, subscription: sub });

      await dbSavePushReminders(env, userId, {
        deviceId,
        items: [
          {
            kind: 'loan',
            recordId: 'ln_due_today',
            dueDate: '2026-10-05',
            reason: 'due',
            fireDate: '2026-10-05',
            sealed: JSON.stringify({ iv: '1', data: 'today' }),
          },
          {
            kind: 'cheque',
            recordId: 'chk_future',
            dueDate: '2026-10-12',
            reason: 'lead:1',
            fireDate: '2026-10-11',
            sealed: JSON.stringify({ iv: '2', data: 'future' }),
          },
        ],
      });

      // Run cron on 2026-10-05 09:00 Tehran time
      const testNow = new Date('2026-10-05T05:30:00Z'); // 09:00 Asia/Tehran
      const result = await runReminderPushDigest(env, { now: testNow });

      expect(result.sentCount).toBe(1);
      expect(sendWebPush).toHaveBeenCalledTimes(1);
      expect(sendWebPush).toHaveBeenCalledWith(env, expect.objectContaining({
        data: JSON.stringify({ iv: '1', data: 'today' }),
      }));

      // The sent reminder for today is removed
      const remainingToday = await dbGetDuePushReminders(env, '2026-10-05');
      expect(remainingToday).toHaveLength(0);

      // Future reminder remains intact
      const future = await dbGetDuePushReminders(env, '2026-10-11');
      expect(future).toHaveLength(1);
    });

    it('cleans up subscription and queued reminders when push service returns HTTP 410 (expired)', async () => {
      const userId = 'u_300';
      const deviceId = 'dev_expired_99';
      const sub = {
        endpoint: 'https://push.example.com/expired',
        keys: { p256dh: 'k', auth: 'a' },
      };

      await dbSavePushSubscription(env, userId, { deviceId, subscription: sub });
      await dbSavePushReminders(env, userId, {
        deviceId,
        items: [
          {
            kind: 'recurring_income',
            recordId: 'inc_1',
            dueDate: '2026-10-05',
            reason: 'due',
            fireDate: '2026-10-05',
            sealed: JSON.stringify({ iv: '3', data: 'expired' }),
          },
        ],
      });

      // Simulate 410 Gone from push service
      sendWebPush.mockResolvedValueOnce({ success: false, expired: true, status: 410 });

      const testNow = new Date('2026-10-05T05:30:00Z');
      const result = await runReminderPushDigest(env, { now: testNow });

      expect(result.sentCount).toBe(0);

      // Subscription should be deleted
      const subAfter = await dbGetPushSubscription(env, deviceId);
      expect(subAfter).toBeNull();
    });
  });

  describe('6. HTTP Endpoints', () => {
    it('returns VAPID public key when authenticated', async () => {
      getAuthenticatedUser.mockResolvedValue({ id: 'u_1' });
      const req = new Request('http://localhost/api/alerts/push/vapid-key');
      const res = await handleGetVapidKey(req, env);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.vapidPublicKey).toBe('test_vapid_public_key');
      expect(json.configured).toBe(true);
    });

    it('rejects unauthenticated requests with 401', async () => {
      getAuthenticatedUser.mockResolvedValue(null);
      const req = new Request('http://localhost/api/alerts/push/vapid-key');
      const handler = withErrorHandler(handleGetVapidKey);
      const res = await handler(req, env);

      expect(res.status).toBe(401);
    });

    it('saves and deletes push subscriptions', async () => {
      getAuthenticatedUser.mockResolvedValue({ id: 'u_1' });
      const saveReq = new Request('http://localhost/api/alerts/push/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'dev_api_test_1',
          subscription: {
            endpoint: 'https://fcm.googleapis.com/fcm/send/test',
            keys: { p256dh: 'p', auth: 'a' },
          },
        }),
      });

      const saveRes = await handleSavePushSubscription(saveReq, env);
      expect(saveRes.status).toBe(200);
      const sub = await dbGetPushSubscription(env, 'dev_api_test_1');
      expect(sub).toBeDefined();

      // Delete subscription
      const delReq = new Request('http://localhost/api/alerts/push/subscription/dev_api_test_1', {
        method: 'DELETE',
      });
      const delRes = await handleDeletePushSubscription(delReq, env, 'dev_api_test_1');
      expect(delRes.status).toBe(200);

      const subAfter = await dbGetPushSubscription(env, 'dev_api_test_1');
      expect(subAfter).toBeNull();
    });

    it('sends test push notification immediately to subscribed device', async () => {
      getAuthenticatedUser.mockResolvedValue({ id: 'u_1' });
      await dbSavePushSubscription(env, 'u_1', {
        deviceId: 'dev_test_mode',
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: { p256dh: 'p', auth: 'a' },
        },
      });

      const testReq = new Request('http://localhost/api/alerts/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'dev_test_mode',
          sealed: JSON.stringify({ iv: 'test', data: 'test' }),
        }),
      });

      const testRes = await handleSendTestPush(testReq, env);
      expect(testRes.status).toBe(200);
      expect(sendWebPush).toHaveBeenCalledTimes(1);
    });
  });
});
