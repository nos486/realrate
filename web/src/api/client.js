/**
 * api/client.js — Backward-Compatible API wrapper delegating to shared/api/httpClient.js
 */

import {
  API_BASE,
  getToken,
  setToken,
  subscribeLoading,
  startGlobalLoading,
  stopGlobalLoading,
  httpRequest,
  httpClient,
  HttpError,
} from '../shared/api/httpClient.js';

export {
  API_BASE,
  getToken,
  setToken,
  subscribeLoading,
  startGlobalLoading,
  stopGlobalLoading,
  httpClient,
  HttpError,
};

export function getGoogleLoginUrl(returnTo = '') {
  const target = returnTo || (typeof window !== 'undefined' ? window.location.href : '/');
  return `${API_BASE}/api/auth/google/login?return_to=${encodeURIComponent(target)}`;
}

/**
 * Core fetch wrapper delegating to shared httpClient
 * Preserves the { json: async () => data } interface for legacy calls
 */
export async function apiFetch(path, options = {}) {
  try {
    const data = await httpRequest(path, options);
    return {
      ok: true,
      status: 200,
      json: async () => data,
      data,
    };
  } catch (err) {
    if (err instanceof HttpError) {
      return {
        ok: false,
        status: err.status,
        json: async () => err.data || { success: false, message: err.message, error: err.message },
        data: err.data,
      };
    }
    return {
      ok: false,
      status: 0,
      json: async () => ({ success: false, message: err?.message || 'خطای شبکه', error: err?.message || 'خطای شبکه' }),
      data: null,
    };
  }
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function apiGetMe() {
  const res = await apiFetch('/api/auth/me');
  return res.json();
}

export async function apiGoogleLogin(credential) {
  const res = await apiFetch('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });
  return res.json();
}

export async function apiLogout() {
  const res = await apiFetch('/api/auth/logout', { method: 'POST' });
  setToken(null);
  return res.json();
}

// ─── Market Data ─────────────────────────────────────────────────────────────

export async function apiGetPrices() {
  const res = await apiFetch('/api/prices');
  return res.json();
}

export async function apiGetSparklines(assetId = null) {
  const query = assetId ? `?asset=${encodeURIComponent(assetId)}` : '';
  const res = await apiFetch(`/api/sparklines${query}`);
  return res.json();
}

// Backward compatibility alias
export const apiGetRates = apiGetPrices;

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function apiAdminStats() {
  const res = await apiFetch('/api/admin/stats');
  return res.json();
}

export async function apiAdminUsers() {
  const res = await apiFetch('/api/admin/users');
  return res.json();
}

export async function apiAdminSaveSettings(settings) {
  const res = await apiFetch('/api/admin/settings', {
    method: 'POST',
    body: JSON.stringify(settings),
  });
  return res.json();
}

export async function apiAdminTestUsdSource(config) {
  const res = await apiFetch('/api/admin/test-usd-source', {
    method: 'POST',
    body: JSON.stringify(config),
  });
  return res.json();
}

// ─── Unified Price Sources (Admin) ──────────────────────────────────────────

export async function apiGetPriceSources() {
  const res = await apiFetch('/api/admin/price-sources');
  return res.json();
}

export async function apiSavePriceSource(sourceData) {
  const res = await apiFetch('/api/admin/price-sources', {
    method: 'POST',
    body: JSON.stringify(sourceData),
  });
  return res.json();
}

export async function apiDeletePriceSource(id) {
  const res = await apiFetch(`/api/admin/price-sources?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return res.json();
}

export async function apiSetPrimarySource(id, priceType = null) {
  const res = await apiFetch('/api/admin/price-sources/set-primary', {
    method: 'POST',
    body: JSON.stringify({ id, priceType }),
  });
  return res.json();
}

export async function apiTestPriceSource(config) {
  const res = await apiFetch('/api/admin/price-sources/test', {
    method: 'POST',
    body: JSON.stringify(config),
  });
  return res.json();
}

export async function apiInspectApiSource(apiUrl, headers = {}) {
  const res = await apiFetch('/api/admin/price-sources/inspect-api', {
    method: 'POST',
    body: JSON.stringify({ apiUrl, headers }),
  });
  return res.json();
}

export async function apiFetchAllSourcesNow() {
  const res = await apiFetch('/api/admin/price-sources/fetch-all', {
    method: 'POST',
  });
  return res.json();
}


// ─── Source Types (Dynamic Price Type Registry) ───────────────────────────────

export async function apiGetSourceTypes() {
  const res = await apiFetch('/api/admin/source-types');
  return res.json();
}

export async function apiSaveSourceType(data) {
  const res = await apiFetch('/api/admin/source-types', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function apiDeleteSourceType(id) {
  const res = await apiFetch(`/api/admin/source-types?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return res.json();
}
// ─── Portfolios (Multi-portfolio Management) ───────────────────────────────

export async function apiGetPortfolios() {
  const res = await apiFetch('/api/portfolios');
  return res.json();
}

export async function apiCreatePortfolio(portfolioData) {
  const res = await apiFetch('/api/portfolios', {
    method: 'POST',
    body: JSON.stringify(portfolioData),
  });
  return res.json();
}

export async function apiUpdatePortfolio(portfolioData) {
  const res = await apiFetch('/api/portfolios', {
    method: 'PUT',
    body: JSON.stringify(portfolioData),
  });
  return res.json();
}

export async function apiDeletePortfolio(id) {
  const res = await apiFetch(`/api/portfolios?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return res.json();
}

// ─── Holdings ───────────────────────────────────────────────────────────────

export async function apiGetPortfolio(portfolioId = null) {
  const cleanId = (typeof portfolioId === 'string' && portfolioId.trim() && portfolioId !== '[object Object]')
    ? portfolioId.trim()
    : (typeof portfolioId === 'object' && portfolioId !== null && typeof portfolioId.id === 'string' && portfolioId.id.trim())
      ? portfolioId.id.trim()
      : null;
  const url = cleanId
    ? `/api/portfolio?portfolioId=${encodeURIComponent(cleanId)}`
    : '/api/portfolio';
  const res = await apiFetch(url);
  return res.json();
}

export async function apiAddPortfolioHolding(holdingData) {
  const res = await apiFetch('/api/portfolio', {
    method: 'POST',
    body: JSON.stringify(holdingData),
  });
  return res.json();
}

export async function apiUpdatePortfolioHolding(holdingData) {
  const res = await apiFetch('/api/portfolio', {
    method: 'PUT',
    body: JSON.stringify(holdingData),
  });
  return res.json();
}

export async function apiDeletePortfolioHolding(id) {
  const res = await apiFetch(`/api/portfolio?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return res.json();
}

// ─── User Settings & Shared Portfolio ────────────────────────────────────────

export async function apiGetUserSettings() {
  const res = await apiFetch('/api/user/settings');
  return res.json();
}

export async function apiUpdateUserSettings(settings) {
  const res = await apiFetch('/api/user/settings', {
    method: 'POST',
    body: JSON.stringify(settings),
  });
  return res.json();
}

export async function apiGetSharedPortfolio(slug, password = '') {
  const res = await apiFetch('/api/portfolio/shared', {
    method: 'POST',
    body: JSON.stringify({ slug, password }),
  });
  return res.json();
}

export async function apiAdminGetUserPortfolio(userId, portfolioId = null) {
  const url = portfolioId
    ? `/api/admin/users/portfolio?userId=${encodeURIComponent(userId)}&portfolioId=${encodeURIComponent(portfolioId)}`
    : `/api/admin/users/portfolio?userId=${encodeURIComponent(userId)}`;
  const res = await apiFetch(url);
  return res.json();
}

/**
 * Search Bourse (TSETMC) stock market symbols
 * @param {string} q
 * @param {number} limit
 */
export async function apiSearchBourseSymbols(q = '', limit = 50) {
  const url = `/api/bourse/symbols?q=${encodeURIComponent(q)}&limit=${limit}`;
  const res = await apiFetch(url);
  return res.json();
}

/**
 * Sync Bourse symbols from external provider
 */
export async function apiSyncBourseSymbols() {
  const res = await apiFetch('/api/bourse/sync', { method: 'POST' });
  return res.json();
}


/**
 * Fetch unified market assets and catalog
 * @param {string} [q] - Search query
 * @param {string} [category] - Category filter
 */
export async function apiGetMarketItems(q = '', category = '') {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  const qs = params.toString();
  const res = await apiFetch(`/api/market/items${qs ? `?${qs}` : ''}`);
  return res.json();
}


