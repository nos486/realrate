/**
 * sealedPush.js — Sealed Web Push domain logic and cryptographic operations
 *
 * Pure crypto and validation for end-to-end sealed push notifications:
 * 1. AES-GCM (256-bit) per-device sealing and unsealing using WebCrypto
 * 2. Pure decrypt fallback logic used by the service worker (sw.js)
 * 3. Input validation for push subscriptions and sealed push reminder uploads
 *
 * The server only ever sees the opaque sealed ciphertext and fire date, never the plaintext.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEVICE_ID_RE = /^[a-zA-Z0-9_\-.]{8,64}$/;
const PUSH_KINDS = ['loan', 'cheque'];
const PUSH_REASONS = ['due', 'overdue'];
/** Each lead day has its own reason ("lead:3", "lead:1"): one row per notification */
const LEAD_REASON_RE = /^lead:([1-9]|[12]\d|30)$/;

/**
 * Base64 encode a Uint8Array
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function uint8ToBase64(bytes) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Base64 decode to a Uint8Array
 * @param {string} b64
 * @returns {Uint8Array}
 */
export function base64ToUint8(b64) {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generates a random AES-GCM 256-bit key (non-extractable by default).
 * @param {boolean} [extractable=false]
 * @returns {Promise<CryptoKey>}
 */
export async function generateSealingKey(extractable = false) {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a notification payload object with an AES-GCM key. Pure.
 * Returns an opaque JSON string: { iv: base64, data: base64 }.
 *
 * @param {CryptoKey} key
 * @param {object} payload - { title, body, path, tag }
 * @returns {Promise<string>}
 */
export async function sealPayload(key, payload) {
  if (!key) throw new Error('Sealing key is required');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  return JSON.stringify({
    iv: uint8ToBase64(iv),
    data: uint8ToBase64(new Uint8Array(cipherBuffer)),
  });
}

/**
 * Decrypts a sealed JSON string with an AES-GCM key. Pure.
 *
 * @param {CryptoKey} key
 * @param {string} sealedString
 * @returns {Promise<object>}
 */
export async function unsealPayload(key, sealedString) {
  if (!key) throw new Error('Unsealing key is required');
  if (typeof sealedString !== 'string' || !sealedString) {
    throw new Error('Invalid sealed payload string');
  }
  const parsed = JSON.parse(sealedString);
  if (!parsed.iv || !parsed.data) {
    throw new Error('Sealed payload missing iv or data');
  }
  const iv = base64ToUint8(parsed.iv);
  const data = base64ToUint8(parsed.data);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}

/**
 * Pure fallback decryptor used by service worker (sw.js).
 * Decrypts the raw text with key, returning standard notification options.
 * If key is missing or decryption fails, returns generic fallback without throwing.
 *
 * @param {object} params
 * @param {string} [params.rawText]
 * @param {CryptoKey|null} [params.key]
 * @returns {Promise<{ title: string, body: string, path: string, tag?: string, isFallback: boolean }>}
 */
export async function decryptNotificationPayload({ rawText = '', key = null } = {}) {
  const fallback = {
    title: 'یادآوری سررسید',
    body: 'یک سررسید امروز دارید',
    path: '/',
    isFallback: true,
  };

  if (!rawText || !key) return fallback;

  try {
    const unsealed = await unsealPayload(key, rawText);
    if (!unsealed || typeof unsealed !== 'object') return fallback;

    return {
      title: unsealed.title || fallback.title,
      body: unsealed.body || fallback.body,
      path: unsealed.path || fallback.path,
      tag: unsealed.tag,
      isFallback: false,
    };
  } catch {
    return fallback;
  }
}

/**
 * Validates push subscription registration input.
 * @param {object} input
 * @returns {{ value?: { deviceId: string, subscription: object }, error?: string }}
 */
export function validatePushSubscriptionInput(input) {
  if (!input || typeof input !== 'object') {
    return { error: 'داده‌های اشتراک اعلان معتبر نیست.' };
  }

  const deviceId = String(input.deviceId || '').trim();
  if (!DEVICE_ID_RE.test(deviceId)) {
    return { error: 'شناسه دستگاه نامعتبر است.' };
  }

  const sub = input.subscription;
  if (!sub || typeof sub !== 'object') {
    return { error: 'مشخصات اشتراک مرورگر الزامی است.' };
  }

  const endpoint = String(sub.endpoint || '').trim();
  if (!endpoint || !endpoint.startsWith('https://') || endpoint.length > 1024) {
    return { error: 'آدرس اشتراک اعلان (endpoint) نامعتبر است.' };
  }

  const keys = sub.keys;
  if (!keys || typeof keys !== 'object') {
    return { error: 'کلیدهای رمزنگاری اشتراک الزامی است.' };
  }

  const p256dh = String(keys.p256dh || '').trim();
  const auth = String(keys.auth || '').trim();
  if (!p256dh || !auth) {
    return { error: 'کلیدهای p256dh و auth الزامی هستند.' };
  }

  return {
    value: {
      deviceId,
      subscription: {
        endpoint,
        expirationTime: sub.expirationTime || null,
        keys: { p256dh, auth },
      },
    },
  };
}

/**
 * Validates an upload of sealed push reminder items.
 * @param {object} input
 * @returns {{ value?: { deviceId: string, items: Array }, error?: string }}
 */
export function validatePushRemindersInput(input) {
  if (!input || typeof input !== 'object') {
    return { error: 'ورودی یادآوری‌های اعلان نامعتبر است.' };
  }

  const deviceId = String(input.deviceId || '').trim();
  if (!DEVICE_ID_RE.test(deviceId)) {
    return { error: 'شناسه دستگاه نامعتبر است.' };
  }

  if (!Array.isArray(input.items)) {
    return { error: 'لیست موارد باید آرایه باشد.' };
  }

  if (input.items.length > 64) {
    return { error: 'حداکثر ۶۴ مورد در یک درخواست قابل ثبت است.' };
  }

  const validatedItems = [];
  for (let idx = 0; idx < input.items.length; idx++) {
    const item = input.items[idx];
    if (!item || typeof item !== 'object') {
      return { error: `مورد ${idx + 1} نامعتبر است.` };
    }

    const kind = String(item.kind || '').trim();
    if (!PUSH_KINDS.includes(kind)) {
      return { error: `نوع مورد ${idx + 1} نامعتبر است.` };
    }

    const recordId = String(item.recordId || '').trim();
    if (!recordId || recordId.length > 64) {
      return { error: `شناسه رکورد مورد ${idx + 1} نامعتبر است.` };
    }

    const dueDate = String(item.dueDate || '').trim();
    if (!ISO_DATE_RE.test(dueDate)) {
      return { error: `تاریخ سررسید مورد ${idx + 1} نامعتبر است.` };
    }

    const reason = String(item.reason || '').trim();
    if (!PUSH_REASONS.includes(reason) && !LEAD_REASON_RE.test(reason)) {
      return { error: `علت اعلان مورد ${idx + 1} نامعتبر است.` };
    }

    const fireDate = String(item.fireDate || '').trim();
    if (!ISO_DATE_RE.test(fireDate)) {
      return { error: `تاریخ ارسال اعلان مورد ${idx + 1} نامعتبر است.` };
    }

    const sealed = String(item.sealed || '').trim();
    if (!sealed || sealed.length > 4096) {
      return { error: `بسته رمزنگاری‌شده مورد ${idx + 1} نامعتبر یا بیش از حد بزرگ است.` };
    }

    // Ensure sealed is a JSON with iv and data
    try {
      const parsed = JSON.parse(sealed);
      if (!parsed.iv || !parsed.data) {
        return { error: `بسته رمزنگاری‌شده مورد ${idx + 1} باید شامل iv و data باشد.` };
      }
    } catch {
      return { error: `فرمت بسته رمزنگاری‌شده مورد ${idx + 1} نامعتبر است.` };
    }

    validatedItems.push({
      kind,
      recordId,
      dueDate,
      reason,
      fireDate,
      sealed,
    });
  }

  return {
    value: {
      deviceId,
      items: validatedItems,
    },
  };
}
