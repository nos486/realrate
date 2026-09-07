/**
 * api/client.js — Centralized API fetch wrapper
 *
 * - In development: requests go to /api/* (proxied by Vite to localhost:8787)
 * - In production: requests go to VITE_API_URL env var (e.g. https://realrate-api.workers.dev)
 *
 * Auth: token stored in localStorage, sent as Authorization: Bearer <token>
 */

const API_BASE = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? 'https://realrate-api.geekio.org' : '')
).replace(/\/$/, '');

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

/**
 * Core fetch wrapper — adds Authorization header if token exists
 */
async function apiFetch(path, options = {}) {
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

export async function apiGetRates() {
  const res = await apiFetch('/api/rates');
  return res.json();
}

export async function apiCalculate(usdToman, goldUsd) {
  const params = new URLSearchParams({ usd_toman: usdToman, gold_usd: goldUsd });
  const res = await apiFetch(`/api/calculate?${params}`);
  return res.json();
}

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

// ─── Portfolio ───────────────────────────────────────────────────────────────

export async function apiGetPortfolio() {
  const res = await apiFetch('/api/portfolio');
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

export async function apiAdminGetUserPortfolio(userId) {
  const res = await apiFetch(`/api/admin/users/portfolio?userId=${encodeURIComponent(userId)}`);
  return res.json();
}


