/**
 * biometricUnlock.js — Open the encrypted data with a fingerprint (Android app)
 *
 * Once the vault is unlocked with its passphrase, the user can turn this on: the unlocked data
 * key (not the passphrase) is handed to BiometricVault, which keeps it encrypted with an Android
 * Keystore key that works only right after a fingerprint check. Unlocking later asks for the
 * fingerprint and opens the vault with that key.
 *
 * The stored key is tied to the account and the current wrapping of the data key: another
 * account, or a changed passphrase, needs the passphrase once and the fingerprint set up again.
 * Signing out forgets it.
 */

import { isNativeApp } from './nativeApp.js';
import { BiometricVault } from './nativePlugins.js';
import { getVaultState, getVaultUnlockSecret, unlockVaultWithSecret } from '../vault/vaultStore.js';

const OWNER_KEY = 'realrate_biometric_user';

function readOwner() {
  try {
    return localStorage.getItem(OWNER_KEY) || '';
  } catch {
    return '';
  }
}

function writeOwner(userId) {
  try {
    if (userId) localStorage.setItem(OWNER_KEY, userId);
    else localStorage.removeItem(OWNER_KEY);
  } catch {
    // Only a hint: the stored secret itself is checked on unlock
  }
}

/** Whether this phone can use a (strong) fingerprint/face check */
export async function isBiometricAvailable() {
  if (!isNativeApp()) return false;
  try {
    return Boolean((await BiometricVault.isAvailable())?.available);
  } catch {
    return false;
  }
}

/** Whether fingerprint unlock is set up for this user on this phone */
export async function isBiometricEnabled(userId = getVaultState().userId) {
  if (!isNativeApp() || !userId || readOwner() !== userId) return false;
  try {
    return Boolean((await BiometricVault.has())?.stored);
  } catch {
    return false;
  }
}

/** Turn it on (the vault must be unlocked); asks for the fingerprint */
export async function enableBiometric() {
  const secret = getVaultUnlockSecret();
  if (!secret) throw new Error('ابتدا اطلاعات رمزنگاری‌شده را با رمز عبور باز کنید.');
  await BiometricVault.store({
    data: JSON.stringify(secret),
    title: 'فعال کردن اثر انگشت',
    subtitle: 'از این پس اطلاعات رمزنگاری‌شده با اثر انگشت باز می‌شود',
  });
  writeOwner(secret.userId);
}

export async function disableBiometric() {
  writeOwner('');
  if (!isNativeApp()) return;
  try {
    await BiometricVault.clear();
  } catch {
    // Nothing stored
  }
}

/**
 * Unlock the vault with the fingerprint
 * @returns {Promise<boolean>} false when the user closed the prompt
 * @throws when it cannot be used any more (fingerprints or passphrase changed): it is turned off
 */
export async function unlockWithBiometric() {
  let data;
  try {
    ({ data } = await BiometricVault.retrieve({ title: 'باز کردن با اثر انگشت' }));
  } catch (err) {
    if (err?.code === 'CANCELED') return false;
    if (err?.code === 'INVALIDATED' || err?.code === 'NOT_STORED') writeOwner('');
    throw new Error(err?.message || 'باز کردن با اثر انگشت ممکن نشد.');
  }
  let secret = null;
  try {
    secret = JSON.parse(data);
  } catch {
    // Unreadable: handled below
  }
  if (!(await unlockVaultWithSecret(secret))) {
    await disableBiometric();
    throw new Error('رمز عبور رمزنگاری تغییر کرده است؛ یک بار با رمز باز کنید و اثر انگشت را دوباره فعال کنید.');
  }
  return true;
}
