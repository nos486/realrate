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
 *  - coming back to the app (the Android app returning from the background, or the page becoming
 *    visible again after being hidden): the open tab's scopes, every time — events fired together
 *    by one return are merged (RETURN_MERGE_MS)
 *  - the window gets focus again (the website, the page still visible): the open tab's scopes, at
 *    most once per AUTO_REFRESH_GAP_MS
 *  - opening a tab again: a tab's records load with it, but the prices and the news are kept for
 *    the whole visit (KEPT_SCOPES) — so the tab opened reads those of its scopes again, each at
 *    most once per AUTO_REFRESH_GAP_MS (back on the home, its rates and news are fresh)
 * Nothing runs on a timer.
 *
 * With the Android app's offline copy (shared/offline), records are read from the device: a
 * refresh of record scopes first runs one sync round with the server, then the loaders re-read
 * the copy.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { isOfflineActive, syncNow } from '../offline/offlineSync.js';
import { isNativeApp } from '../native/nativeApp.js';

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
  subscriptions: 'subscriptions',
};

/** Scopes whose records live in the vault (synced as one with the Android app's offline copy) */
const RECORD_SCOPES = new Set(['portfolio', 'loans', 'cheques', 'incomes', 'expenses', 'accounts', 'subscriptions']);

/** Scopes whose data outlives a tab (PricingContext's book, useNews' answers): a tab opened
 *  again would show them as they were, so opening it reads them again */
export const KEPT_SCOPES = new Set(['prices', 'news']);

/** Focus refreshes closer together than this are skipped (a quick switch away and back) */
export const AUTO_REFRESH_GAP_MS = 30 * 1000;

/** One return fires several events (resume, visible, focus): those this close make one refresh */
export const RETURN_MERGE_MS = 2 * 1000;

const handlers = new Map(); // scope → Set<() => unknown>
const listeners = new Set();
let state = { scopes: [], refreshing: false };
let lastRefreshAt = 0;
let openedAt = 0; // when the app page opened: what it loaded then counts as fresh
const readAt = new Map(); // scope → when it was last read again
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
 * The open tab's scopes (MainPage). While set, the window's focus refreshes them; when another
 * tab opens, its kept scopes are read again (refreshOnTabOpen).
 * @param {string[]} scopes
 * @param {string} [tab] - the open tab (default: its scopes)
 */
export function usePageScopes(scopes, tab) {
  const key = scopes.join(',');
  const openKey = tab ?? key;
  const lastOpenRef = useRef(null);
  useEffect(() => {
    const list = key ? key.split(',') : [];
    setState({ scopes: list });
    // Another tab than the one before (not the page's first one: it has just loaded)
    if (lastOpenRef.current !== null && lastOpenRef.current !== openKey) refreshOnTabOpen(list);
    lastOpenRef.current = openKey;
    return () => setState({ scopes: [] });
  }, [key, openKey]);
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
  scopes.forEach((s) => readAt.set(s, lastRefreshAt));
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
 * A tab opened (switching tabs): its kept scopes (KEPT_SCOPES) not read in the last
 * AUTO_REFRESH_GAP_MS — what it loads itself (its records) it has just loaded
 * @param {string[]} scopes - the tab's
 */
export function refreshOnTabOpen(scopes, now = Date.now()) {
  const due = scopes.filter((s) => KEPT_SCOPES.has(s) && now - (readAt.get(s) ?? openedAt) >= AUTO_REFRESH_GAP_MS);
  return due.length ? refreshScopes({ scopes: due }) : Promise.resolve();
}

/** Back from the background (minimized, another app): the open tab's scopes, every time */
export function refreshOnReturn(now = Date.now()) {
  if (now - lastRefreshAt < RETURN_MERGE_MS) return Promise.resolve();
  return refreshScopes();
}

/**
 * Refresh while the app page is open: on coming back from the background — the Android app's
 * `resume` (the web view's own events are not reliable there) or the page becoming visible after
 * being hidden — and on the window's focus. Returns a stop function.
 */
export function startFocusRefresh() {
  if (typeof window === 'undefined') return () => {};
  // What the page loaded on opening counts as fresh
  lastRefreshAt = Date.now();
  openedAt = lastRefreshAt;
  let wasHidden = document.visibilityState === 'hidden';
  let stopped = false;
  const stops = [];

  const onFocus = () => refreshOnFocus();
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      wasHidden = true;
    } else if (wasHidden) {
      wasHidden = false;
      refreshOnReturn();
    }
  };
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisibility);
  stops.push(() => {
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisibility);
  });

  if (isNativeApp()) {
    import('@capacitor/app').then(async ({ App }) => {
      if (stopped) return;
      const handle = await App.addListener('resume', () => refreshOnReturn());
      if (stopped) handle.remove();
      else stops.push(() => handle.remove());
    }).catch(() => {});
  }

  return () => {
    stopped = true;
    stops.splice(0).forEach((fn) => fn());
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
  openedAt = 0;
  readAt.clear();
  state = { scopes: [], refreshing: false };
}
