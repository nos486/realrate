/**
 * pageRefresh.js — What the header's refresh button and the window's focus read again: only the
 * data the open tab shows
 *
 * Each data loader registers under the kind of data it reads (a "scope": prices, news, loans, …)
 * while it is mounted (`useRefreshHandler`). The app page names the scopes its open tab shows
 * (`usePageScopes`, MainPage's table). A refresh runs only those scopes' loaders — the news tab
 * never reads the price book, the incomes tab never reads the loans.
 *
 * When data is read:
 *  - a tab loads what it shows when it opens (its own hooks)
 *  - the header's button: the open tab's scopes, now
 *  - the window gets focus again (or the Android app comes back): the open tab's scopes, at most
 *    once per AUTO_REFRESH_GAP_MS
 * Nothing runs on a timer and switching tabs refreshes nothing else.
 *
 * With the Android app's offline copy (shared/offline), records are read from the device: a
 * refresh of record scopes first runs one sync round with the server, then the loaders re-read
 * the copy.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { isOfflineActive, syncNow } from '../offline/offlineSync.js';

/** The kinds of data a tab can show, each read by its own loaders */
export const REFRESH_SCOPES = {
  prices: 'prices',
  news: 'news',
  portfolio: 'portfolio',
  loans: 'loans',
  cheques: 'cheques',
  incomes: 'incomes',
  expenses: 'expenses',
  accounts: 'accounts',
};

/** Scopes whose records live in the vault (synced as one with the Android app's offline copy) */
const RECORD_SCOPES = new Set(['portfolio', 'loans', 'cheques', 'incomes', 'expenses', 'accounts']);

/** Focus refreshes closer together than this are skipped (a quick switch away and back) */
export const AUTO_REFRESH_GAP_MS = 30 * 1000;

const handlers = new Map(); // scope → Set<() => unknown>
const listeners = new Set();
let state = { scopes: [], refreshing: false };
let lastRefreshAt = 0;
let running = null;

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Register `fn` as a loader of `scope` while the component is mounted. `fn` may return a
 * promise (the button spins until it settles); the latest `fn` given is the one called.
 * @param {string} scope - one of REFRESH_SCOPES
 * @param {() => unknown} fn
 * @param {boolean} [enabled]
 */
export function useRefreshHandler(scope, fn, enabled = true) {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => {
    if (!enabled) return undefined;
    const call = () => fnRef.current?.();
    if (!handlers.has(scope)) handlers.set(scope, new Set());
    handlers.get(scope).add(call);
    return () => handlers.get(scope)?.delete(call);
  }, [scope, enabled]);
}

/**
 * A counter that moves on every refresh of `scope`: for a loader that is an effect, add it to
 * the effect's dependencies
 * @param {string} scope
 * @returns {number}
 */
export function useRefreshToken(scope) {
  const [token, setToken] = useState(0);
  const bump = useCallback(() => setToken((t) => t + 1), []);
  useRefreshHandler(scope, bump);
  return token;
}

/**
 * The open tab's scopes (MainPage). While set, the window's focus refreshes them.
 * @param {string[]} scopes
 */
export function usePageScopes(scopes) {
  const key = scopes.join(',');
  useEffect(() => {
    setState({ scopes: key ? key.split(',') : [] });
    return () => setState({ scopes: [] });
  }, [key]);
}

/**
 * Read the given scopes again (default: the open tab's)
 * @param {{ scopes?: string[] }} [options]
 * @returns {Promise<void>}
 */
export function refreshScopes({ scopes = state.scopes } = {}) {
  if (running) return running;
  if (!scopes.length) return Promise.resolve();
  lastRefreshAt = Date.now();
  setState({ refreshing: true });
  running = (async () => {
    try {
      // The device's copy first: the loaders then re-read it
      if (isOfflineActive() && scopes.some((s) => RECORD_SCOPES.has(s))) await syncNow().catch(() => {});
      const calls = scopes.flatMap((s) => [...(handlers.get(s) || [])]);
      await Promise.allSettled(calls.map((call) => Promise.resolve().then(call)));
    } finally {
      running = null;
      setState({ refreshing: false });
    }
  })();
  return running;
}

/** The window got focus again: the open tab's scopes, unless read a moment ago */
export function refreshOnFocus(now = Date.now()) {
  if (now - lastRefreshAt < AUTO_REFRESH_GAP_MS) return Promise.resolve();
  return refreshScopes();
}

/**
 * Refresh on the window's focus (and the Android app coming back to the foreground, where the
 * web view reports it as visible again) while the app page is open. Returns a stop function.
 */
export function startFocusRefresh() {
  if (typeof window === 'undefined') return () => {};
  // What the page loaded on opening counts as fresh
  lastRefreshAt = Date.now();
  const onFocus = () => refreshOnFocus();
  const onVisible = () => document.visibilityState === 'visible' && refreshOnFocus();
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** The open tab's refresh, for the header's button: { available, refreshing, refresh } */
export function usePageRefresh() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);
  return {
    available: snapshot.scopes.length > 0,
    refreshing: snapshot.refreshing,
    refresh: refreshScopes,
  };
}

/** For tests */
export function resetPageRefresh() {
  handlers.clear();
  running = null;
  lastRefreshAt = 0;
  state = { scopes: [], refreshing: false };
}
