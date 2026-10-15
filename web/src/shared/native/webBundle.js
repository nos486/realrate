/**
 * webBundle.js — The app's pages update without a new APK (WebBundlePlugin.java)
 *
 * Every merge into main publishes the app's pages as a signed web bundle (the GitHub release
 * `web-bundle`, .github/workflows/android.yml). The app looks for a newer one when it opens and
 * when it comes back to the front (at most every WEB_BUNDLE_CHECK_GAP_MS); the native side takes
 * it only when it was built for this APK's exact native side and is signed with the APK's own
 * key, downloads it in the background and uses it from the next start of the app. A change to
 * the native side (Java, the Android manifest, Capacitor plugins) still needs a new APK, which
 * appUpdate.js offers as before.
 *
 * The pages of a new bundle confirm that they started (WebBundle.ready); a bundle that starts
 * twice without confirming is dropped and the last good pages come back.
 */

import { Capacitor } from '@capacitor/core';
import { isNativeApp } from './nativeApp.js';
import { WebBundle } from './nativePlugins.js';

export const WEB_BUNDLE_MANIFEST_URL = 'https://github.com/nos486/realrate/releases/download/web-bundle/manifest.json';
/** Two checks closer than this are one (the manifest is small, but returns to the app are many) */
export const WEB_BUNDLE_CHECK_GAP_MS = 10 * 60 * 1000;
/** The pages count as started once they have run this long */
export const WEB_BUNDLE_CONFIRM_MS = 3000;

let lastCheck = 0;
let started = false;

/** Time to look for a newer bundle */
export function isWebBundleCheckDue(last, now = Date.now()) {
  return !last || now - last >= WEB_BUNDLE_CHECK_GAP_MS;
}

/**
 * Asks the native side to fetch a newer bundle, if there is one (it applies at the next start)
 * @returns {Promise<{ status: string, build?: number } | null>}
 */
export async function checkWebBundle(now = Date.now()) {
  if (!isWebBundleCheckDue(lastCheck, now)) return null;
  lastCheck = now;
  try {
    return await WebBundle.update({ manifestUrl: WEB_BUNDLE_MANIFEST_URL });
  } catch {
    // No connection or GitHub unreachable: the next opening tries again
    return null;
  }
}

/** Once per load of the pages: confirm they started, then look for updates now and on each return */
export function startWebBundleUpdates() {
  if (started || !isNativeApp() || !Capacitor.isNativePlatform()) return;
  started = true;
  // A one-off delay, not a refresh timer: pages that crash on start never get here
  setTimeout(() => WebBundle.ready().catch(() => {}), WEB_BUNDLE_CONFIRM_MS);
  checkWebBundle();
  import('@capacitor/app')
    .then(({ App }) => App.addListener('resume', () => checkWebBundle()))
    .catch(() => {});
}

/** For tests */
export function resetWebBundleChecks() {
  lastCheck = 0;
  started = false;
}
