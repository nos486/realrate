/**
 * httpClient.js — Centralized HTTP Client for RealRate Web Client
 *
 * Features:
 * - Environment-aware API_BASE resolution
 * - Automatic Authorization header injection for authenticated requests
 * - Global network loading status pub/sub
 * - Standardized HttpError handling preserving backend response format
 */

export const API_BASE = (
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.PROD ? 'https://realrate-api.geekio.org' : (typeof window !== 'undefined' ? '' : 'http://localhost:8787'))
).replace(/\/$/, '');

export class HttpError extends Error {
  constructor(message, status = 0, data = null, code = 'HTTP_ERROR') {
    super(message || 'خطای شبکه در ارتباط با سرور');
    this.name = 'HttpError';
    this.status = status;
    this.data = data;
    this.code = code;
  }
}

/**
 * Get stored auth token
 */
export function getToken() {
  try {
    return localStorage.getItem('realrate_token') || null;
  } catch {
    return null;
  }
}

/**
 * Set or remove stored auth token
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
 * Low-level HTTP request method
 */
export async function httpRequest(path, options = {}) {
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

    const url = path.startsWith('http://') || path.startsWith('https://')
      ? path
      : `${API_BASE}${path}`;

    const res = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    let data = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch (err) {
        data = null;
      }
    } else {
      data = await res.text();
    }

    // Standardize error normalization if backend returned error details
    if (data && typeof data === 'object') {
      if (data.error && typeof data.error === 'object') {
        const errObj = data.error;
        data.errorDetails = errObj;
        data.errorCode = errObj.code || 'UNKNOWN_ERROR';
        if (!data.message) {
          data.message = errObj.message || errObj.code || 'خطای سرور';
        }
        data.error = errObj.message || errObj.code || 'خطای سرور';
        if (data.success === undefined) {
          data.success = false;
        }
      }
    }

    if (!res.ok) {
      const errorMessage = (data && typeof data === 'object' && (data.message || data.error)) || `خطای سرور: ${res.status}`;
      const errorCode = (data && typeof data === 'object' && data.errorCode) || `HTTP_${res.status}`;
      const error = new HttpError(errorMessage, res.status, data, errorCode);
      throw error;
    }

    return data;
  } finally {
    if (!isSilent) {
      stopGlobalLoading();
    }
  }
}

/**
 * Standard HTTP Client with semantic helpers
 */
export const httpClient = {
  get: (path, options = {}) => httpRequest(path, { ...options, method: 'GET' }),
  post: (path, body, options = {}) => httpRequest(path, { ...options, method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: (path, body, options = {}) => httpRequest(path, { ...options, method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: (path, options = {}) => httpRequest(path, { ...options, method: 'DELETE' }),
  request: httpRequest,
};
