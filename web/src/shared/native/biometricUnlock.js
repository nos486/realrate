/**
 * biometricUnlock.js — Open the encrypted data with a fingerprint (Android app) or a passkey
 * (website: fingerprint, face, Windows Hello, Touch ID or a security key)
 *
 * Once the vault is unlocked with its passphrase, the user can turn this on: the unlocked data
 * key (not the passphrase) is handed to BiometricVault, which keeps it encrypted with an Android
 * Keystore key that works only right after a fingerprint check, or in a browser to PasskeyVault
 * (vault/passkeyVault.js), which keeps it encrypted with a key only a passkey check releases
 * (WebAuthn PRF). Unlocking later asks for that check and opens the vault with that key; the
 * auto-lock (vault/autoLock.js) applies as after a passphrase unlock.
 *
 * The stored key is tied to the account and the current wrapping of the data key: another
 * account, or a changed passphrase, needs the passphrase once and the fingerprint set up again.
 * Signing out forgets it.
 */

import { isNativeApp } from './nativeApp.js';
import { BiometricVault } from './nativePlugins.js';
import { PasskeyVault } from '../vault/passkeyVault.js';
import { getVaultState, getVaultUnlockSecret, unlockVaultWithSecret } from '../vault/vaultStore.js';
import { t } from '../../utils/i18n.js';

const OWNER_KEY = 'realrate_biometric_user';

// The Android Keystore in the app, a passkey in a browser (same calls)
const backend = () => (isNativeApp() ? BiometricVault : PasskeyVault);

/** The name of the check on this device, for buttons and settings */
export function biometricLabel() {
  return isNativeApp() ? t('اثر انگشت') : t('کلید عبور');
}

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

/** Whether this phone can use a (strong) fingerprint/face check, or this browser a passkey */
export async function isBiometricAvailable() {
  try {
    return Boolean((await backend().isAvailable())?.available);
  } catch {
    return false;
  }
}

/** Whether fingerprint/passkey unlock is set up for this user on this device */
export async function isBiometricEnabled(userId = getVaultState().userId) {
  if (!userId || readOwner() !== userId) return false;
  try {
    return Boolean((await backend().has())?.stored);
  } catch {
    return false;
  }
}

/** Turn it on (the vault must be unlocked); asks for the fingerprint or makes the passkey */
export async function enableBiometric() {
  const secret = getVaultUnlockSecret();
  if (!secret) throw new Error(t('ابتدا اطلاعات رمزنگاری‌شده را با رمز عبور باز کنید.'));
  await backend().store({
    data: JSON.stringify(secret),
    userId: secret.userId,
    title: isNativeApp() ? t('فعال کردن اثر انگشت') : t('RealRate — باز کردن اطلاعات رمزنگاری‌شده'),
    cancel: t('انصراف'),
    subtitle: t('از این پس اطلاعات رمزنگاری‌شده با اثر انگشت باز می‌شود'),
  });
  writeOwner(secret.userId);
}

export async function disableBiometric() {
  writeOwner('');
  try {
    await backend().clear();
  } catch {
    // Nothing stored
  }
}

/**
 * Unlock the vault with the fingerprint or passkey
 * @returns {Promise<boolean>} false when the user closed the prompt
 * @throws when it cannot be used any more (fingerprints or passphrase changed): it is turned off
 */
export async function unlockWithBiometric() {
  let data;
  try {
    ({ data } = await backend().retrieve({ title: t('باز کردن با اثر انگشت'), cancel: t('انصراف') }));
  } catch (err) {
    if (err?.code === 'CANCELED') return false;
    if (err?.code === 'INVALIDATED' || err?.code === 'NOT_STORED') writeOwner('');
    throw new Error(err?.message || (isNativeApp() ? t('باز کردن با اثر انگشت ممکن نشد.') : t('باز کردن با کلید عبور ممکن نشد.')));
  }
  let secret = null;
  try {
    secret = JSON.parse(data);
  } catch {
    // Unreadable: handled below
  }
  if (!(await unlockVaultWithSecret(secret))) {
    await disableBiometric();
    throw new Error(isNativeApp()
      ? t('رمز عبور رمزنگاری تغییر کرده است؛ یک بار با رمز باز کنید و اثر انگشت را دوباره فعال کنید.')
      : t('رمز عبور رمزنگاری تغییر کرده است؛ یک بار با رمز باز کنید و کلید عبور را دوباره فعال کنید.'));
  }
  return true;
}
