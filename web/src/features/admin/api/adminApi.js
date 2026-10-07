/**
 * adminApi.js — Admin Panel API Calls
 * Interfaces with RealRate Admin Endpoints via httpClient
 */

import { httpClient } from '../../../shared/api/httpClient.js';

export async function getAdminStats() {
  return httpClient.get('/api/admin/stats');
}

/**
 * One page of registered users
 * @param {{ page?: number, pageSize?: number, q?: string, filter?: string,
 *   sort?: 'lastLogin'|'createdAt', dir?: 'asc'|'desc' }} [params]
 * @returns {Promise<{ users: object[], total: number, page: number, pageSize: number, pageCount: number }>}
 */
export async function getAdminUsers({ page = 1, pageSize = 10, q = '', filter = 'all', sort = 'lastLogin', dir = 'desc' } = {}) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), filter, sort, dir });
  if (q.trim()) params.set('q', q.trim());
  return httpClient.get(`/api/admin/users?${params}`);
}

/** Account facts and usage counts of one user */
export async function getAdminUserDetail(userId) {
  return httpClient.get(`/api/admin/users/detail?userId=${encodeURIComponent(userId)}`);
}

/** Block (true) or unblock (false) a user; blocking also signs them out everywhere */
export async function setAdminUserBlocked(userId, blocked) {
  return httpClient.post('/api/admin/users/block', { userId, blocked });
}

/** End every session of a user */
export async function signOutAdminUser(userId) {
  return httpClient.post('/api/admin/users/signout', { userId });
}

/** Send a fresh verification link to an unverified email/password account */
export async function resendAdminVerification(userId) {
  return httpClient.post('/api/admin/users/resend-verification', { userId });
}

/** Sign-ups and active users per day over the last `days` days */
export async function getAdminGrowth(days = 30) {
  return httpClient.get(`/api/admin/growth?days=${days}`);
}

export async function saveAdminSettings(settings) {
  return httpClient.post('/api/admin/settings', settings);
}

/**
 * Every price source with its kind, fetch interval, last and next sync, status and a preview
 * @returns {Promise<{ tickSec: number, summary: Record<string, number>, sources: object[] }>}
 */
export async function getPriceSources() {
  return httpClient.get('/api/admin/price-sources');
}

/** A source's items as its last sync stored them */
export async function getPriceSourceItems(id) {
  return httpClient.get(`/api/admin/price-sources/items?id=${encodeURIComponent(id)}`);
}

/** Switch a source on or off */
export async function setPriceSourceActive(id, isActive) {
  return httpClient.post('/api/admin/price-sources', { id, isActive });
}

/** Make a source the primary one for its id */
export async function setPrimarySource(id) {
  return httpClient.post('/api/admin/price-sources/set-primary', { id });
}

/**
 * A dry run of a source: fetched and parsed now, nothing kept
 * @returns {Promise<{ success: boolean, error?: string, count?: number, sample?: object[], price?: number|null, ms: number }>}
 */
export async function testPriceSource(id) {
  return httpClient.post('/api/admin/price-sources/test', { id });
}

/** Sync one source now, through the same pipeline as the cron */
export async function syncPriceSource(id) {
  return httpClient.post('/api/admin/price-sources/sync', { id });
}

/** Sync every active source now */
export async function fetchAllSourcesNow() {
  return httpClient.post('/api/admin/price-sources/fetch-all', {});
}

/** The price history page: tgju catalog, mappings, the book's items, the history per id */
export async function getHistoryAdmin() {
  return httpClient.get('/api/admin/history');
}

/** Save the tgju → price book mappings */
export async function saveHistoryMappings(mappings) {
  return httpClient.post('/api/admin/history/mappings', { mappings });
}

/** A tgju series' latest days and (with a target) the unit that matches the item */
export async function previewHistorySeries(slug, target = '') {
  return httpClient.post('/api/admin/history/preview', { slug, target });
}

/** Fill a price book item's past days from a tgju series */
export async function runHistoryBackfill({ slug, target, unit, days, overwrite, usdTarget = 'usd' }) {
  return httpClient.post('/api/admin/history/backfill', { slug, target, unit, days, overwrite, usdTarget });
}

/** Delete an id's history, move it to a book id, or delete every id the book doesn't know */
export async function editHistoryKeys(body) {
  return httpClient.post('/api/admin/history/keys', body);
}

// ── Groups of users and who gets which feature ─────────────────────────────

/** `{ groups, requests, features }` */
export async function getAdminGroups() {
  return httpClient.get('/api/admin/groups');
}

export async function createAdminGroup(group) {
  return httpClient.post('/api/admin/groups', group);
}

export async function updateAdminGroup(groupId, patch) {
  return httpClient.put(`/api/admin/groups/${encodeURIComponent(groupId)}`, patch);
}

export async function deleteAdminGroup(groupId) {
  return httpClient.delete(`/api/admin/groups/${encodeURIComponent(groupId)}`);
}

export async function getAdminGroupMembers(groupId, { q = '', page = 1 } = {}) {
  const query = new URLSearchParams({ page: String(page) });
  if (q) query.set('q', q);
  return httpClient.get(`/api/admin/groups/${encodeURIComponent(groupId)}/members?${query}`);
}

/** @param {{ userId?: string, email?: string }} who */
export async function addAdminGroupMember(groupId, who) {
  return httpClient.post(`/api/admin/groups/${encodeURIComponent(groupId)}/members`, who);
}

export async function removeAdminGroupMember(groupId, userId) {
  return httpClient.delete(`/api/admin/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`);
}

export async function answerAdminGroupRequest(groupId, userId, approve) {
  return httpClient.post(`/api/admin/groups/${encodeURIComponent(groupId)}/requests/${encodeURIComponent(userId)}`, { approve });
}

/** @param {{ stage: 'off'|'beta'|'ga', groups: string[] }} rule */
export async function saveAdminFeatureRule(key, rule) {
  return httpClient.put(`/api/admin/features/${encodeURIComponent(key)}`, rule);
}

export async function resetAdminFeatureRule(key) {
  return httpClient.delete(`/api/admin/features/${encodeURIComponent(key)}`);
}
