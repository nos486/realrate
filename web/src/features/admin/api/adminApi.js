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
 * @param {{ page?: number, pageSize?: number, q?: string, sort?: 'lastLogin'|'createdAt', dir?: 'asc'|'desc' }} [params]
 * @returns {Promise<{ users: object[], total: number, page: number, pageSize: number, pageCount: number }>}
 */
export async function getAdminUsers({ page = 1, pageSize = 10, q = '', sort = 'lastLogin', dir = 'desc' } = {}) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort, dir });
  if (q.trim()) params.set('q', q.trim());
  return httpClient.get(`/api/admin/users?${params}`);
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
