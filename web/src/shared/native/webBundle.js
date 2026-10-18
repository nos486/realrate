/**
 * webBundle.js — The app's pages update without a new APK (WebBundlePlugin.java)
 *
 * Every merge into main publishes the app's pages as a signed web bundle (the GitHub release
 * `web-bundle`, .github/workflows/android.yml). The app looks for a newer one when it opens and
 * when it comes back to the front (at most every WEB_BUNDLE_CHECK_GAP_MS); the native side takes
 * it only when it was built for this APK's exact native side and is signed with the APK's own
 * key and downloads it in the background. A downloaded bundle is loaded by reloading the pages
 * at a safe moment (no open dialog or focused field, safeReload.js), so the app need not be
 * closed and opened; if that cannot happen it is used from the next start. A change to
 * the native side (Java, the Android manifest, Capacitor plugins) still needs a new APK, which
 * appUpdate.js offers as before.
 *
 * The pages of a new bundle confirm that they started (WebBundle.ready); a bundle that starts
 * twice without confirming is dropped and the last good pages come back.
 *
 * «بررسی به‌روزرسانی» in the app settings also updates the pages right away (updatePagesNow):
 * it looks for a bundle with no interval and loads a downloaded one at once (WebBundle.apply).
 */

import { Capacitor } from '@capacitor/core';
import { isNativeApp } from './nativeApp.js';
import { WebBundle } from './nativePlugins.js';
import { reloadWhenSafe } from '../pwa/safeReload.js';

export const WEB_BUNDLE_MANIFEST_URL = 'https://github.com/nos486/realrate/releases/download/web-bundle/manifest.json';
/* ── The download's progress, for the bar at the top of the app (WebBundleProgress) ── */

export const WEB_BUNDLE_EVENT = 'realrate:web-bundle';
let progressState = { downloading: false, progress: 0 };

function setProgress(patch) {
  progressState = { ...progressState, ...patch };
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(WEB_BUNDLE_EVENT));
}

/** @returns {{ downloading: boolean, progress: number }} progress from 0 to 1 */
export function getWebBundleProgress() {
  return progressState;
}

/** The share downloaded, from the plugin's "bundleProgress" event */
export function progressShare({ downloaded, total } = {}) {
  const size = Number(total);
  return size > 0 ? Math.min(1, Math.max(0, Number(downloaded) / size)) : 0;
}

/** WebBundle.update with the manifest on GitHub, reporting the zip's download progress */
async function fetchBundle() {
  // Only a zip's download reports progress: the bar shows then, not for the manifest
  let listener = null;
  try {
    listener = await WebBundle.addListener('bundleProgress', (event) => {
      setProgress({ downloading: true, progress: progressShare(event) });
    });
  } catch {}
  try {
    return await WebBundle.update({ manifestUrl: WEB_BUNDLE_MANIFEST_URL });
  } finally {
    listener?.remove?.();
    if (progressState.downloading) setProgress({ downloading: false, progress: 0 });
  }
}

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
export async function checkWebBundle(now = Date.now(), { force = false } = {}) {
  if (!force && !isWebBundleCheckDue(lastCheck, now)) return null;
  lastCheck = now;
  try {
    return await fetchBundle();
  } catch {
    // No connection or GitHub unreachable: the next opening tries again
    return null;
  }
}

/**
 * The user asked for the newest pages: fetch a newer bundle now and load it at once (the pages
 * reload). An APK from before WebBundle.apply, or a bundle not confirmed yet, gets it at the next
 * start of the app instead.
 * @returns {Promise<'latest' | 'applied' | 'next-start' | 'error'>}
 */
export async function updatePagesNow(now = Date.now()) {
  lastCheck = now;
  let result;
  try {
    result = await fetchBundle();
  } catch {
    return 'error';
  }
  if (result?.status === 'disabled') return 'latest';
  if (result?.status !== 'ready') {
    // Nothing newer to download, but an earlier one may still be waiting for the next start
    const info = await WebBundle.info().catch(() => null);
    if (!(Number(info?.pendingBuild) > 0)) return result?.status === 'busy' ? 'next-start' : 'latest';
  }
  try {
    const { applied } = await WebBundle.apply();
    return applied ? 'applied' : 'next-start';
  } catch {
    return 'next-start';
  }
}

/**
 * A bundle came down: load it by reloading the pages as soon as that loses no input. apply() says
 * no (a bundle not confirmed yet, an older APK) → it waits for the next start of the app.
 */
function applyDownloadedBundle() {
  reloadWhenSafe(() => { WebBundle.apply().catch(() => {}); });
}

/** Check and, when a newer bundle was downloaded, load it at a safe moment */
async function checkAndApply(options) {
  const result = await checkWebBundle(Date.now(), options);
  if (result?.status === 'ready') applyDownloadedBundle();
}

/** Once per load of the pages: confirm they started, then look for updates now and on each return */
export function startWebBundleUpdates() {
  if (started || !isNativeApp() || !Capacitor.isNativePlatform()) return;
  started = true;
  // A one-off delay, not a refresh timer: pages that crash on start never get here
  setTimeout(() => WebBundle.ready().catch(() => {}), WEB_BUNDLE_CONFIRM_MS);
  checkAndApply();
  import('@capacitor/app')
    .then(({ App }) => App.addListener('resume', () => checkAndApply()))
    .catch(() => {});
}

/** For tests */
export function resetWebBundleChecks() {
  lastCheck = 0;
  started = false;
}
