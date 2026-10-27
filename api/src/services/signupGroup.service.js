/**
 * signupGroup.service.js — The group a new account joins when it is created
 *
 * The admin picks it on the groups page (or none); until they do, new accounts join
 * DEFAULT_SIGNUP_GROUP_KEY (domain/userGroups.js). Stored in `app_state` (`signup_group`) as
 * `{ group: key | null }`, so an explicit "none" is kept apart from "never set".
 *
 * Only accounts created from now on join it: existing users keep their group.
 */

import { AppError } from "../lib/AppError.js";
import { logger } from "../lib/logger.js";
import { getStateStore } from "../repositories/stateStore.repository.js";
import { dbAddGroupMember, dbGetGroupByKey } from "../repositories/userGroups.repository.js";
import { DEFAULT_SIGNUP_GROUP_KEY } from "../domain/userGroups.js";

export const SIGNUP_GROUP_STATE_KEY = "signup_group";

/** Who a membership made at sign-up is added by (the member's `addedBy`) */
export const SIGNUP_ADDED_BY = "signup";

/**
 * The key of the group new accounts join, or "" for none
 * @param {object} env
 * @returns {Promise<string>}
 */
export async function loadSignupGroupKey(env) {
  const store = getStateStore(env);
  if (!store) return DEFAULT_SIGNUP_GROUP_KEY;
  try {
    const saved = await store.get(SIGNUP_GROUP_STATE_KEY, "json");
    if (!saved || typeof saved !== "object" || !("group" in saved)) return DEFAULT_SIGNUP_GROUP_KEY;
    return saved.group ? String(saved.group) : "";
  } catch (err) {
    logger.warn("Reading the sign-up group failed:", { error: err.message });
    return DEFAULT_SIGNUP_GROUP_KEY;
  }
}

/**
 * Save the admin's choice
 * @param {object} env
 * @param {string|null} key - a group key, or null for none
 */
export async function saveSignupGroupKey(env, key) {
  const store = getStateStore(env);
  if (!store) throw new AppError("ذخیره‌ی تنظیمات ممکن نیست.", 503, "STORE_UNAVAILABLE");
  await store.put(SIGNUP_GROUP_STATE_KEY, JSON.stringify({ group: key || null }));
}

/**
 * Put a just-created account in the sign-up group. A missing group (deleted since) or a failure
 * leaves the account without one: signing up never fails because of it.
 * @param {object} env
 * @param {string} userId
 * @returns {Promise<string>} the key of the group joined, or ""
 */
export async function joinSignupGroup(env, userId) {
  if (!env?.DB || !userId) return "";
  try {
    const key = await loadSignupGroupKey(env);
    if (!key) return "";
    const group = await dbGetGroupByKey(env, key);
    if (!group) return "";
    await dbAddGroupMember(env, group.id, userId, SIGNUP_ADDED_BY);
    return key;
  } catch (err) {
    logger.warn("Joining the sign-up group failed:", { userId, error: err.message });
    return "";
  }
}
