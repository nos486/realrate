/**
 * marketApi.js — Market Feature API Calls
 * Interfaces with RealRate API via centralized httpClient
 */

import { httpClient } from '../../../shared/api/httpClient.js';

/**
 * Fetch unified market items catalog (gold, coins, forex, crypto, bourse)
 * @param {string} [q] - Search query
 * @param {string} [category] - Category filter
 * @returns {Promise<object>}
 */
export async function getMarketItems(q = '', category = '', options = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  const qs = params.toString();
  return httpClient.get(`/api/market/items${qs ? `?${qs}` : ''}`, options);
}

/**
 * Fetch raw market prices snapshot across all sources
 * @param {object} [options] - httpClient options (e.g. { silent: true } for background refreshes)
 * @returns {Promise<object>}
 */
export async function getPrices(options = {}) {
  return httpClient.get('/api/prices', options);
}

/**
 * Fetch sparkline trend series
 * @param {string|null} [assetId]
 * @returns {Promise<object>}
 */
export async function getSparklines(assetId = null) {
  const query = assetId ? `?asset=${encodeURIComponent(assetId)}` : '';
  return httpClient.get(`/api/sparklines${query}`);
}
