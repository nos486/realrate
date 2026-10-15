/**
 * chequeApi.js — The cheques feature's data: every cheque is an end-to-end encrypted vault
 * record (shared/vault/vaultCheques.js); and the cheque scan, which reads a photo on the server
 * and stores nothing.
 */

import { httpClient } from '../../../shared/api/httpClient.js';

export { getCheques, createCheque, updateCheque, deleteCheque } from '../../../shared/vault/vaultCheques.js';

/**
 * Scans a cheque image (read by Gemini on the server)
 *
 * @param {Blob|File} imageBlob
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<object>}
 */
export async function scanCheque(imageBlob, { signal } = {}) {
  const formData = new FormData();
  formData.append('image', imageBlob, 'cheque.jpg');
  return httpClient.post('/api/cheques/scan', formData, { signal });
}

/**
 * Today's cheque scans: `limit` (null: no limit), `used`, `remaining` (null: no limit)
 * @returns {Promise<{ quota: { limit: number|null, used: number, remaining: number|null } }>}
 */
export async function getScanQuota() {
  return httpClient.get('/api/cheques/scan/quota', { silent: true });
}
