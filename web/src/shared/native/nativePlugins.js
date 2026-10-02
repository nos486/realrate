/**
 * nativePlugins.js — The Android app's own native plugins (web/android/app/src/main/java/ir/realrate/app)
 *
 * BankSms: reads bank messages from the SMS inbox (BankSmsPlugin.java)
 * BiometricVault: keeps a secret only the fingerprint can release (BiometricVaultPlugin.java)
 * AppUpdate: downloads the new APK and opens Android's installer (AppUpdatePlugin.java)
 * FileExport: hands a file the app made to Android's share sheet (FileExportPlugin.java)
 * Outside the app their calls fail ("not implemented"): check isNativeApp() first.
 */

import { registerPlugin } from '@capacitor/core';

export const BankSms = registerPlugin('BankSms');
export const BiometricVault = registerPlugin('BiometricVault');
export const AppUpdate = registerPlugin('AppUpdate');
export const FileExport = registerPlugin('FileExport');
