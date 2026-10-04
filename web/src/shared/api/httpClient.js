/**
 * httpClient.js — Centralized HTTP Client for RealRate Web Client
 *
 * Features:
 * - Environment-aware API_BASE resolution
 * - Automatic Authorization header injection for authenticated requests
 * - Global network loading status pub/sub
 * - Standardized HttpError handling preserving backend response format
 */

import { Capacitor } from '@capacitor/core';
import { CLIENT_HEADER, formatClientHeader } from '../../utils/clientInfo.js';

export const API_BASE = (
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.PROD ? 'https://realrate-api.geekio.org' : (typeof window !== 'undefined' ? '' : 'http://localhost:8787'))
).replace(/\/$/, '');

/**
 * Which client this is (utils/clientInfo.js): the Android app with its version name (set by the
 * APK build, VITE_APP_VERSION), or the site
 */
const CLIENT_HEADER_VALUE = Capacitor.getPlatform() === 'android'
  ? formatClientHeader('android', import.meta.env?.VITE_APP_VERSION || '')
  : formatClientHeader('web');

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

/** Event fired when the API answers "maintenance mode" (detail: { message }) */
export const MAINTENANCE_EVENT = 'realrate:maintenance';

function notifyMaintenance(message) {
  try {
    window.dispatchEvent(new CustomEvent(MAINTENANCE_EVENT, { detail: { message: message || '' } }));
  } catch {}
}

/** Event fired when the API answers "demo read-only" (detail: { message }) */
export const DEMO_READ_ONLY_EVENT = 'realrate:demo-read-only';

export function notifyDemoReadOnly(message) {
  try {
    window.dispatchEvent(new CustomEvent(DEMO_READ_ONLY_EVENT, { detail: { message: message || 'این نسخه دمو است و تغییرات ذخیره نمی‌شود.' } }));
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
/**
 * Identical reads already on their way (same URL, same signed-in user): pages mount several
 * components that ask for the same list at once — they share one request. Each caller gets its
 * own copy of the answer, so one changing it never affects another.
 */
const inflightReads = new Map();

const copyOf = (data) => {
  if (!data || typeof data !== 'object') return data;
  try {
    return structuredClone(data);
  } catch {
    return data;
  }
};

export function httpRequest(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const shareable = method === 'GET' && !options.body && !options.signal;
  if (!shareable) return sendRequest(path, options);
  const key = `${getToken() || ''} ${path} ${JSON.stringify(options.headers || {})}`;
  let pending = inflightReads.get(key);
  const first = !pending;
  if (first) {
    pending = sendRequest(path, options).finally(() => inflightReads.delete(key));
    inflightReads.set(key, pending);
  }
  return first ? pending : pending.then(copyOf);
}

async function sendRequest(path, options = {}) {
  // Reads are silent by default: each view shows its own skeleton instead of the blocking
  // full-screen loader, which is kept for writes (save/delete/import). Pass `silent` to override.
  const method = String(options.method || 'GET').toUpperCase();
  const isSilent = options.silent !== undefined ? Boolean(options.silent) : method === 'GET';
  if (!isSilent) {
    startGlobalLoading();
  }

  try {
    const token = getToken();
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const headers = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      // Signed-in requests say which client they come from (they are preflighted anyway)
      ...(token ? { 'Authorization': `Bearer ${token}`, [CLIENT_HEADER]: CLIENT_HEADER_VALUE } : {}),
      ...(options.headers || {}),
    };
    if (isFormData && headers['Content-Type']) {
      delete headers['Content-Type'];
    }

    const url = path.startsWith('http://') || path.startsWith('https://')
      ? path
      : `${API_BASE}${path}`;

    const { silent: _silent, ...fetchOptions } = options;
    let res;
    try {
      res = await fetch(url, {
        ...fetchOptions,
        headers,
        credentials: 'include',
      });
    } catch (err) {
      // A request the caller cancelled stays a cancellation
      if (err?.name === 'AbortError') throw err;
      // No answer at all (no connection, DNS, a dropped connection): status 0, NETWORK_ERROR
      throw new HttpError('اتصال به سرور برقرار نشد.', 0, null, 'NETWORK_ERROR');
    }

    let data = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch {
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

    // Maintenance mode switched on while the app is open: tell the auth layer (it swaps the
    // app for the maintenance page)
    if (res.status === 503 && data && typeof data === 'object' && data.errorCode === 'MAINTENANCE') {
      notifyMaintenance(data.message);
    }

    // Demo read-only response: notify app unless request was silent
    if (res.status === 403 && data && typeof data === 'object' && data.errorCode === 'DEMO_READ_ONLY') {
      if (!isSilent) {
        notifyDemoReadOnly(data.message);
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
  post: (path, body, options = {}) => {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    return httpRequest(path, {
      ...options,
      method: 'POST',
      body: isFormData ? body : (body !== undefined ? JSON.stringify(body) : undefined),
    });
  },
  put: (path, body, options = {}) => {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    return httpRequest(path, {
      ...options,
      method: 'PUT',
      body: isFormData ? body : (body !== undefined ? JSON.stringify(body) : undefined),
    });
  },
  delete: (path, options = {}) => httpRequest(path, { ...options, method: 'DELETE' }),
  request: httpRequest,
};
