/**
 * crypto.js — AES-256-GCM encryption & decryption for portfolio data at rest
 *
 * Uses standard Web Crypto API (crypto.subtle) natively supported in Cloudflare Workers and Node 18+.
 * Derives a unique 256-bit AES-GCM key per user via HKDF-SHA256 from a master secret.
 */

// Master secret fallback for local dev / unconfigured environments
const DEFAULT_MASTER_SECRET = "realrate-portfolio-aes256-master-key-v1-secure";
const HKDF_SALT = new TextEncoder().encode("realrate-d1-portfolio-salt-v1");

// In-memory key cache to avoid re-deriving user keys on every row during a single request
const userKeyCache = new Map();

/**
 * Derives a CryptoKey for AES-256-GCM specific to a given userId
 * @param {string} masterSecret - Master secret from env.PORTFOLIO_ENCRYPTION_SECRET
 * @param {string} userId - User identifier (id or email)
 * @returns {Promise<CryptoKey>}
 */
export async function deriveUserKey(masterSecret, userId) {
  const secret = String(masterSecret || DEFAULT_MASTER_SECRET);
  const uid = String(userId || "default-user");
  const cacheKey = `${secret}:${uid}`;

  if (userKeyCache.has(cacheKey)) {
    return userKeyCache.get(cacheKey);
  }

  const enc = new TextEncoder();
  const masterKeyBytes = enc.encode(secret);
  const infoBytes = enc.encode(`realrate:user:portfolio:${uid}`);

  const baseKey = await crypto.subtle.importKey(
    "raw",
    masterKeyBytes,
    { name: "HKDF" },
    false,
    ["deriveKey"]
  );

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: HKDF_SALT,
      info: infoBytes,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  // Keep cache small (max 500 keys in worker isolate)
  if (userKeyCache.size > 500) {
    userKeyCache.clear();
  }
  userKeyCache.set(cacheKey, derivedKey);

  return derivedKey;
}

/**
 * Encrypt a string or JSON-serializable object with AES-256-GCM
 * Output format: "enc:v1:<base64(iv_12_bytes + ciphertext + tag)>"
 * @param {CryptoKey} key
 * @param {string|object} plaintextOrObject
 * @returns {Promise<string>}
 */
export async function encryptField(key, plaintextOrObject) {
  if (plaintextOrObject === null || plaintextOrObject === undefined) return "";
  const plaintext = typeof plaintextOrObject === "object"
    ? JSON.stringify(plaintextOrObject)
    : String(plaintextOrObject);

  if (!plaintext) return "";

  const enc = new TextEncoder();
  const data = enc.encode(plaintext);

  // 12 bytes IV is standard for AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  const encryptedBytes = new Uint8Array(encryptedBuffer);

  // Combine IV (12 bytes) + ciphertext + auth tag
  const combined = new Uint8Array(iv.length + encryptedBytes.length);
  combined.set(iv, 0);
  combined.set(encryptedBytes, iv.length);

  // Base64 encode
  let binary = "";
  const len = combined.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  const b64 = btoa(binary);

  return `enc:v1:${b64}`;
}

/**
 * Decrypt a value that was encrypted with encryptField
 * If the value is not encrypted (e.g. legacy plain text / number), returns it as-is.
 * @param {CryptoKey} key
 * @param {string|any} cipherValue
 * @returns {Promise<string|object|any>}
 */
export async function decryptField(key, cipherValue) {
  if (typeof cipherValue !== "string" || !cipherValue.startsWith("enc:v1:")) {
    return cipherValue;
  }

  try {
    const b64 = cipherValue.slice("enc:v1:".length);
    const binary = atob(b64);
    const combined = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      combined[i] = binary.charCodeAt(i);
    }

    if (combined.length <= 12) {
      console.warn("Ciphertext too short for AES-GCM IV");
      return "";
    }

    const iv = combined.slice(0, 12);
    const ciphertextWithTag = combined.slice(12);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertextWithTag
    );

    const dec = new TextDecoder();
    const decryptedStr = dec.decode(decryptedBuffer);

    // Try parsing as JSON if it looks like object/array
    if ((decryptedStr.startsWith("{") && decryptedStr.endsWith("}")) ||
        (decryptedStr.startsWith("[") && decryptedStr.endsWith("]"))) {
      try {
        return JSON.parse(decryptedStr);
      } catch (e) {
        return decryptedStr;
      }
    }

    return decryptedStr;
  } catch (err) {
    console.error("AES-GCM decryption error:", err);
    return "";
  }
}
