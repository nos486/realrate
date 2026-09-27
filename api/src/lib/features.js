/**
 * features.js — Server-side feature flag guards
 */

import { getAuthenticatedUser } from './auth.js';
import { isFeatureEnabled } from '../config/features.js';
import { AppError } from './AppError.js';

/**
 * Ensures the requested feature is enabled for the authenticated user.
 * Throws a 404 AppError if the user is not authenticated or the feature is not enabled,
 * strictly concealing the existence of the beta/unreleased endpoint.
 *
 * @param {Request} request
 * @param {object} env
 * @param {string} key
 * @returns {Promise<object>} The authenticated user
 */
export async function requireFeature(request, env, key) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || !isFeatureEnabled(key, user)) {
    throw AppError.notFound('یافت نشد.');
  }
  return user;
}
