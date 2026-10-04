/**
 * e2ee.js — Client-side Zero-Knowledge End-to-End Encryption (E2EE) Module
 *
 * Uses the Web Crypto API (crypto.subtle) available natively in all modern browsers.
 * Derives a 256-bit AES-GCM key from a user-provided passphrase using PBKDF2 with 100,000 rounds.
 * Zero-Knowledge guarantee: The plaintext passphrase and derived key NEVER leave the user's browser.
 */

const E2EE_PREFIX = "enc:e2ee:v1:";
const VERIFIER_SIGNATURE = "REALRATE_E2EE_VAULT_OK";

/**
 * Generate a cryptographically secure 16-byte random salt (base64)
 * @returns {string}
 */
export function generateE2eeSalt() {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (let i = 0; i < salt.byteLength; i++) {
    binary += String.fromCharCode(salt[i]);
  }
  return btoa(binary);
}

/**
 * Derive an AES-256-GCM CryptoKey from a passphrase and base64 salt using PBKDF2
 * @param {string} passphrase - User's private vault PIN / passphrase
 * @param {string} saltBase64 - 16-byte random salt from portfolio.e2eeSalt
 * @returns {Promise<CryptoKey>}
 */
export async function deriveE2eeKey(passphrase, saltBase64, { extractable = false } = {}) {
  if (!passphrase) throw new Error("رمز عبور گاوصندوق نمی‌تواند خالی باشد.");

  // Decode salt
  const saltBinary = atob(saltBase64 || "");
  const saltBytes = new Uint8Array(saltBinary.length);
  for (let i = 0; i < saltBinary.length; i++) {
    saltBytes[i] = saltBinary.charCodeAt(i);
  }

  const enc = new TextEncoder();
  const baseKey = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return await globalThis.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 100000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt a payload string or object with the derived E2EE key
 * Format: enc:e2ee:v1:<base64(iv_12_bytes + ciphertext + tag)>
 * @param {CryptoKey} key
 * @param {string|object} data
 * @returns {Promise<string>}
 */
export async function e2eeEncrypt(key, data) {
  const jsonStr = typeof data === "object" ? JSON.stringify(data) : String(data);
  const enc = new TextEncoder();
  const encoded = enc.encode(jsonStr);

  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ciphertextBuffer = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );

  const cipherBytes = new Uint8Array(ciphertextBuffer);
  const combined = new Uint8Array(iv.length + cipherBytes.length);
  combined.set(iv, 0);
  combined.set(cipherBytes, iv.length);

  let binary = "";
  for (let i = 0; i < combined.byteLength; i++) {
    binary += String.fromCharCode(combined[i]);
  }

  return `${E2EE_PREFIX}${btoa(binary)}`;
}

/**
 * Decrypt a cipher string that was encrypted with e2eeEncrypt
 * @param {CryptoKey} key
 * @param {string} cipherStr
 * @returns {Promise<any>}
 */
export async function e2eeDecrypt(key, cipherStr) {
  if (!cipherStr || typeof cipherStr !== "string" || !cipherStr.startsWith(E2EE_PREFIX)) {
    return cipherStr;
  }

  try {
    const b64 = cipherStr.slice(E2EE_PREFIX.length);
    const binary = atob(b64);
    const combined = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      combined[i] = binary.charCodeAt(i);
    }

    if (combined.length <= 12) return null;

    const iv = combined.slice(0, 12);
    const data = combined.slice(12);

    const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );

    const dec = new TextDecoder();
    const str = dec.decode(decryptedBuffer);

    if ((str.startsWith("{") && str.endsWith("}")) || (str.startsWith("[") && str.endsWith("]"))) {
      try {
        return JSON.parse(str);
      } catch {
        return str;
      }
    }
    return str;
  } catch {
    // Decryption failed (invalid key or tampered data)
    return null;
  }
}

/**
 * Create a verifier token to validate passphrases in the future without storing them
 * @param {CryptoKey} key
 * @returns {Promise<string>}
 */
export async function createE2eeVerifier(key) {
  return await e2eeEncrypt(key, VERIFIER_SIGNATURE);
}

/**
 * Validate whether a derived key correctly decrypts the portfolio's verifier token
 * @param {CryptoKey} key
 * @param {string} verifierStr
 * @returns {Promise<boolean>}
 */
export async function verifyE2eeKey(key, verifierStr) {
  if (!verifierStr) return false;
  const decrypted = await e2eeDecrypt(key, verifierStr);
  return decrypted === VERIFIER_SIGNATURE;
}

/**
 * Whether a value is a WebCrypto key (instanceof may fail across realms, so also duck-type)
 * @param {any} value
 * @returns {boolean}
 */
function isCryptoKeyLike(value) {
  if (!value || typeof value !== 'object') return false;
  if (typeof CryptoKey !== 'undefined' && value instanceof CryptoKey) return true;
  return Boolean(value.type && value.algorithm && value.usages);
}

/**
 * Encrypt holding sensitive attributes before sending to the server API
 * @param {CryptoKey} key
 * @param {object} holding
 * @returns {Promise<object>}
 */
export async function encryptHoldingForApi(arg1, arg2) {
  const isKey1 = isCryptoKeyLike(arg1);
  const key = isKey1 ? arg1 : arg2;
  const holding = isKey1 ? arg2 : arg1;

  // Checked on the resolved key itself: with a missing key in either position the other
  // argument (the holding) must never be mistaken for one and silently "encrypted" to null.
  if (!isCryptoKeyLike(key)) {
    throw new Error("کلید رمزنگاری معتبر نیست یا گاوصندوق باز نشده است.");
  }
  if (!holding || typeof holding !== 'object') {
    return holding;
  }

  const sensitiveBundle = {
    amount: Number(holding.amount) || 0,
    buyPrice: Number(holding.buyPrice) || 0,
    currentPrice: Number(holding.currentPrice) || 0,
    buyDate: holding.buyDate || "",
    notes: holding.notes || "",
    assetName: holding.assetName || holding.assetId || "",
    referenceAssetId: holding.referenceAssetId || "",
    referenceQuantity: Number(holding.referenceQuantity) || 0,
  };

  const encryptedBundle = await e2eeEncrypt(key, sensitiveBundle);

  return {
    ...holding,
    amount: 0,
    buyPrice: 0,
    currentPrice: 0,
    buyDate: "",
    notes: encryptedBundle,
    assetName: "[گاوصندوق E2EE]",
    referenceAssetId: "",
    referenceQuantity: 0,
  };
}

/**
 * Decrypt holding sensitive attributes after receiving from the server API
 * @param {CryptoKey|object} arg1
 * @param {object|CryptoKey} arg2
 * @returns {Promise<object>}
 */
export async function decryptHoldingFromApi(arg1, arg2) {
  const isKey1 = isCryptoKeyLike(arg1);
  const key = isKey1 ? arg1 : arg2;
  // Without a key in either slot, the holding is whichever argument is the plain object —
  // it must come back untouched, never swapped for the (missing) key.
  const holding = isKey1 ? arg2 : (isCryptoKeyLike(arg2) || arg1 ? arg1 : arg2);

  if (!isCryptoKeyLike(key) || !holding || typeof holding !== 'object') {
    return holding;
  }

  if (holding.notes && typeof holding.notes === "string" && holding.notes.startsWith(E2EE_PREFIX)) {
    const decrypted = await e2eeDecrypt(key, holding.notes);
    if (decrypted && typeof decrypted === "object") {
      return {
        ...holding,
        amount: decrypted.amount !== undefined ? decrypted.amount : holding.amount,
        buyPrice: decrypted.buyPrice !== undefined ? decrypted.buyPrice : holding.buyPrice,
        currentPrice: decrypted.currentPrice !== undefined ? decrypted.currentPrice : holding.currentPrice,
        buyDate: decrypted.buyDate !== undefined ? decrypted.buyDate : holding.buyDate,
        notes: decrypted.notes !== undefined ? decrypted.notes : "",
        assetName: decrypted.assetName || holding.assetName,
        referenceAssetId: decrypted.referenceAssetId || "",
        referenceQuantity: decrypted.referenceQuantity !== undefined ? decrypted.referenceQuantity : 0,
        isE2eeEncrypted: true,
      };
    }
  }
  return holding;
}

/**
 * Check if a holding contains client-side E2EE ciphertext
 * @param {object} holding
 * @returns {boolean}
 */
export function isHoldingE2eeEncrypted(holding) {
  return !!(holding && typeof holding.notes === "string" && holding.notes.startsWith(E2EE_PREFIX));
}

// ── Key wrapping (account vault) ─────────────────────────────────────────────
// The account vault uses a random data key, stored only "wrapped" (encrypted) with the key
// derived from the passphrase — so a passphrase change never re-encrypts any data. Every
// portfolio also gets its own random key, wrapped with the account data key; a portfolio's key
// can be handed out in a share link without exposing anything else.

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** A fresh random 256-bit key, as raw bytes */
export function generateRawKey() {
  return globalThis.crypto.getRandomValues(new Uint8Array(32));
}

/** Import raw key bytes as a (non-extractable) AES-GCM key */
export async function importRawKey(rawBytes) {
  return globalThis.crypto.subtle.importKey("raw", rawBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Raw bytes of an extractable key */
export async function exportRawKey(key) {
  return new Uint8Array(await globalThis.crypto.subtle.exportKey("raw", key));
}

/** Encrypt raw key bytes with another key (result is a normal E2EE cipher string) */
export async function wrapRawKey(wrappingKey, rawBytes) {
  return e2eeEncrypt(wrappingKey, { v: 1, k: bytesToBase64(rawBytes) });
}

/**
 * Decrypt a key wrapped by wrapRawKey. Returns null on a wrong key or tampered data (AES-GCM
 * authenticates, so a wrong passphrase can never yield a "wrong but valid" key).
 */
export async function unwrapRawKey(wrappingKey, wrapped) {
  const decoded = await e2eeDecrypt(wrappingKey, wrapped);
  if (!decoded || typeof decoded !== "object" || typeof decoded.k !== "string") return null;
  try {
    const bytes = base64ToBytes(decoded.k);
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

/** URL-safe base64 of raw key bytes (for a share link #fragment) */
export function rawKeyToLinkToken(rawBytes) {
  return bytesToBase64(rawBytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Inverse of rawKeyToLinkToken; null when the token is not a 256-bit key */
export function linkTokenToRawKey(token) {
  try {
    const b64 = String(token || "").replace(/-/g, "+").replace(/_/g, "/");
    const bytes = base64ToBytes(b64 + "===".slice((b64.length + 3) % 4));
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

export { bytesToBase64, base64ToBytes };

// ── Session Storage Key Helpers ──────────────────────────────────────────────
const STORAGE_PREFIX = "rr_e2ee_pass_";

export function saveVaultPassphraseToSession(portfolioId, passphrase) {
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${portfolioId}`, passphrase);
  } catch {}
}

export function getVaultPassphraseFromSession(portfolioId) {
  try {
    return sessionStorage.getItem(`${STORAGE_PREFIX}${portfolioId}`);
  } catch {
    return null;
  }
}

export function clearVaultPassphraseFromSession(portfolioId) {
  try {
    sessionStorage.removeItem(`${STORAGE_PREFIX}${portfolioId}`);
  } catch {}
}
