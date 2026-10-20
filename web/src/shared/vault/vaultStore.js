/**
 * vaultStore.js — Account-wide end-to-end encryption state (browser only)
 *
 * Key hierarchy:
 *   passphrase ──PBKDF2──▶ KEK ──unwraps──▶ account data key (random, stored wrapped on the server)
 *   account data key ──unwraps──▶ each portfolio's own key (stored wrapped on the portfolio)
 *   account data key ──encrypts──▶ vault records (loans, incomes)
 *
 * The passphrase and every unwrapped key stay in this tab. The unwrapped data key is kept in
 * sessionStorage (like the per-portfolio passphrase was before) so a reload doesn't ask again;
 * locking, logging out or the idle limit (autoLock.js) clears it, and a kept key last used
 * longer ago than that limit is not restored.
 *
 * KDF cost: the salt names its PBKDF2 rounds (lib/e2ee.js). A vault whose salt is from before
 * KDF_ITERATIONS is re-wrapped with a new salt on its next passphrase unlock (the data key and
 * the records stay the same).
 */

import { intlLocale, t } from '../../utils/i18n.js';
import {
  deriveE2eeKey,
  generateE2eeSalt,
  isLegacyE2eeSalt,
  generateRawKey,
  importRawKey,
  wrapRawKey,
  unwrapRawKey,
  e2eeEncrypt,
  e2eeDecrypt,
  e2eeDecryptMany,
  bytesToBase64,
  base64ToBytes,
} from '../../lib/e2ee.js';
import { getVault, saveVault, resetVaultData, configureVaultApi } from './vaultApi.js';
import { armAutoLock, disarmAutoLock, isPastAutoLock } from './autoLock.js';
import {
  configureOffline,
  startOffline,
  stopOffline,
  VAULT_CHANGED_EVENT,
} from '../offline/offlineSync.js';

// The device keeps an encrypted copy of the records (the Android app and the website: fast
// screens, and offline); when a sync brings changes, screens holding records read them again
configureOffline({ isEnabled: () => true });
if (typeof window !== 'undefined') {
  window.addEventListener(VAULT_CHANGED_EVENT, () => bumpVaultEpoch());
}
// Records name the vault they were encrypted for; a vault reset on another device makes this
// tab's key stale, so the vault is loaded again (the setup screen then shows)
configureVaultApi({
  epoch: () => state.vault?.createdAt || '',
  onGone: () => {
    if (state.userId) loadVault(state.userId, { force: true });
  },
});

export const VAULT_MIN_PASSPHRASE_LENGTH = 8;
const SESSION_KEY = 'rr_vault_session';
/** On this device, a vault re-wrapped for the KDF cost: { userId, from, to } wrapped keys */
const REWRAP_KEY = 'rr_vault_rewrap';

/**
 * @typedef {'idle'|'loading'|'off'|'locked'|'unlocked'|'error'} VaultStatus
 */
let state = { status: 'idle', vault: null, error: null, epoch: 0, userId: null };
let dataKey = null;
// The unwrapped data key (base64), for the Android app's fingerprint unlock (biometricUnlock.js)
let rawKeyB64 = null;
let loadPromise = null;
const portfolioKeys = new Map(); // wrapped key → { key, raw }
const listeners = new Set();

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

export function subscribeVault(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getVaultState() {
  return state;
}

/** Vault on for this account (locked or not) — every feature must then use encrypted storage */
export function isVaultOn() {
  return state.status === 'locked' || state.status === 'unlocked';
}

export function isVaultUnlocked() {
  return state.status === 'unlocked' && Boolean(dataKey);
}

/** Data changed shape (migration, lock/unlock): screens holding fetched data should reload */
export function bumpVaultEpoch() {
  setState({ epoch: state.epoch + 1 });
}

export class VaultLockedError extends Error {
  constructor() {
    super(t('رمزنگاری سرتاسری حساب قفل است؛ ابتدا با رمز عبور آن را باز کنید.'));
    this.name = 'VaultLockedError';
    this.code = 'VAULT_LOCKED';
  }
}

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

function writeSession(value) {
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Private mode etc. — the vault simply asks for the passphrase again after a reload
  }
}

async function setUnlocked(raw, vault) {
  dataKey = await importRawKey(raw);
  rawKeyB64 = bytesToBase64(raw);
  portfolioKeys.clear();
  const session = { userId: state.userId, wrappedKey: vault.wrappedKey, key: bytesToBase64(raw), activeAt: Date.now() };
  writeSession(session);
  setState({ status: 'unlocked', vault, error: null, epoch: state.epoch + 1 });
  armAutoLock({
    onExpire: () => lockAll(),
    onActivity: (at) => {
      if (rawKeyB64 === session.key) writeSession({ ...session, activeAt: at });
    },
  });
}

/**
 * Load the account's vault state (once per user). Restores an unlocked session when this tab
 * already unlocked the same vault.
 */
export function loadVault(userId, { force = false } = {}) {
  if (!userId) return Promise.resolve(state);
  if (!force && state.userId === userId && state.status !== 'idle' && state.status !== 'error') {
    return loadPromise || Promise.resolve(state);
  }
  if (state.userId !== userId) {
    dataKey = null;
    rawKeyB64 = null;
    portfolioKeys.clear();
  }
  setState({ status: state.status === 'unlocked' && state.userId === userId ? 'unlocked' : 'loading', userId, error: null });

  // The device's copy first (the vault itself is remembered there, for offline unlocking)
  loadPromise = startOffline(userId)
    .catch(() => {})
    .then(() => getVault())
    .then(async (res) => {
      const vault = res?.vault || null;
      if (!vault) {
        dataKey = null;
        writeSession(null);
        // Encryption is mandatory: an account without data sets it up before anything else
        setState({ status: 'off', vault: null });
        return state;
      }
      if (dataKey && state.vault?.wrappedKey === vault.wrappedKey) {
        setState({ status: 'unlocked', vault });
        return state;
      }
      const session = readSession();
      if (session && session.userId === userId && session.wrappedKey === vault.wrappedKey && session.key && !isPastAutoLock(session.activeAt)) {
        try {
          await setUnlocked(base64ToBytes(session.key), vault);
          return state;
        } catch {
          writeSession(null);
        }
      }
      dataKey = null;
      rawKeyB64 = null;
      setState({ status: 'locked', vault });
      return state;
    })
    .catch((err) => {
      // An API without vault support yet (the site can deploy before the worker) means no
      // account can have a vault — treat it as off instead of blocking every data screen.
      if (err?.status === 404) {
        setState({ status: 'off', vault: null });
        return state;
      }
      setState({ status: 'error', error: err.message || t('خطا در دریافت وضعیت رمزنگاری') });
      return state;
    })
    .finally(() => {
      loadPromise = null;
    });
  return loadPromise;
}

/** @returns {Promise<boolean>} false when the passphrase is wrong */
export async function unlockVault(passphrase) {
  const vault = state.vault;
  if (!vault) throw new Error(t('رمزنگاری سرتاسری برای این حساب فعال نیست.'));
  const kek = await deriveE2eeKey(String(passphrase || ''), vault.salt);
  const raw = await unwrapRawKey(kek, vault.wrappedKey);
  if (!raw) return false;
  await setUnlocked(raw, vault);
  if (isLegacyE2eeSalt(vault.salt)) await upgradeVaultKdf(String(passphrase || ''), raw, vault);
  return true;
}

/**
 * Re-wrap the data key under a salt of today's KDF cost (the passphrase was just given). Best
 * effort: offline, or another device got there first, it is simply tried on a later unlock.
 */
async function upgradeVaultKdf(passphrase, raw, vault) {
  try {
    const salt = generateE2eeSalt();
    const wrappedKey = await wrapRawKey(await deriveE2eeKey(passphrase, salt), raw);
    const res = await saveVault({ salt, wrappedKey, previousWrappedKey: vault.wrappedKey });
    if (!res?.vault) return;
    // The fingerprint unlock still holds the same data key under the old wrapping: let it in once
    writeRewrap({ userId: state.userId, from: vault.wrappedKey, to: res.vault.wrappedKey });
    await setUnlocked(raw, res.vault);
  } catch {
    // Kept as it was
  }
}

function writeRewrap(value) {
  try {
    localStorage.setItem(REWRAP_KEY, JSON.stringify(value));
  } catch {
    // The fingerprint unlock then asks for the passphrase once
  }
}

/** Whether `wrappedKey` is the old wrapping of this vault before its KDF re-wrap on this device */
function isRewrapOf(wrappedKey, vault) {
  try {
    const rewrap = JSON.parse(localStorage.getItem(REWRAP_KEY) || 'null');
    return Boolean(rewrap && rewrap.userId === state.userId && rewrap.from === wrappedKey && rewrap.to === vault.wrappedKey);
  } catch {
    return false;
  }
}

/**
 * What the fingerprint unlock keeps (Android app): the unlocked data key, tied to this account and
 * this wrapping of it (a changed passphrase asks to set the fingerprint up again)
 * @returns {{ userId: string, wrappedKey: string, key: string }|null} null while locked
 */
export function getVaultUnlockSecret() {
  if (!isVaultUnlocked() || !rawKeyB64 || !state.vault) return null;
  return { userId: state.userId, wrappedKey: state.vault.wrappedKey, key: rawKeyB64 };
}

/**
 * Unlock with a secret from getVaultUnlockSecret()
 * @returns {Promise<boolean>} false when it is not for this account's current vault
 */
export async function unlockVaultWithSecret(secret) {
  const vault = state.vault;
  if (!vault || !secret?.key || secret.userId !== state.userId) return false;
  if (secret.wrappedKey !== vault.wrappedKey && !isRewrapOf(secret.wrappedKey, vault)) return false;
  await setUnlocked(base64ToBytes(secret.key), vault);
  return true;
}

export function lockVault() {
  disarmAutoLock();
  rawKeyB64 = null;
  dataKey = null;
  portfolioKeys.clear();
  writeSession(null);
  if (state.vault) setState({ status: 'locked', epoch: state.epoch + 1 });
}

export const LOCK_ALL_EVENT = 'realrate:vault-lock-all';
/**
 * Lock everything in this tab at once: the account vault and every portfolio key unwrapped with
 * it. Screens holding a key listen for LOCK_ALL_EVENT.
 */
export function lockAll() {
  disarmAutoLock();
  rawKeyB64 = null;
  dataKey = null;
  portfolioKeys.clear();
  writeSession(null);
  setState({
    status: state.vault ? 'locked' : state.status,
    epoch: state.epoch + 1,
  });
  window.dispatchEvent(new Event(LOCK_ALL_EVENT));
}

/** Forget everything (logout), the device's copy included */
export function resetVault() {
  disarmAutoLock();
  stopOffline({ clear: true }).catch(() => {});
  rawKeyB64 = null;
  dataKey = null;
  portfolioKeys.clear();
  loadPromise = null;
  writeSession(null);
  setState({ status: 'idle', vault: null, error: null, userId: null, epoch: state.epoch + 1 });
}

/**
 * Forgotten passphrase: delete the vault and every financial record of the account (server), and
 * this device's copy, then load the vault again — the account sets up a new one like a new
 * account. Nothing encrypted can be recovered.
 * @param {{ password?: string }} options the account password, when the account has one
 */
export async function resetAccountVault({ password } = {}) {
  const userId = state.userId;
  await resetVaultData({ password });
  disarmAutoLock();
  await stopOffline({ clear: true }).catch(() => {});
  rawKeyB64 = null;
  dataKey = null;
  portfolioKeys.clear();
  loadPromise = null;
  writeSession(null);
  setState({ status: 'loading', vault: null, epoch: state.epoch + 1 });
  return loadVault(userId, { force: true });
}

function assertPassphrase(passphrase) {
  if (String(passphrase || '').length < VAULT_MIN_PASSPHRASE_LENGTH) {
    throw new Error(t('رمز عبور رمزنگاری باید حداقل {n} کاراکتر باشد.', { n: VAULT_MIN_PASSPHRASE_LENGTH.toLocaleString(intlLocale()) }));
  }
}

/**
 * Create the account vault (the first portfolio comes with it: defaultPortfolio.js). The vault
 * is unlocked right away with the new key.
 */
export async function createVault(passphrase) {
  assertPassphrase(passphrase);
  const salt = generateE2eeSalt();
  const kek = await deriveE2eeKey(passphrase, salt);
  const raw = generateRawKey();
  const wrappedKey = await wrapRawKey(kek, raw);
  const res = await saveVault({ salt, wrappedKey });
  await setUnlocked(raw, res.vault);
  return res.vault;
}

/** Re-wrap the data key with a new passphrase — no data is re-encrypted */
export async function changeVaultPassphrase(currentPassphrase, newPassphrase) {
  assertPassphrase(newPassphrase);
  const vault = state.vault;
  if (!vault) throw new Error(t('رمزنگاری سرتاسری برای این حساب فعال نیست.'));
  const oldKek = await deriveE2eeKey(String(currentPassphrase || ''), vault.salt);
  const raw = await unwrapRawKey(oldKek, vault.wrappedKey);
  if (!raw) throw new Error(t('رمز عبور فعلی نادرست است.'));

  const salt = generateE2eeSalt();
  const newKek = await deriveE2eeKey(newPassphrase, salt);
  const wrappedKey = await wrapRawKey(newKek, raw);
  const res = await saveVault({ salt, wrappedKey, previousWrappedKey: vault.wrappedKey });
  await setUnlocked(raw, res.vault);
}

function requireDataKey() {
  if (!dataKey) throw new VaultLockedError();
  return dataKey;
}

/** Encrypt a record (loan document, income, ...) with the account data key */
export async function encryptVaultRecord(value) {
  return e2eeEncrypt(requireDataKey(), value);
}

/** Decrypt a vault record; null when it can't be decrypted */
export async function decryptVaultRecord(payload) {
  const value = await e2eeDecrypt(requireDataKey(), payload);
  return value && typeof value === 'object' ? value : null;
}

/** Decrypt many vault records in batches; one entry per payload, null where one can't be decrypted */
export async function decryptVaultRecords(payloads) {
  const values = await e2eeDecryptMany(requireDataKey(), payloads);
  return values.map((value) => (value && typeof value === 'object' ? value : null));
}

// ── Portfolio keys ──────────────────────────────────────────────────────────

/** A portfolio whose key is managed by the account vault */
export function isAccountVaultPortfolio(portfolio) {
  return Boolean(portfolio?.e2eeWrappedKey);
}

async function unwrapPortfolioKey(wrapped) {
  const cached = portfolioKeys.get(wrapped);
  if (cached) return cached;
  const raw = await unwrapRawKey(requireDataKey(), wrapped);
  if (!raw) return null;
  const entry = { key: await importRawKey(raw), raw };
  portfolioKeys.set(wrapped, entry);
  return entry;
}

/** The portfolio's key (CryptoKey), or null when locked / not an account-vault portfolio */
export async function getPortfolioKey(portfolio) {
  if (!isAccountVaultPortfolio(portfolio) || !dataKey) return null;
  return (await unwrapPortfolioKey(portfolio.e2eeWrappedKey))?.key || null;
}

/** Raw bytes of the portfolio's key (for a share link), or null */
export async function getPortfolioRawKey(portfolio) {
  if (!isAccountVaultPortfolio(portfolio) || !dataKey) return null;
  return (await unwrapPortfolioKey(portfolio.e2eeWrappedKey))?.raw || null;
}

/** Wrap raw portfolio key bytes with the account data key */
export async function wrapPortfolioKey(raw) {
  return wrapRawKey(requireDataKey(), raw);
}

/** A fresh portfolio key, already wrapped for storage */
export async function createPortfolioKey() {
  const raw = generateRawKey();
  const wrapped = await wrapPortfolioKey(raw);
  const entry = { key: await importRawKey(raw), raw };
  portfolioKeys.set(wrapped, entry);
  return { wrapped, key: entry.key, raw };
}
