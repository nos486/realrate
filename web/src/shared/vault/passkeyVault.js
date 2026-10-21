/**
 * passkeyVault.js — The website's counterpart of the Android BiometricVault plugin
 *
 * Keeps one secret that only a passkey check can release: fingerprint, face, Windows Hello,
 * Touch ID, a phone nearby or a security key — whatever the browser offers. It uses the WebAuthn
 * PRF extension: the authenticator turns a stored random salt into 32 secret bytes only after the
 * user is verified, those bytes (through HKDF) are the AES-GCM key of the secret, and only the
 * ciphertext, the salt and the credential id are kept in this browser's localStorage. Nothing
 * goes to the server: the passkey here never signs in, it only opens the vault on this device.
 *
 * Same calls and error codes as BiometricVault (biometricUnlock.js picks one of the two):
 * isAvailable, has, store, retrieve, clear; CANCELED, NOT_STORED, INVALIDATED, UNSUPPORTED.
 */

import { e2eeEncrypt, e2eeDecrypt, bytesToBase64, base64ToBytes } from '../../lib/e2ee.js';
import { t } from '../../utils/i18n.js';

const STORE_KEY = 'realrate_passkey_vault';
const HKDF_INFO = 'realrate-vault-passkey-v1';
const TIMEOUT_MS = 120000;

function vaultError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function readEntry() {
  try {
    const entry = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    return entry?.credentialId && entry?.salt && entry?.data ? entry : null;
  } catch {
    return null;
  }
}

function writeEntry(entry) {
  try {
    if (entry) localStorage.setItem(STORE_KEY, JSON.stringify(entry));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    if (entry) throw vaultError('UNSUPPORTED', t('این مرورگر اجازه‌ی ذخیره روی دستگاه را نمی‌دهد.'));
  }
}

function webAuthnPresent() {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext !== false &&
    typeof window.PublicKeyCredential === 'function' &&
    typeof navigator?.credentials?.create === 'function' &&
    typeof navigator?.credentials?.get === 'function'
  );
}

/** A dismissed or timed-out browser prompt is a cancel, not an error */
function fromWebAuthnError(err) {
  if (err?.code) return err;
  if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') return vaultError('CANCELED', t('انصراف'));
  return vaultError('UNSUPPORTED', t('این مرورگر یا دستگاه از باز کردن با کلید عبور پشتیبانی نمی‌کند.'));
}

/** The PRF output → the AES-GCM key of the stored secret */
async function secretKey(prfOutput) {
  const subtle = globalThis.crypto.subtle;
  const base = await subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode(HKDF_INFO) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function prfFirst(credential) {
  const first = credential?.getClientExtensionResults?.()?.prf?.results?.first;
  return first ? new Uint8Array(first) : null;
}

/** Ask the authenticator for the PRF of `salt` with the given credential */
async function evaluatePrf(credentialId, salt) {
  let assertion;
  try {
    assertion = await navigator.credentials.get({
      publicKey: {
        challenge: globalThis.crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: credentialId }],
        userVerification: 'required',
        timeout: TIMEOUT_MS,
        extensions: { prf: { eval: { first: salt } } },
      },
    });
  } catch (err) {
    throw fromWebAuthnError(err);
  }
  return prfFirst(assertion);
}

/** A stable WebAuthn user handle per account: setting it up again replaces the same passkey */
async function userHandle(userId) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`realrate-vault:${userId}`));
  return new Uint8Array(digest).slice(0, 16);
}

export const PasskeyVault = {
  /** { available }: WebAuthn is there and the browser does not say it lacks PRF */
  async isAvailable() {
    if (!webAuthnPresent()) return { available: false };
    try {
      const caps = await window.PublicKeyCredential.getClientCapabilities?.();
      if (caps && caps['extension:prf'] === false) return { available: false };
    } catch {
      // Older browsers: PRF support shows only when the passkey is made
    }
    return { available: true };
  },

  /** { stored }: a secret is kept in this browser */
  async has() {
    return { stored: Boolean(readEntry()) };
  },

  /**
   * Make a passkey for this vault and keep `data` encrypted with its PRF output
   * @param {{ data: string, userId: string, title?: string }} options
   */
  async store({ data, userId, title }) {
    if (!webAuthnPresent()) throw vaultError('UNSUPPORTED', t('این مرورگر یا دستگاه از باز کردن با کلید عبور پشتیبانی نمی‌کند.'));
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(32));
    let credential;
    try {
      credential = await navigator.credentials.create({
        publicKey: {
          challenge: globalThis.crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: 'RealRate' },
          user: { id: await userHandle(userId || ''), name: title || 'RealRate', displayName: title || 'RealRate' },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
          timeout: TIMEOUT_MS,
          extensions: { prf: { eval: { first: salt } } },
        },
      });
    } catch (err) {
      throw fromWebAuthnError(err);
    }
    const credentialId = new Uint8Array(credential.rawId);
    const prf = credential.getClientExtensionResults?.()?.prf;
    if (!prf?.enabled && !prf?.results?.first) {
      throw vaultError('UNSUPPORTED', t('این کلید عبور از باز کردن اطلاعات رمزنگاری‌شده پشتیبانی نمی‌کند؛ مرورگر یا کلید دیگری را امتحان کنید.'));
    }
    // Some authenticators answer the PRF only on use, not when the passkey is made
    const output = prfFirst(credential) || (await evaluatePrf(credentialId, salt));
    if (!output) throw vaultError('UNSUPPORTED', t('این کلید عبور از باز کردن اطلاعات رمزنگاری‌شده پشتیبانی نمی‌کند؛ مرورگر یا کلید دیگری را امتحان کنید.'));
    writeEntry({
      v: 1,
      credentialId: bytesToBase64(credentialId),
      salt: bytesToBase64(salt),
      data: await e2eeEncrypt(await secretKey(output), String(data)),
    });
  },

  /** { data }: the secret, after the passkey check */
  async retrieve() {
    const entry = readEntry();
    if (!entry) throw vaultError('NOT_STORED', t('کلید عبور برای این مرورگر فعال نشده است.'));
    const output = await evaluatePrf(base64ToBytes(entry.credentialId), base64ToBytes(entry.salt));
    const plain = output ? await e2eeDecrypt(await secretKey(output), entry.data) : null;
    if (plain == null) {
      writeEntry(null);
      throw vaultError('INVALIDATED', t('کلید عبور دیگر کار نمی‌کند؛ یک بار با رمز باز کنید و دوباره فعال کنید.'));
    }
    return { data: typeof plain === 'string' ? plain : JSON.stringify(plain) };
  },

  async clear() {
    writeEntry(null);
  },
};
