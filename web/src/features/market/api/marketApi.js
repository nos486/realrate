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
 * Trend series of assets from the price history (one point per day)
 * @param {string[]} keys - asset ids
 * @param {'7d'|'30d'|'90d'|'1y'|'2y'} [range]
 * @param {{ candles?: boolean }} [options] - candles: also each day's [open, high, low, close]
 * @returns {Promise<{ available: boolean, range: string, bucketSec: number,
 *   sparklines: Record<string, { points: number[], days: string[], first: number, last: number, changePct: number, since: string, candles?: number[][] }> }>}
 */
export async function getSparklines(keys, range = '7d', { candles = false, ...options } = {}) {
  const query = new URLSearchParams({ keys: keys.join(','), range });
  if (candles) query.set('candles', '1');
  return httpClient.get(`/api/sparklines?${query}`, options);
}

/**
 * One asset's whole daily history: a close per day from `since` to today
 * @param {string} key - asset id
 * @returns {Promise<{ available: boolean, key: string, since: string|null, values: number[] }>}
 */
export async function getPriceHistory(key, options = {}) {
  return httpClient.get(`/api/prices/history?${new URLSearchParams({ key })}`, options);
}
