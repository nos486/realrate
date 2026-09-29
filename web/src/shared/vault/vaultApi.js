/**
 * vaultApi.js — Account-wide end-to-end encryption endpoints (ciphertext only)
 *
 * `options` is passed through to httpClient (e.g. `{ silent: true }` during a bulk migration
 * that shows its own progress instead of the full-screen loader).
 *
 * With the device's offline copy on (the Android app, shared/offline/offlineSync.js):
 * - records are listed from the copy once it is complete (fast, and without a connection)
 * - a change goes to the server as before; without a connection it is kept in the copy and
 *   queued, and sent when the connection is back (a refusal from the server still fails as before)
 * - the vault itself (salt + wrapped key) is remembered, so it can be unlocked offline
 */

import { httpClient } from '../api/httpClient.js';
import * as offline from '../offline/offlineSync.js';

const seg = encodeURIComponent;

export const getVault = async (options) => {
  if (!offline.isOfflineActive()) return httpClient.get('/api/vault', options);
  try {
    const res = await httpClient.get('/api/vault', options);
    offline.reportOnline();
    await offline.remember('vault', res);
    return res;
  } catch (err) {
    if (offline.isNetworkError(err)) {
      offline.reportOffline();
      const cached = await offline.recall('vault');
      if (cached) return cached;
    }
    throw err;
  }
};

/** Turn the vault on, or re-wrap its data key (pass `previousWrappedKey` when replacing) */
export const saveVault = ({ salt, wrappedKey, previousWrappedKey }, options) =>
  httpClient.put('/api/vault', { salt, wrappedKey, previousWrappedKey }, options);

/**
 * Records of one kind. `filters` work on the plaintext metadata only: { from, to } (inclusive
 * YYYY-MM-DD on the record's primary date), { parent } (e.g. a portfolio id), { undated: true }
 * (records whose date still needs fixing) and { order: 'asc' | 'desc' }. With { limit, offset }
 * one page comes back with the `total` matching.
 */
export const listVaultRecords = async (kind, options, filters = {}) => {
  if (offline.isOfflineReady()) {
    const res = await offline.getLocalStore().queryRecords(kind, filters);
    offline.syncSoon(2000);
    return { success: true, ...res };
  }
  const params = new URLSearchParams();
  for (const key of ['from', 'to', 'parent', 'order']) if (filters[key]) params.set(key, filters[key]);
  if (filters.undated) params.set('undated', '1');
  if (filters.limit) {
    params.set('limit', String(filters.limit));
    params.set('offset', String(filters.offset || 0));
  }
  const query = params.toString();
  return httpClient.get(`/api/vault/records/${seg(kind)}${query ? `?${query}` : ''}`, options);
};

/** Store a record: ciphertext + its plaintext metadata (recordDate, parentId) */
export const putVaultRecord = async (kind, id, payload, { replacePlain = false, recordDate = '', parentId = '', ...options } = {}) => {
  const body = { payload, replacePlain, recordDate, parentId };
  const path = `/api/vault/records/${seg(kind)}/${seg(id)}`;
  if (!offline.isOfflineActive()) return httpClient.put(path, body, options);
  try {
    const res = await httpClient.put(path, body, options);
    offline.reportOnline();
    await offline.keepRecord(kind, id, { payload, recordDate, parentId, updatedAt: res?.record?.updatedAt });
    return res;
  } catch (err) {
    if (!offline.isNetworkError(err)) throw err;
    offline.reportOffline();
    // Kept and queued: sent when the connection is back
    await offline.keepRecord(kind, id, { payload, recordDate, parentId });
    await offline.queueChange({ op: 'put', kind, id, body });
    return { success: true, queued: true, record: { id, kind, payload, recordDate, parentId } };
  }
};

export const deleteVaultRecord = async (kind, id, options) => {
  const path = `/api/vault/records/${seg(kind)}/${seg(id)}`;
  if (!offline.isOfflineActive()) return httpClient.delete(path, options);
  try {
    const res = await httpClient.delete(path, options);
    offline.reportOnline();
    await offline.forgetRecord(kind, id);
    return res;
  } catch (err) {
    if (!offline.isNetworkError(err)) {
      // Already gone on the server: gone here too
      if (err.status === 404) await offline.forgetRecord(kind, id);
      throw err;
    }
    offline.reportOffline();
    await offline.forgetRecord(kind, id);
    await offline.queueChange({ op: 'delete', kind, id });
    return { success: true, queued: true };
  }
};

/** Raw stored loan (parameters + states + extra payments), used to encrypt an existing loan */
export const getLoanDocument = (loanId, options) => httpClient.get(`/api/loans/${seg(loanId)}/document`, options);
