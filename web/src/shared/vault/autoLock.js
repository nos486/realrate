/**
 * autoLock.js — Lock the unlocked vault after a stretch without use
 *
 * "Use" is input in this tab (pointer, keys, wheel, touch) while it is visible: a hidden tab or
 * an Android app in the background counts as idle, so coming back after the limit finds the
 * vault locked (the passphrase, or the fingerprint in the app, opens it again). The limit is a
 * per-device choice (AUTO_LOCK_OPTIONS, minutes; 0 = never), shorter in the app by default.
 *
 * The same limit applies to a reload: the kept unlocked session (vaultStore.js) carries when the
 * tab was last used and is not restored once that is older than the limit.
 *
 * vaultStore.js arms it on unlock and disarms it on lock; this module knows nothing of keys.
 */

import { Capacitor } from '@capacitor/core';

const SETTING_KEY = 'realrate_vault_autolock_min';
/** The choices offered (minutes); 0 never locks by itself */
export const AUTO_LOCK_OPTIONS = [1, 5, 15, 60, 0];
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
/** Input closer together than this does not move the deadline again */
const NOTE_EVERY_MS = 5_000;
/** How often the time of last use is written to the kept session */
const PERSIST_EVERY_MS = 30_000;

let expire = null;
let persist = null;
let timer = null;
let lastActive = 0;
let lastPersisted = 0;
let listening = false;

/** The default limit: 5 minutes in the Android app, 15 on the site */
export function defaultAutoLockMinutes() {
  return Capacitor.getPlatform() === 'android' ? 5 : 15;
}

/** This device's limit in minutes (0 = never) */
export function getAutoLockMinutes() {
  try {
    const saved = localStorage.getItem(SETTING_KEY);
    if (saved !== null && AUTO_LOCK_OPTIONS.includes(Number(saved))) return Number(saved);
  } catch {
    // No storage: the default
  }
  return defaultAutoLockMinutes();
}

/** Choose this device's limit (one of AUTO_LOCK_OPTIONS); the running countdown follows it */
export function setAutoLockMinutes(minutes) {
  if (!AUTO_LOCK_OPTIONS.includes(Number(minutes))) return;
  try {
    localStorage.setItem(SETTING_KEY, String(Number(minutes)));
  } catch {
    // Not kept: applies to this page only
  }
  schedule();
}

const limitMs = () => getAutoLockMinutes() * 60_000;

/**
 * Whether a session last used at `activeAt` (epoch ms) is past the limit. One without the time
 * (kept before this existed) counts as past it.
 */
export function isPastAutoLock(activeAt, now = Date.now()) {
  const ms = limitMs();
  if (!ms) return false;
  return !Number.isFinite(Number(activeAt)) || !activeAt || now - Number(activeAt) >= ms;
}

function schedule() {
  clearTimeout(timer);
  timer = null;
  const ms = limitMs();
  if (!expire || !ms) return;
  timer = setTimeout(check, Math.max(0, ms - (Date.now() - lastActive)) + 50);
}

/** Lock when the limit has passed, else wait for the rest of it */
function check() {
  if (!expire) return;
  const ms = limitMs();
  if (ms && Date.now() - lastActive >= ms) {
    const lock = expire;
    disarmAutoLock();
    lock();
    return;
  }
  schedule();
}

function noteActivity(force = false) {
  if (!expire || (typeof document !== 'undefined' && document.hidden)) return;
  const now = Date.now();
  if (!force && now - lastActive < NOTE_EVERY_MS) return;
  lastActive = now;
  if (persist && (force || now - lastPersisted >= PERSIST_EVERY_MS)) {
    lastPersisted = now;
    persist(now);
  }
  schedule();
}

const onActivity = () => noteActivity();

function onVisibility() {
  if (document.hidden) return;
  // Back from a hidden tab or the background: the idle time ran on meanwhile
  check();
  noteActivity(true);
}

function listen() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  for (const type of ACTIVITY_EVENTS) window.addEventListener(type, onActivity, { passive: true, capture: true });
  document.addEventListener('visibilitychange', onVisibility);
}

/**
 * Start counting idle time (the vault was just unlocked)
 * @param {{ onExpire: () => void, onActivity?: (at: number) => void }} handlers
 *   onExpire locks the vault; onActivity keeps the time of last use (for a reload)
 */
export function armAutoLock({ onExpire, onActivity: keep }) {
  expire = onExpire;
  persist = keep || null;
  listen();
  noteActivity(true);
}

/** Stop counting (the vault was locked, reset or signed out) */
export function disarmAutoLock() {
  expire = null;
  persist = null;
  clearTimeout(timer);
  timer = null;
}
