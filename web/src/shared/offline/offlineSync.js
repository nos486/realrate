/**
 * offlineSync.js — Keeps the device's copy of the encrypted records in step with the server
 * (Android app): fast screens from the local copy, and changes made offline sent later
 *
 * Only ciphertext is kept (localStore.js). One sync round:
 *  1. push: the changes queued while offline (outbox), in order. A change the server refuses
 *     (not a network problem) is dropped and the copy is rebuilt from the server.
 *  2. pull: GET /api/vault/sync — every change after the saved cursor (records stored and
 *     deleted), page by page. A new `epoch` or `reset` starts the copy over.
 * Rounds run on start, when the connection comes back, when the app returns to the foreground,
 * after an offline change and on the header's refresh button — never on a timer while online.
 * While offline a light probe checks every
 * little while whether the server is reachable again.
 *
 * Online or offline (the bar at the top): the browser's own offline event is believed at once; a
 * request that got no answer is only a suspicion — the app tries again and says «آفلاین» only
 * when nothing reached the server for OFFLINE_CONFIRM_MS (a dropped request while switching
 * networks or a VPN reconnecting is not "offline"). Only no answer (status 0) or a gateway error
 * counts as a network problem: any other error is a bug or a refusal, never "offline".
 *
 * When a round brings changes, VAULT_CHANGED_EVENT tells the screens to read again.
 * vaultApi.js decides, per call, whether to answer from the copy or queue a change.
 */

import { httpClient, HttpError } from '../api/httpClient.js';
import { openLocalStore, deleteLocalStore, isLocalStoreAvailable } from './localStore.js';

export const VAULT_CHANGED_EVENT = 'realrate:vault-changed';
export const OFFLINE_SYNC_ERROR_EVENT = 'realrate:offline-sync-error';

const SYNC_PAGE = 500;
const PROBE_MS = 15 * 1000;
/** How long requests must keep failing before the app says it is offline, and when it retries meanwhile */
const OFFLINE_CONFIRM_MS = 6 * 1000;
const RETRY_AFTER_FAILURE_MS = 1500;
let confirmMs = OFFLINE_CONFIRM_MS;
/** Each round re-reads the last seconds before its cursor: a change stored a moment late is not missed */
const CURSOR_OVERLAP_MS = 10 * 1000;

const initialState = { active: false, ready: false, online: true, syncing: false, pending: 0, lastSyncAt: 0 };
let state = { ...initialState, online: typeof navigator === 'undefined' ? true : navigator.onLine !== false };
let userId = null;
let store = null;
let enabled = () => false;
let round = null;
let again = false;
let timers = [];
let unlisten = [];
const listeners = new Set();

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

export function subscribeOffline(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getOfflineState() {
  return state;
}

// The browser's own view of the connection (the website too: the bar says when it is offline)
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => reportOnline());
  window.addEventListener('offline', () => reportOffline({ certain: true }));
}

/**
 * Whether this device keeps a copy at all (the Android app; decided by the caller of
 * configureOffline). `offlineConfirmMs`: how long failures must last before «آفلاین» (tests)
 */
export function configureOffline({ isEnabled, offlineConfirmMs }) {
  if (isEnabled) enabled = isEnabled;
  if (offlineConfirmMs !== undefined) confirmMs = offlineConfirmMs;
}

/** Offline copy in use for the signed-in user */
export function isOfflineActive() {
  return Boolean(state.active && store);
}

/** The copy is complete (synced at least once): reads can come from it */
export function isOfflineReady() {
  return Boolean(state.active && store && state.ready);
}

export function getLocalStore() {
  return store;
}

/**
 * No answer from the server (no connection, a dropped connection, a gateway error) as opposed to
 * the server refusing the request — or a bug, which is never taken for being offline
 */
export function isNetworkError(err) {
  if (!(err instanceof HttpError)) return false;
  if (err.data?.errorCode === 'MAINTENANCE') return false;
  return [0, 502, 503, 504].includes(err.status);
}

/**
 * A request got no answer. `certain` (the browser says it is offline): offline at once. Otherwise
 * try again shortly and say offline only if nothing reaches the server for `confirmMs`.
 */
export function reportOffline({ certain = false } = {}) {
  if (!state.online) return;
  const browserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (certain || browserOffline || confirmMs <= 0) {
    goOffline();
    return;
  }
  if (timers.confirm) return;
  timers.confirm = setTimeout(() => {
    timers.confirm = null;
    goOffline();
  }, confirmMs);
  if (state.active) {
    clearTimeout(timers.retry);
    timers.retry = setTimeout(() => syncNow().catch(() => {}), RETRY_AFTER_FAILURE_MS);
  }
}

function goOffline() {
  clearTimeout(timers.confirm);
  timers.confirm = null;
  if (!state.online) return;
  setState({ online: false });
  if (state.active) startProbe();
}

/** Something reached the server: online (a pending suspicion is dropped) */
export function reportOnline() {
  clearTimeout(timers.confirm);
  timers.confirm = null;
  if (state.online) return;
  setState({ online: true });
  syncSoon();
}

/** The server answered (inside a sync round: no new round is started) */
function markReachable() {
  clearTimeout(timers.confirm);
  timers.confirm = null;
  if (!state.online) setState({ online: true });
}

function startProbe() {
  if (timers.probe) return;
  timers.probe = setInterval(() => {
    if (state.online) {
      clearInterval(timers.probe);
      timers.probe = null;
      return;
    }
    syncNow().catch(() => {});
  }, PROBE_MS);
}

/**
 * Start keeping the copy for `id` (signing in / opening the app). Returns once the store is
 * open; the first sync runs in the background.
 */
export async function startOffline(id) {
  if (!enabled() || !isLocalStoreAvailable() || !id) return;
  if (state.active && userId === id) return;
  await stopOffline();
  try {
    store = await openLocalStore(id);
  } catch (err) {
    console.warn('Offline copy unavailable:', err);
    store = null;
    return;
  }
  userId = id;
  const [ready, pending] = await Promise.all([store.getMeta('synced'), store.outboxCount()]);
  setState({ active: true, ready: Boolean(ready), pending });

  if (typeof document !== 'undefined') {
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncSoon();
    };
    document.addEventListener('visibilitychange', onVisible);
    unlisten.push(() => document.removeEventListener('visibilitychange', onVisible));
  }
  if (!state.online) startProbe();
  syncSoon();
}

/** Stop (and with `clear`, delete the copy: signing out) */
export async function stopOffline({ clear = false } = {}) {
  const id = userId;
  clearInterval(timers.probe);
  clearTimeout(timers.soon);
  clearTimeout(timers.confirm);
  clearTimeout(timers.retry);
  timers = [];
  unlisten.splice(0).forEach((fn) => fn());
  store?.close();
  store = null;
  userId = null;
  setState({ active: false, ready: false, syncing: false, pending: 0 });
  if (clear && id) await deleteLocalStore(id);
}

/** A sync round shortly (several calls in a row run one round) */
export function syncSoon(delay = 400) {
  if (!state.active) return;
  clearTimeout(timers.soon);
  timers.soon = setTimeout(() => syncNow().catch(() => {}), delay);
}

/** Run a sync round now (or once the one running ends) */
export function syncNow() {
  if (!state.active || !store) return Promise.resolve();
  if (round) {
    again = true;
    return round;
  }
  round = (async () => {
    setState({ syncing: true });
    try {
      do {
        again = false;
        await pushOutbox();
        await pull();
      } while (again && state.online);
      setState({ lastSyncAt: Date.now() });
    } catch (err) {
      if (isNetworkError(err)) reportOffline();
      else console.warn('Sync failed:', err);
    } finally {
      round = null;
      setState({ syncing: false, pending: store ? await store.outboxCount().catch(() => state.pending) : 0 });
    }
  })();
  return round;
}

const seg = encodeURIComponent;

async function send(op) {
  if (op.op === 'delete') {
    try {
      await httpClient.delete(`/api/vault/records/${seg(op.kind)}/${seg(op.id)}`, { silent: true });
    } catch (err) {
      // Already gone: nothing left to do
      if (!(err instanceof HttpError && err.status === 404)) throw err;
    }
    return;
  }
  await httpClient.put(`/api/vault/records/${seg(op.kind)}/${seg(op.id)}`, op.body, { silent: true });
}

async function pushOutbox() {
  const ops = await store.outbox();
  let refused = 0;
  for (const op of ops) {
    try {
      await send(op);
    } catch (err) {
      if (isNetworkError(err)) throw err;
      // The server refuses it (validation, a feature closed…): it will never go through
      refused++;
      window.dispatchEvent(new CustomEvent(OFFLINE_SYNC_ERROR_EVENT, { detail: { op, message: err.message } }));
    }
    await store.dequeue(op.seq);
    markReachable();
    setState({ pending: Math.max(0, state.pending - 1) });
  }
  // The copy may now differ from the server: rebuild it
  if (refused) await resetCopy();
}

async function resetCopy() {
  await store.clearRecords();
  await store.setMeta('cursor', '');
  await store.setMeta('epoch', '');
}

function overlapped(cursor) {
  if (!cursor) return '';
  const time = Date.parse(cursor.split('|')[0]);
  return Number.isNaN(time) ? '' : `${new Date(time - CURSOR_OVERLAP_MS).toISOString()}||`;
}

async function pull() {
  let cursor = (await store.getMeta('cursor')) || '';
  let epoch = (await store.getMeta('epoch')) || '';
  const firstSync = !(await store.getMeta('synced'));
  const changedKinds = new Set();
  let restarted = false;
  let request = overlapped(cursor);

  for (;;) {
    const res = await httpClient.get(`/api/vault/sync?cursor=${seg(request)}&limit=${SYNC_PAGE}`, { silent: true });
    markReachable();
    if (!restarted && (res.reset || (epoch && res.epoch !== epoch))) {
      // Another vault (a reset account) or deletions no longer known: start the copy over
      restarted = true;
      await store.clearRecords();
      cursor = '';
      request = '';
      epoch = res.epoch || '';
      changedKinds.add('*');
      continue;
    }
    epoch = res.epoch || epoch;
    const records = res.records || [];
    const deleted = res.deleted || [];
    if (records.length || deleted.length) {
      // What the copy did not have yet (records re-read in the overlap window are not news)
      for (const r of records) {
        const local = await store.getRecord(r.kind, r.id);
        if (!local || local.updatedAt !== r.updatedAt || local.payload !== r.payload) changedKinds.add(r.kind);
      }
      for (const d of deleted) {
        if (await store.getRecord(d.kind, d.id)) changedKinds.add(d.kind);
      }
      await store.applyChanges({ put: records, remove: deleted });
    }
    cursor = res.cursor || cursor;
    request = cursor;
    if (!res.more) break;
  }

  await store.setMeta('cursor', cursor);
  await store.setMeta('epoch', epoch);
  if (firstSync) {
    await store.setMeta('synced', true);
    setState({ ready: true });
  }
  // The first sync always is news: screens switch to the copy
  if (firstSync) changedKinds.add('*');
  if (changedKinds.size) notifyChanged(changedKinds);
}

function notifyChanged(kinds) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(VAULT_CHANGED_EVENT, { detail: { kinds: [...kinds] } }));
}

// ── Used by vaultApi.js ──

/** Store a record in the copy (after the server took it, or queued) */
export async function keepRecord(kind, id, { payload, recordDate = '', parentId = '', updatedAt }) {
  if (!store) return;
  const existing = await store.getRecord(kind, id);
  const now = new Date().toISOString();
  await store.applyChanges({
    put: [{ kind, id, payload, recordDate, parentId, createdAt: existing?.createdAt || updatedAt || now, updatedAt: updatedAt || now }],
  });
}

export async function forgetRecord(kind, id) {
  if (store) await store.applyChanges({ remove: [{ kind, id }] });
}

/** Queue a change made offline; sent at the next round with a connection */
export async function queueChange(op) {
  if (!store) throw new Error('offline copy not available');
  await store.enqueue(op);
  setState({ pending: state.pending + 1 });
  startProbe();
}

export async function remember(key, value) {
  if (store) await store.setMeta(key, value);
}

export async function recall(key) {
  return store ? store.getMeta(key) : undefined;
}
