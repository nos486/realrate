/**
 * vaultApi.js — Account-wide end-to-end encryption endpoints (ciphertext only)
 *
 * `options` is passed through to httpClient (e.g. `{ silent: true }` during a bulk migration
 * that shows its own progress instead of the full-screen loader).
 */

import { httpClient } from '../api/httpClient.js';

const seg = encodeURIComponent;

export const getVault = (options) => httpClient.get('/api/vault', options);

/** Turn the vault on, or re-wrap its data key (pass `previousWrappedKey` when replacing) */
export const saveVault = ({ salt, wrappedKey, previousWrappedKey }, options) =>
  httpClient.put('/api/vault', { salt, wrappedKey, previousWrappedKey }, options);

/**
 * Records of one kind. `filters` narrow by the plaintext metadata only: { from, to } (inclusive
 * YYYY-MM-DD on the record's primary date) and { parent } (e.g. a portfolio id).
 */
export const listVaultRecords = (kind, options, filters = {}) => {
  const params = new URLSearchParams();
  for (const key of ['from', 'to', 'parent']) if (filters[key]) params.set(key, filters[key]);
  const query = params.toString();
  return httpClient.get(`/api/vault/records/${seg(kind)}${query ? `?${query}` : ''}`, options);
};

/** Store a record: ciphertext + its plaintext metadata (recordDate, parentId) */
export const putVaultRecord = (kind, id, payload, { replacePlain = false, recordDate = '', parentId = '', ...options } = {}) =>
  httpClient.put(`/api/vault/records/${seg(kind)}/${seg(id)}`, { payload, replacePlain, recordDate, parentId }, options);

export const deleteVaultRecord = (kind, id, options) =>
  httpClient.delete(`/api/vault/records/${seg(kind)}/${seg(id)}`, options);

/** Raw stored loan (parameters + states + extra payments), used to encrypt an existing loan */
export const getLoanDocument = (loanId, options) => httpClient.get(`/api/loans/${seg(loanId)}/document`, options);
