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
export async function deriveE2eeKey(passphrase, saltBase64) {
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
    false,
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
      } catch (e) {
        return str;
      }
    }
    return str;
  } catch (err) {
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
 * Encrypt holding sensitive attributes before sending to the server API
 * @param {CryptoKey} key
 * @param {object} holding
 * @returns {Promise<object>}
 */
export async function encryptHoldingForApi(key, holding) {
  const sensitiveBundle = {
    amount: Number(holding.amount) || 0,
    buyPrice: Number(holding.buyPrice) || 0,
    currentPrice: Number(holding.currentPrice) || 0,
    buyDate: holding.buyDate || "",
    notes: holding.notes || "",
    assetName: holding.assetName || holding.assetId || "",
  };

  const encryptedBundle = await e2eeEncrypt(key, sensitiveBundle);

  return {
    ...holding,
    amount: 0,
    buyPrice: 0,
    currentPrice: 0,
    buyDate: "",
    notes: encryptedBundle,
    assetName: "[🔐 گاوصندوق E2EE]",
  };
}

/**
 * Decrypt holding sensitive attributes after receiving from the server API
 * @param {CryptoKey} key
 * @param {object} holding
 * @returns {Promise<object>}
 */
export async function decryptHoldingFromApi(key, holding) {
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

// ── Session Storage Key Helpers ──────────────────────────────────────────────
const STORAGE_PREFIX = "rr_e2ee_pass_";

export function saveVaultPassphraseToSession(portfolioId, passphrase) {
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${portfolioId}`, passphrase);
  } catch (e) {}
}

export function getVaultPassphraseFromSession(portfolioId) {
  try {
    return sessionStorage.getItem(`${STORAGE_PREFIX}${portfolioId}`);
  } catch (e) {
    return null;
  }
}

export function clearVaultPassphraseFromSession(portfolioId) {
  try {
    sessionStorage.removeItem(`${STORAGE_PREFIX}${portfolioId}`);
  } catch (e) {}
}
