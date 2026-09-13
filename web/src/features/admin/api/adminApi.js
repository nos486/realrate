/**
 * adminApi.js — Admin Panel API Calls
 * Interfaces with RealRate Admin Endpoints via httpClient
 */

import { httpClient } from '../../../shared/api/httpClient.js';

export async function getAdminStats() {
  return httpClient.get('/api/admin/stats');
}

export async function getAdminUsers() {
  return httpClient.get('/api/admin/users');
}

export async function saveAdminSettings(settings) {
  return httpClient.post('/api/admin/settings', settings);
}

export async function testUsdSource(config) {
  return httpClient.post('/api/admin/test-usd-source', config);
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

export async function testPriceSource(config) {
  return httpClient.post('/api/admin/price-sources/test', config);
}

export async function inspectApiSource(apiUrl, headers = {}) {
  return httpClient.post('/api/admin/price-sources/inspect-api', { apiUrl, headers });
}

export async function fetchAllSourcesNow() {
  return httpClient.post('/api/admin/price-sources/fetch-all', {});
}

export async function getSourceTypes() {
  return httpClient.get('/api/admin/source-types');
}

export async function saveSourceType(data) {
  return httpClient.post('/api/admin/source-types', data);
}

export async function deleteSourceType(id) {
  return httpClient.delete(`/api/admin/source-types?id=${encodeURIComponent(id)}`);
}

export async function getAdminUserPortfolio(userId, portfolioId = null) {
  const url = portfolioId
    ? `/api/admin/users/portfolio?userId=${encodeURIComponent(userId)}&portfolioId=${encodeURIComponent(portfolioId)}`
    : `/api/admin/users/portfolio?userId=${encodeURIComponent(userId)}`;
  return httpClient.get(url);
}
