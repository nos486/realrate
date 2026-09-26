/**
 * marketApi.js — Market Feature API Calls
 * Interfaces with RealRate API via centralized httpClient
 */

import { httpClient } from '../../../shared/api/httpClient.js';

/**
 * The price book: every price in tomans under its unique id, with the global settings. The one
 * request that brings the app its prices.
 * @returns {Promise<{ success: boolean, updatedAt: string, items: Record<string, object>, globalSettings: object }>}
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
