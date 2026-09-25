/**
 * authApi.js — Authentication API Calls
 * Interfaces with RealRate Auth Endpoints via httpClient
 */

import { httpClient, API_BASE, setToken } from '../../../shared/api/httpClient.js';

export function getGoogleLoginUrl(returnTo = '') {
  const target = returnTo || (typeof window !== 'undefined' ? window.location.href : '/');
  return `${API_BASE}/api/auth/google/login?return_to=${encodeURIComponent(target)}`;
}

export async function getMe() {
  return httpClient.get('/api/auth/me');
}

export async function googleLogin(credential) {
  return httpClient.post('/api/auth/google', { credential });
}

export async function logout() {
  try {
    return await httpClient.post('/api/auth/logout', {});
  } finally {
    // Always drop the local token, even if the server call fails (offline, 5xx, ...)
    setToken(null);
  }
}

// ── Email / password accounts ───────────────────────────────────────────────

/** Create an account; the server emails a verification link (no session yet) */
export function register({ name, email, password }) {
  return httpClient.post('/api/auth/register', { name, email, password });
}

/** Use the emailed verification token; answers `{ token, user }` like a login */
export function verifyEmail(token) {
  return httpClient.post('/api/auth/verify-email', { token });
}

export function resendVerification(email) {
  return httpClient.post('/api/auth/verify-email/resend', { email }, { silent: true });
}

export function loginWithPassword(email, password) {
  return httpClient.post('/api/auth/login', { email, password });
}

export function requestPasswordReset(email) {
  return httpClient.post('/api/auth/password/forgot', { email });
}

/** Use the emailed reset token; answers `{ token, user }` (other sessions are signed out) */
export function resetPassword(token, password) {
  return httpClient.post('/api/auth/password/reset', { token, password });
}

/** Signed in: add a first password (Google accounts) or change it (current password needed) */
export function setPassword({ currentPassword, newPassword }) {
  return httpClient.post('/api/auth/password', { currentPassword, newPassword });
}
