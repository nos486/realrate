/**
 * api/client.js — Centralized API fetch wrapper
 *
 * - In development: requests go to /api/* (proxied by Vite to localhost:8787)
 * - In production: requests go to VITE_API_URL env var (e.g. https://realrate-api.workers.dev)
 *
 * Auth: token stored in localStorage, sent as Authorization: Bearer <token>
 */

export const API_BASE = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? 'https://realrate-api.geekio.org' : '')
).replace(/\/$/, '');

export function getGoogleLoginUrl(returnTo = '') {
  const target = returnTo || (typeof window !== 'undefined' ? window.location.href : '/');
  return `${API_BASE}/api/auth/google/login?return_to=${encodeURIComponent(target)}`;
}

/**
 * Get the stored auth token from localStorage
 */
export function getToken() {
  try {
    return localStorage.getItem('realrate_token') || null;
  } catch {
    return null;
  }
}

/**
 * Store auth token in localStorage
 */
export function setToken(token) {
  try {
    if (token) {
      localStorage.setItem('realrate_token', token);
    } else {
      localStorage.removeItem('realrate_token');
    }
  } catch {}
}

let activeLoadingCount = 0;
const loadingListeners = new Set();

function emitLoadingChange() {
  const isLoading = activeLoadingCount > 0;
  loadingListeners.forEach((fn) => {
    try {
      fn(isLoading);
    } catch (err) {
      console.error('Loading listener error:', err);
    }
  });
}

/**
 * Subscribe to global active network loading state
 */
export function subscribeLoading(listener) {
  loadingListeners.add(listener);
  listener(activeLoadingCount > 0);
  return () => {
    loadingListeners.delete(listener);
  };
}

export function startGlobalLoading() {
  activeLoadingCount++;
  emitLoadingChange();
}

export function stopGlobalLoading() {
  activeLoadingCount = Math.max(0, activeLoadingCount - 1);
  emitLoadingChange();
}

/**
 * Core fetch wrapper — adds Authorization header if token exists
 * Tracks active loading requests unless options.silent is true
 */
async function apiFetch(path, options = {}) {
  const isSilent = Boolean(options.silent);
  if (!isSilent) {
    startGlobalLoading();
  }

  try {
    const token = getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: 'include',  // also send cookies if present
    });

    return res;
  } finally {
    if (!isSilent) {
      stopGlobalLoading();
    }
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

export async function apiGetHistoricalBenchmarks() {
  const res = await apiFetch('/api/prices/historical-benchmarks');
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

export async function apiGetPriceHistory({ sourceId = null, priceType = null, range = '24h', limit = 200 } = {}) {
  const params = new URLSearchParams();
  if (sourceId) params.append('sourceId', sourceId);
  if (priceType) params.append('priceType', priceType);
  if (range) params.append('range', range);
  if (limit) params.append('limit', limit);
  const res = await apiFetch(`/api/admin/price-history?${params.toString()}`);
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

// ─── Derived Assets (فرمول‌ها و اقلام محاسباتی) ──────────────────────────────

/**
 * Fetch active derived assets (public)
 */
export async function apiGetDerivedAssets() {
  const res = await apiFetch('/api/derived-assets');
  return res.json();
}

/**
 * Fetch all derived assets (admin)
 */
export async function apiAdminGetDerivedAssets() {
  const res = await apiFetch('/api/admin/derived-assets');
  return res.json();
}

/**
 * Create or update a derived asset (admin)
 */
export async function apiAdminSaveDerivedAsset(data) {
  const res = await apiFetch('/api/admin/derived-assets', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.json();
}

/**
 * Delete a derived asset (admin)
 */
export async function apiAdminDeleteDerivedAsset(id) {
  const res = await apiFetch(`/api/admin/derived-assets?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return res.json();
}


