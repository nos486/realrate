/**
 * appUpdate.js — The Android app updates itself from its signed GitHub release
 *
 * - On start and every return to the app (at most every few hours) the app asks the server for
 *   the latest release (GET /api/app/latest, api/src/handlers/appUpdateRoutes.js) and compares
 *   it with its own version name. A newer one opens the update prompt (AppUpdatePrompt.jsx).
 * - «به‌روزرسانی» downloads the APK inside the app (AppUpdate plugin, with progress) and opens
 *   Android's installer. Android asks the user once for "install unknown apps" for RealRate, and
 *   installs only an APK signed with the same key, over the installed app (the data stays).
 * - «بعداً» hides that version's prompt for a day; the automatic check can be turned off in the
 *   app's settings, and «بررسی به‌روزرسانی» there checks right away.
 */

import { Capacitor } from '@capacitor/core';
import { httpClient } from '../api/httpClient.js';
import { compareVersions } from '../../utils/clientInfo.js';
import { isNativeApp } from './nativeApp.js';
import { AppUpdate } from './nativePlugins.js';

const SETTINGS_KEY = 'realrate_app_update';
export const APP_UPDATE_EVENT = 'realrate:app-update';
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const SNOOZE_MS = 24 * 60 * 60 * 1000;

function readSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function writeSettings(patch) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...readSettings(), ...patch }));
  } catch {}
}

/** @returns {{ auto: boolean, lastCheck: number, snooze: { version: string, until: number }|null }} */
export function getAppUpdateSettings() {
  const s = readSettings();
  return { auto: s.auto !== false, lastCheck: Number(s.lastCheck) || 0, snooze: s.snooze || null };
}

export function setAutoUpdateCheck(auto) {
  writeSettings({ auto: Boolean(auto) });
  notify();
}

/** Time for the automatic check (never sooner than CHECK_INTERVAL_MS after the last one) */
export function isCheckDue(settings, now = Date.now()) {
  return settings.auto && now - settings.lastCheck >= CHECK_INTERVAL_MS;
}

/** The release is newer than the installed version */
export function isNewer(release, installedVersion) {
  return Boolean(release?.version && installedVersion) && compareVersions(release.version, installedVersion) > 0;
}

/** Open the prompt for this release: newer, and not put off with «بعداً» (a manual check always does) */
export function shouldPrompt(release, installedVersion, snooze, now = Date.now(), manual = false) {
  if (!isNewer(release, installedVersion)) return false;
  if (manual) return true;
  return !(snooze && snooze.version === release.version && now < Number(snooze.until));
}

/** The release notes as plain lines (the CHANGELOG's markdown, without the download footer) */
export function releaseNotesText(notes) {
  return String(notes || '')
    .split(/\n-{3,}\s*\n/)[0]
    .replace(/\r/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .trim();
}

/* ── State shared by the prompt and the settings page ─────────────────── */

/**
 * status: idle | checking | available | downloading | permission | installing | error | latest
 * (permission: Android needs "install unknown apps" for RealRate first)
 */
let state = { status: 'idle', release: null, installedVersion: '', progress: 0, error: '', open: false };

function setState(patch) {
  state = { ...state, ...patch };
  notify();
}

function notify() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(APP_UPDATE_EVENT));
}

export function getAppUpdateState() {
  return state;
}

async function installedVersion() {
  if (state.installedVersion) return state.installedVersion;
  const { App } = await import('@capacitor/app');
  const info = await App.getInfo();
  return String(info?.version || '');
}

const canUpdate = () => isNativeApp() && Capacitor.isNativePlatform();

/**
 * Ask the server for the latest release
 * @param {{ manual?: boolean }} [options] manual: from the settings page (no interval, no snooze)
 */
export async function checkForUpdate({ manual = false } = {}) {
  if (!canUpdate()) return state;
  const settings = getAppUpdateSettings();
  if (!manual && !isCheckDue(settings)) return state;
  if (['checking', 'downloading', 'installing'].includes(state.status)) return state;
  setState({ status: 'checking', error: '' });
  try {
    const [version, data] = await Promise.all([installedVersion(), httpClient.get('/api/app/latest')]);
    const release = data?.release || null;
    writeSettings({ lastCheck: Date.now() });
    if (isNewer(release, version)) {
      setState({
        status: 'available',
        release,
        installedVersion: version,
        open: shouldPrompt(release, version, settings.snooze, Date.now(), manual),
      });
    } else {
      setState({ status: 'latest', release, installedVersion: version, open: false });
    }
  } catch (err) {
    setState({ status: manual ? 'error' : 'idle', error: err?.message || 'بررسی به‌روزرسانی ممکن نشد.' });
  }
  return state;
}

/** «بعداً»: this version's prompt waits a day */
export function snoozeUpdate() {
  if (state.release) writeSettings({ snooze: { version: state.release.version, until: Date.now() + SNOOZE_MS } });
  if (state.status === 'downloading') AppUpdate.cancel().catch(() => {});
  setState({ open: false, status: state.release ? 'available' : 'idle', progress: 0 });
}

export function openUpdatePrompt() {
  if (state.release) setState({ open: true });
}

/** Download the APK and open Android's installer (asks for the install permission first if needed) */
export async function downloadAndInstall() {
  const { release } = state;
  if (!release || !canUpdate()) return;
  try {
    const { allowed } = await AppUpdate.canInstall();
    if (!allowed) {
      setState({ status: 'permission', error: '' });
      return;
    }
    setState({ status: 'downloading', progress: 0, error: '' });
    const listener = await AppUpdate.addListener('downloadProgress', ({ downloaded, total }) => {
      const size = Number(total) > 0 ? Number(total) : Number(release.size) || 0;
      if (size > 0) setState({ progress: Math.min(1, Number(downloaded) / size) });
    });
    try {
      await AppUpdate.download({ url: release.url, version: release.version });
    } finally {
      listener?.remove?.();
    }
    setState({ status: 'installing', progress: 1 });
    await AppUpdate.install();
  } catch (err) {
    if (err?.code === 'CANCELED') return;
    setState({ status: 'error', error: err?.message || 'به‌روزرسانی ناموفق بود.' });
  }
}

/** The "install unknown apps" page for RealRate; coming back to the app continues the update */
export async function openInstallPermission() {
  await AppUpdate.openInstallSettings().catch(() => {});
}

/**
 * Automatic checks: now, and on every return to the app; a return from the install
 * permission page continues the update
 */
export function startAutoUpdateCheck() {
  if (!canUpdate()) return () => {};
  let handle = null;
  let stopped = false;
  checkForUpdate();
  import('@capacitor/app').then(async ({ App }) => {
    if (stopped) return;
    handle = await App.addListener('resume', async () => {
      if (state.status === 'permission') {
        const { allowed } = await AppUpdate.canInstall().catch(() => ({ allowed: false }));
        if (allowed) downloadAndInstall();
        return;
      }
      checkForUpdate();
    });
  }).catch(() => {});
  return () => {
    stopped = true;
    handle?.remove();
  };
}
