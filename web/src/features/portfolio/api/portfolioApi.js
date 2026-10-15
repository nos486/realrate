/**
 * portfolioApi.js — Portfolios (their names, share settings and wrapped keys) and the user's
 * settings, via the Worker API. A portfolio's items are encrypted vault records
 * (shared/vault/vaultPortfolioItems.js).
 */

import { httpClient } from '../../../shared/api/httpClient.js';
import { syncSoon } from '../../../shared/offline/offlineSync.js';

export async function getPortfolios() {
  return httpClient.get('/api/portfolios');
}

export async function createPortfolio(portfolioData) {
  return httpClient.post('/api/portfolios', portfolioData);
}

export async function updatePortfolio(portfolioData, options) {
  return httpClient.put('/api/portfolios', portfolioData, options);
}

export async function deletePortfolio(id) {
  const res = await httpClient.delete(`/api/portfolios?id=${encodeURIComponent(id)}`);
  // Its encrypted items were deleted on the server: the device's copy learns it now
  syncSoon(0);
  return res;
}

export async function getSharedPortfolio(slug, password = '') {
  // A read sent as POST only to keep the password out of the URL — the page shows its own
  // skeleton, not the full-screen write overlay
  return httpClient.post('/api/portfolio/shared', { slug, password }, { silent: true });
}

export async function getUserSettings() {
  return httpClient.get('/api/user/settings');
}

export async function updateUserSettings(settings) {
  return httpClient.post('/api/user/settings', settings);
}

