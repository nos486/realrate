/**
 * bankApi.js — User-defined (custom) banks. Standard banks ship with the client
 * (config/banks.config.js) and need no request.
 */
import { httpClient } from '../api/httpClient.js';

export function listCustomBanks() {
  return httpClient.get('/api/banks/custom');
}

export function createCustomBank(name) {
  return httpClient.post('/api/banks/custom', { name });
}

export function deleteCustomBank(id) {
  return httpClient.delete(`/api/banks/custom/${encodeURIComponent(id)}`);
}
