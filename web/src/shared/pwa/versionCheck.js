/**
 * versionCheck.js — The web app loads a newly deployed version by itself
 *
 * Every build writes /version.json ({ build }) next to the pages (vite.config.js) and bakes the
 * same id into the code (__APP_BUILD__). A tab that is open keeps running its old code, and its
 * old lazy chunks may be gone after a deploy, so the page compares the two when it opens, comes
 * back to the front or the window gets focus (at most every MIN_CHECK_GAP_MS; no timers) and,
 * on a difference, reloads at a safe moment (safeReload.js). A build is tried once per tab, so a
 * stale cached shell cannot cause a reload loop. Not used in the Android app: its pages come
 * with the app and update as a web bundle (shared/native/webBundle.js).
 */

import { isNativeApp } from '../native/nativeApp.js';
import { reloadWhenSafe } from './safeReload.js';

/** Two checks closer than this are one */
export const MIN_CHECK_GAP_MS = 5 * 60 * 1000;
const TRIED_KEY = 'realrate_reloaded_for_build';

let lastCheck = 0;
let started = false;

/** The build id of the running code ('' in dev) */
export function currentBuild() {
  return typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : '';
}

/** @returns {boolean} true when `remote` is a build other than the running one */
export function isNewBuild(remote, current = currentBuild()) {
  return Boolean(remote && current && remote !== current);
}

function wasTried(build) {
  try {
    return sessionStorage.getItem(TRIED_KEY) === build;
  } catch {
    return false;
  }
}

function markTried(build) {
  try {
    sessionStorage.setItem(TRIED_KEY, build);
  } catch {}
}

/**
 * Looks for a newer deployed build; reloads (at a safe moment) when there is one.
 * @returns {Promise<boolean>} true when a newer build was found
 */
export async function checkForNewVersion(now = Date.now(), { force = false } = {}) {
  if (!force && lastCheck && now - lastCheck < MIN_CHECK_GAP_MS) return false;
  lastCheck = now;
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok) return false;
    const { build } = await res.json();
    if (!isNewBuild(build) || wasTried(build)) return false;
    reloadWhenSafe(() => {
      markTried(build);
      window.location.reload();
    });
    return true;
  } catch {
    // Offline or a bad answer: the next return to the page tries again
    return false;
  }
}

/** Once per load of the page (production web only) */
export function startVersionChecks() {
  if (started || !import.meta.env.PROD || typeof window === 'undefined' || isNativeApp()) return;
  started = true;
  const check = () => { checkForNewVersion(); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('focus', check);
  check();
}

/** For tests */
export function resetVersionChecks() {
  lastCheck = 0;
  started = false;
}
