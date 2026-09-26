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
 * The price book: every price in tomans under its unique id
 * @returns {Promise<{ success: boolean, updatedAt: string, items: Record<string, object> }>}
 */
export async function getPriceBook(options = {}) {
  return httpClient.get('/api/prices/book', options);
}

/**
 * Trend series of assets from the price history
 * @param {string[]} keys - asset ids
 * @param {'1d'|'7d'|'30d'|'1y'} [range]
 * @returns {Promise<{ available: boolean, range: string, bucketSec: number,
 *   sparklines: Record<string, { points: number[], first: number, last: number, changePct: number, since: string }> }>}
 */
export async function getSparklines(keys, range = '7d', options = {}) {
  const query = new URLSearchParams({ keys: keys.join(','), range });
  return httpClient.get(`/api/sparklines?${query}`, options);
}
