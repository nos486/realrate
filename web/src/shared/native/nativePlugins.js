/**
 * nativePlugins.js — The Android app's own native plugins (web/android/app/src/main/java/ir/realrate/app)
 *
 * BankSms: reads bank messages from the SMS inbox (BankSmsPlugin.java)
 * BiometricVault: keeps a secret only the fingerprint can release (BiometricVaultPlugin.java)
 * AppUpdate: downloads the new APK and opens Android's installer (AppUpdatePlugin.java)
 * WebBundle: updates the app's pages without a new APK (WebBundlePlugin.java, webBundle.js)
 * FileExport: hands a file the app made to Android's share sheet (FileExportPlugin.java)
 * Widgets: the home-screen widgets' favourites and refresh (WidgetsPlugin.java)
 * Outside the app their calls fail ("not implemented"): check isNativeApp() first.
 */

import { registerPlugin } from '@capacitor/core';
import { t } from '../../utils/i18n.js';

/**
 * Wraps a plugin so the Persian messages its Java side rejects with (they are fixed texts) come
 * back in the active language; a message without a translation, or in Persian, passes unchanged.
 */
function localized(plugin) {
  return new Proxy(plugin, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function' || typeof prop !== 'string' || prop === 'then') return value;
      return (...args) => {
        const result = value.apply(target, args);
        if (!result || typeof result.then !== 'function') return result;
        return result.catch((err) => {
          if (err && typeof err.message === 'string') err.message = t(err.message);
          throw err;
        });
      };
    },
  });
}

export const BankSms = registerPlugin('BankSms');
export const BiometricVault = localized(registerPlugin('BiometricVault'));
export const AppUpdate = localized(registerPlugin('AppUpdate'));
export const WebBundle = registerPlugin('WebBundle');
export const FileExport = localized(registerPlugin('FileExport'));
export const Widgets = registerPlugin('Widgets');
