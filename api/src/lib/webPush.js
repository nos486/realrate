/**
 * webPush.js — Web Push RFC 8291 / RFC 8292 delivery using WebCrypto
 *
 * Sends encrypted push notifications via @block65/webcrypto-web-push, compatible
 * with Cloudflare Workers native crypto.subtle. Zero-knowledge: the server treats
 * the sealed payload as opaque ciphertext.
 */

import { buildPushPayload } from '@block65/webcrypto-web-push';
import { logger } from './logger.js';

export function isWebPushConfigured(env) {
  return Boolean(env?.VAPID_PUBLIC_KEY && env?.VAPID_PRIVATE_KEY);
}

/**
 * Send an encrypted Web Push notification.
 * @param {object} env
 * @param {object} params
 * @param {object|string} params.subscription
 * @param {string} params.data - The payload string (opaque ciphertext for sealed push)
 * @param {number} [params.ttl=86400]
 * @returns {Promise<{ success: boolean, expired?: boolean, status?: number, error?: string }>}
 */
export async function sendWebPush(env, { subscription, data, ttl = 86400 }) {
  if (!isWebPushConfigured(env)) {
    return { success: false, error: 'Web Push is not configured on this server' };
  }

  const sub = typeof subscription === 'string' ? JSON.parse(subscription) : subscription;
  if (!sub || !sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return { success: false, error: 'Invalid subscription object' };
  }

  const vapid = {
    subject: env.VAPID_SUBJECT || 'mailto:support@realrate.ir',
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };

  const message = {
    data: String(data || ''),
    options: { ttl },
  };

  try {
    const payload = await buildPushPayload(message, sub, vapid);
    const fetchFn = env?.fetch || globalThis.fetch;
    const res = await fetchFn(sub.endpoint, payload);

    if (res.status >= 200 && res.status < 300) {
      return { success: true, status: res.status };
    }

    if (res.status === 404 || res.status === 410) {
      return { success: false, expired: true, status: res.status };
    }

    return { success: false, status: res.status, error: `Push service returned ${res.status}` };
  } catch (err) {
    logger.warn('[WebPush] Send failed:', { error: err.message });
    return { success: false, error: err.message };
  }
}
