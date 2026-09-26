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
 * locking or logging out clears it.
 */

import {
  deriveE2eeKey,
  generateE2eeSalt,
  generateRawKey,
  importRawKey,
  wrapRawKey,
  unwrapRawKey,
  e2eeEncrypt,
  e2eeDecrypt,
  bytesToBase64,
  base64ToBytes,
} from '../../lib/e2ee.js';
import { getVault, saveVault } from './vaultApi.js';

export const VAULT_MIN_PASSPHRASE_LENGTH = 8;
const SESSION_KEY = 'rr_vault_session';

/**
 * @typedef {'idle'|'loading'|'off'|'locked'|'unlocked'|'error'} VaultStatus
 */
let state = { status: 'idle', vault: null, error: null, epoch: 0, userId: null, legacyUnlocked: false, hasPlaintextData: false };
let dataKey = null;
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
    super('رمزنگاری سرتاسری حساب قفل است؛ ابتدا با رمز عبور آن را باز کنید.');
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
  portfolioKeys.clear();
  writeSession({ userId: state.userId, wrappedKey: vault.wrappedKey, key: bytesToBase64(raw) });
  setState({ status: 'unlocked', vault, error: null, epoch: state.epoch + 1 });
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
    portfolioKeys.clear();
  }
  setState({ status: state.status === 'unlocked' && state.userId === userId ? 'unlocked' : 'loading', userId, error: null });

  loadPromise = getVault()
    .then(async (res) => {
      const vault = res?.vault || null;
      if (!vault) {
        dataKey = null;
        writeSession(null);
        // Encryption is mandatory: an account without data sets it up before anything else
        setState({ status: 'off', vault: null, hasPlaintextData: Boolean(res?.hasPlaintextData) });
        return state;
      }
      if (dataKey && state.vault?.wrappedKey === vault.wrappedKey) {
        setState({ status: 'unlocked', vault });
        return state;
      }
      const session = readSession();
      if (session && session.userId === userId && session.wrappedKey === vault.wrappedKey && session.key) {
        try {
          await setUnlocked(base64ToBytes(session.key), vault);
          return state;
        } catch {
          writeSession(null);
        }
      }
      dataKey = null;
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
      setState({ status: 'error', error: err.message || 'خطا در دریافت وضعیت رمزنگاری' });
      return state;
    })
    .finally(() => {
      loadPromise = null;
    });
  return loadPromise;
}

/** Wait until the vault state is known (not idle/loading) */
export async function whenVaultReady() {
  if (loadPromise) await loadPromise;
  return state;
}

/** @returns {Promise<boolean>} false when the passphrase is wrong */
export async function unlockVault(passphrase) {
  const vault = state.vault;
  if (!vault) throw new Error('رمزنگاری سرتاسری برای این حساب فعال نیست.');
  const kek = await deriveE2eeKey(String(passphrase || ''), vault.salt);
  const raw = await unwrapRawKey(kek, vault.wrappedKey);
  if (!raw) return false;
  await setUnlocked(raw, vault);
  return true;
}

export function lockVault() {
  dataKey = null;
  portfolioKeys.clear();
  writeSession(null);
  if (state.vault) setState({ status: 'locked', epoch: state.epoch + 1 });
}

export const LOCK_ALL_EVENT = 'realrate:vault-lock-all';
const LEGACY_PASS_PREFIX = 'rr_e2ee_pass_';

/** A portfolio with its own (older) passphrase vault was opened in this tab */
export function markLegacyVaultUnlocked() {
  if (!state.legacyUnlocked) setState({ legacyUnlocked: true });
}

/**
 * Lock everything in this tab at once: the account vault and every portfolio opened with its
 * own older passphrase. Screens holding a passphrase key listen for LOCK_ALL_EVENT.
 */
export function lockAll() {
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith(LEGACY_PASS_PREFIX))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // sessionStorage unavailable — nothing cached to clear
  }
  dataKey = null;
  portfolioKeys.clear();
  writeSession(null);
  setState({
    status: state.vault ? 'locked' : state.status,
    legacyUnlocked: false,
    epoch: state.epoch + 1,
  });
  window.dispatchEvent(new Event(LOCK_ALL_EVENT));
}

/** Forget everything (logout) */
export function resetVault() {
  dataKey = null;
  portfolioKeys.clear();
  loadPromise = null;
  writeSession(null);
  setState({ status: 'idle', vault: null, error: null, userId: null, legacyUnlocked: false, hasPlaintextData: false, epoch: state.epoch + 1 });
}

function assertPassphrase(passphrase) {
  if (String(passphrase || '').length < VAULT_MIN_PASSPHRASE_LENGTH) {
    throw new Error(`رمز عبور رمزنگاری باید حداقل ${VAULT_MIN_PASSPHRASE_LENGTH.toLocaleString('fa-IR')} کاراکتر باشد.`);
  }
}

/**
 * Create the account vault (data is migrated separately — see vaultMigration.js). The vault is
 * unlocked right away with the new key.
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
  if (!vault) throw new Error('رمزنگاری سرتاسری برای این حساب فعال نیست.');
  const oldKek = await deriveE2eeKey(String(currentPassphrase || ''), vault.salt);
  const raw = await unwrapRawKey(oldKek, vault.wrappedKey);
  if (!raw) throw new Error('رمز عبور فعلی نادرست است.');

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
