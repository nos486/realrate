/**
 * demoApi.js — Frontend API client for Demo Account features
 */

import { httpClient } from '../../../shared/api/httpClient.js';

/**
 * Start a public demo view session
 * @returns {Promise<{ success: boolean, token: string, user: object, demo: { mode: 'view' }, demoVaultPassphrase: string }>}
 */
export async function authDemo() {
  return httpClient.post('/api/auth/demo');
}

/**
 * Get demo account status and statistics (Admin only)
 */
export async function getAdminDemoStatus() {
  return httpClient.get('/api/admin/demo');
}

/**
 * Ensure demo account exists (Admin only)
 */
export async function createAdminDemo() {
  return httpClient.post('/api/admin/demo');
}

/**
 * Start an admin edit session on the demo account (Admin only)
 * @returns {Promise<{ success: boolean, token: string, user: object, demo: { mode: 'edit' }, demoVaultPassphrase: string }>}
 */
export async function createAdminDemoEditSession() {
  return httpClient.post('/api/admin/demo/edit-session');
}

/**
 * Reset all demo account data (Admin only)
 */
export async function resetAdminDemo() {
  return httpClient.post('/api/admin/demo/reset');
}
