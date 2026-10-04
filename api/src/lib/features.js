/**
 * features.js — Server-side feature flag guards
 *
 * A feature's rule (config/features.js) is its code default with the admin's change laid over it
 * (kept in the state store under FEATURE_RULES_KEY). Group-restricted features need the user's
 * groups, read once per request and kept on the user object.
 */

import { getAuthenticatedUser } from './auth.js';
import { isFeatureEnabled, enabledFeatures, mergeFeatureRules } from '../config/features.js';
import { AppError } from './AppError.js';
import { getStateStore } from '../repositories/stateStore.repository.js';
import { createIsolateCache } from './isolateCache.js';
import { dbGetUserGroupKeys } from '../repositories/userGroups.repository.js';
import { logger } from './logger.js';

export const FEATURE_RULES_KEY = 'feature_rules';

// The rules change only when the admin saves them: an isolate keeps them for a minute
// (isolateCache.js), and a save made here is seen at once
export const RULES_MEMO_MS = 60_000;
const rulesMemo = createIsolateCache({ ttlMs: RULES_MEMO_MS, max: 1 });

/** The admin's stored changes, or {} */
export async function loadFeatureOverrides(env) {
  const store = getStateStore(env);
  if (!store) return {};
  try {
    return (await store.get(FEATURE_RULES_KEY, 'json')) || {};
  } catch (err) {
    logger.warn('Reading the feature rules failed:', { error: err.message });
    return {};
  }
}

/** The effective rules of every feature */
export async function loadFeatureRules(env, { now = Date.now() } = {}) {
  return rulesMemo.getOrLoad(FEATURE_RULES_KEY, async () => mergeFeatureRules(await loadFeatureOverrides(env)), now);
}

/** Save the admin's changes (all of them) and forget this isolate's copy */
export async function saveFeatureOverrides(env, overrides) {
  const store = getStateStore(env);
  if (!store) throw new AppError('ذخیره‌ی تنظیمات ممکن نیست.', 503, 'STORE_UNAVAILABLE');
  await store.put(FEATURE_RULES_KEY, JSON.stringify(overrides));
  rulesMemo.clear();
}

/** For tests */
export function resetFeatureRulesMemo() {
  rulesMemo.clear();
}

const userIdOf = (user) => user?.userId || user?.id || '';

/** The user with their group keys (`user.groups`), read once per user object */
export async function withUserGroups(env, user) {
  if (!user || Array.isArray(user.groups)) return user;
  try {
    user.groups = await dbGetUserGroupKeys(env, userIdOf(user));
  } catch (err) {
    logger.warn('Reading the user\'s groups failed:', { error: err.message });
    user.groups = [];
  }
  return user;
}

/** The keys of the features open to the user */
export async function userFeatures(env, user) {
  if (!user) return [];
  const [rules] = await Promise.all([loadFeatureRules(env), withUserGroups(env, user)]);
  return enabledFeatures(user, rules);
}

/** Whether one feature is open to the user */
export async function hasFeature(env, user, key) {
  if (!user) return false;
  const [rules] = await Promise.all([loadFeatureRules(env), withUserGroups(env, user)]);
  return isFeatureEnabled(key, user, rules);
}

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
  if (!user || !(await hasFeature(env, user, key))) {
    throw AppError.notFound('یافت نشد.');
  }
  return user;
}
