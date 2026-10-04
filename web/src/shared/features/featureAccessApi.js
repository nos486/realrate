/**
 * featureAccessApi.js — A feature the user doesn't have: which groups open it, and asking to join
 */

import { httpClient } from '../api/httpClient.js';

/** `{ enabled, label, groups: [{ key, name, description, allowRequests, requested }] }` */
export async function getFeatureAccess(key) {
  return httpClient.get(`/api/features/${encodeURIComponent(key)}/access`);
}

export async function requestGroup(key, note = '') {
  return httpClient.post(`/api/groups/${encodeURIComponent(key)}/request`, { note });
}

export async function cancelGroupRequest(key) {
  return httpClient.delete(`/api/groups/${encodeURIComponent(key)}/request`);
}
