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

export const deleteVault = (options) => httpClient.delete('/api/vault', options);

export const listVaultRecords = (kind, options) => httpClient.get(`/api/vault/records/${seg(kind)}`, options);

export const putVaultRecord = (kind, id, payload, { replacePlain = false, ...options } = {}) =>
  httpClient.put(`/api/vault/records/${seg(kind)}/${seg(id)}`, { payload, replacePlain }, options);

export const deleteVaultRecord = (kind, id, options) =>
  httpClient.delete(`/api/vault/records/${seg(kind)}/${seg(id)}`, options);

export const restoreVaultRecord = (kind, id, plain, options) =>
  httpClient.post(`/api/vault/records/${seg(kind)}/${seg(id)}/restore`, { plain }, options);

/** Raw stored loan (parameters + states + extra payments), used to encrypt an existing loan */
export const getLoanDocument = (loanId, options) => httpClient.get(`/api/loans/${seg(loanId)}/document`, options);
