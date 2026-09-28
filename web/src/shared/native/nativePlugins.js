/**
 * nativePlugins.js — The Android app's own native plugins (web/android/app/src/main/java/ir/realrate/app)
 *
 * BankSms: reads bank messages from the SMS inbox (BankSmsPlugin.java)
 * BiometricVault: keeps a secret only the fingerprint can release (BiometricVaultPlugin.java)
 * Outside the app their calls fail ("not implemented"): check isNativeApp() first.
 */

import { registerPlugin } from '@capacitor/core';

export const BankSms = registerPlugin('BankSms');
export const BiometricVault = registerPlugin('BiometricVault');
