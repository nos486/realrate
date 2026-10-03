/**
 * adminApi.js — Admin Panel API Calls
 * Interfaces with RealRate Admin Endpoints via httpClient
 */

import { httpClient, HttpError } from '../../../shared/api/httpClient.js';

export async function getAdminStats() {
  return httpClient.get('/api/admin/stats');
}

/**
 * One page of registered users
 * @param {{ page?: number, pageSize?: number, q?: string, filter?: string,
 *   sort?: 'lastLogin'|'createdAt', dir?: 'asc'|'desc' }} [params]
 * @returns {Promise<{ users: object[], total: number, page: number, pageSize: number, pageCount: number }>}
 */
export async function getAdminUsers({ page = 1, pageSize = 10, q = '', filter = 'all', sort = 'lastLogin', dir = 'desc' } = {}) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), filter, sort, dir });
  if (q.trim()) params.set('q', q.trim());
  return httpClient.get(`/api/admin/users?${params}`);
}

/** Account facts and usage counts of one user */
export async function getAdminUserDetail(userId) {
  return httpClient.get(`/api/admin/users/detail?userId=${encodeURIComponent(userId)}`);
}

/** Block (true) or unblock (false) a user; blocking also signs them out everywhere */
export async function setAdminUserBlocked(userId, blocked) {
  return httpClient.post('/api/admin/users/block', { userId, blocked });
}

/** End every session of a user */
export async function signOutAdminUser(userId) {
  return httpClient.post('/api/admin/users/signout', { userId });
}

/** Send a fresh verification link to an unverified email/password account */
export async function resendAdminVerification(userId) {
  return httpClient.post('/api/admin/users/resend-verification', { userId });
}

/** Sign-ups and active users per day over the last `days` days */
export async function getAdminGrowth(days = 30) {
  return httpClient.get(`/api/admin/growth?days=${days}`);
}

export async function saveAdminSettings(settings) {
  return httpClient.post('/api/admin/settings', settings);
}

export async function getPriceSources() {
  return httpClient.get('/api/admin/price-sources');
}

export async function savePriceSource(sourceData) {
  return httpClient.post('/api/admin/price-sources', sourceData);
}

export async function deletePriceSource(id) {
  return httpClient.delete(`/api/admin/price-sources?id=${encodeURIComponent(id)}`);
}

export async function setPrimarySource(id, priceType = null) {
  return httpClient.post('/api/admin/price-sources/set-primary', { id, priceType });
}

/**
 * Test a source config. A failed test is a result to show (the server answers 400 with the
 * details), not an exception: the result body is returned either way.
 */
export async function testPriceSource(config) {
  try {
    return await httpClient.post('/api/admin/price-sources/test', config);
  } catch (err) {
    if (err instanceof HttpError && err.data && typeof err.data === 'object') return err.data;
    throw err;
  }
}

export async function inspectApiSource(apiUrl, headers = {}) {
  return httpClient.post('/api/admin/price-sources/inspect-api', { apiUrl, headers });
}

export async function fetchAllSourcesNow() {
  return httpClient.post('/api/admin/price-sources/fetch-all', {});
}



export async function getAdminUserPortfolio(userId, portfolioId = null) {
  const url = portfolioId
    ? `/api/admin/users/portfolio?userId=${encodeURIComponent(userId)}&portfolioId=${encodeURIComponent(portfolioId)}`
    : `/api/admin/users/portfolio?userId=${encodeURIComponent(userId)}`;
  return httpClient.get(url);
}

/** The price history page: tgju catalog, mappings, the book's items, the history per id */
export async function getHistoryAdmin() {
  return httpClient.get('/api/admin/history');
}

/** Save the tgju → price book mappings */
export async function saveHistoryMappings(mappings) {
  return httpClient.post('/api/admin/history/mappings', { mappings });
}

/** A tgju series' latest days and (with a target) the unit that matches the item */
export async function previewHistorySeries(slug, target = '') {
  return httpClient.post('/api/admin/history/preview', { slug, target });
}

/** Fill a price book item's past days from a tgju series */
export async function runHistoryBackfill({ slug, target, unit, days, overwrite, usdTarget = 'usd' }) {
  return httpClient.post('/api/admin/history/backfill', { slug, target, unit, days, overwrite, usdTarget });
}

/** Delete an id's history, move it to a book id, or delete every id the book doesn't know */
export async function editHistoryKeys(body) {
  return httpClient.post('/api/admin/history/keys', body);
}
