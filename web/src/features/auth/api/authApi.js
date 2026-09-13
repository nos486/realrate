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
  const res = await httpClient.post('/api/auth/logout', {});
  setToken(null);
  return res;
}
