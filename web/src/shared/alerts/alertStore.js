/**
 * alertStore.js — Every live alert of the app, in one place
 *
 * Sources publish their alerts under their own key (setSourceAlerts: «loan», «cheque»,
 * «portfolio:<id>», «app») — the latest list replaces the previous one, and stays after the page
 * that raised it closes, so the alert center still shows a portfolio's drift from the home page.
 * Everything that shows alerts (the alert center, the banners) reads from here (useAlerts), and
 * the delivery channels (alertChannels.js) are fed from here.
 *
 * Dismissing hides an alert's fingerprint (utils/alerts.js: alertFingerprint) in this browser: a
 * critical one until tomorrow, the others until something new joins them (or 30 days). Cleared
 * with the account's data on sign out (clearAlerts).
 */

import { useSyncExternalStore, useEffect } from 'react';
import { createAlert, compareAlerts, alertFingerprint } from '../../utils/alerts.js';
import { todayIso } from '../utils/dates.js';

const DISMISS_KEY = 'realrate_alert_dismissals';
const DAY = 24 * 60 * 60 * 1000;
const KEEP_DISMISSED_DAYS = 30;

const sources = new Map();
const listeners = new Set();
let snapshot = [];
let dismissals = readDismissals();

function readDismissals() {
  try {
    const value = JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function writeDismissals() {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(dismissals));
  } catch {}
}

const isDismissed = (alert, today = todayIso()) => {
  const until = dismissals[alertFingerprint(alert)];
  return Boolean(until) && until >= today;
};

function rebuild() {
  const today = todayIso();
  snapshot = [...sources.values()].flat().map((a) => ({ ...a, dismissed: isDismissed(a, today) })).sort(compareAlerts);
  listeners.forEach((fn) => fn());
}

/**
 * A source's current alerts (an empty list clears it)
 * @param {string} key e.g. «loan», «portfolio:pf_1»
 * @param {object[]} alerts
 */
export function setSourceAlerts(key, alerts = []) {
  const clean = (alerts || []).map(createAlert).filter(Boolean);
  const prev = sources.get(key) || [];
  if (!clean.length && !prev.length) return;
  if (JSON.stringify(prev) === JSON.stringify(clean)) return;
  if (clean.length) sources.set(key, clean);
  else sources.delete(key);
  rebuild();
}

/** Hide an alert (see the header for how long) */
export function dismissAlert(alert, now = new Date()) {
  const today = todayIso(now);
  const until = alert.severity === 'critical' ? today : todayIso(new Date(now.getTime() + KEEP_DISMISSED_DAYS * DAY));
  // Old entries go, so the list does not grow forever
  dismissals = Object.fromEntries(Object.entries(dismissals).filter(([, u]) => u >= today));
  dismissals[alertFingerprint(alert)] = until;
  writeDismissals();
  rebuild();
}

/** Every alert, most severe first (`dismissed` marks the hidden ones) */
export function getAlerts() {
  return snapshot;
}

/** Sign out: nothing of the account stays */
export function clearAlerts() {
  sources.clear();
  dismissals = {};
  try {
    localStorage.removeItem(DISMISS_KEY);
  } catch {}
  rebuild();
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * The live alerts
 * @param {{ sources?: string[], scope?: string, includeDismissed?: boolean }} [filter]
 */
export function useAlerts({ sources: only = null, scope = null, includeDismissed = false } = {}) {
  const all = useSyncExternalStore(subscribe, getAlerts, getAlerts);
  return all.filter((a) => (includeDismissed || !a.dismissed)
    && (!only || only.includes(a.source))
    && (!scope || a.scope === scope));
}

/** Publish a source's alerts while they change (they stay after unmount: see the header) */
export function useAlertSource(key, alerts) {
  const serialized = JSON.stringify(alerts || []);
  useEffect(() => {
    if (key) setSourceAlerts(key, JSON.parse(serialized));
  }, [key, serialized]);
}
