/**
 * userGroups.js — Groups of users, and their shape
 *
 * The admin puts users in groups (e.g. "pro"); a feature can be open only to the members of some
 * groups (config/features.js `groups`). Groups are data (the user_groups table), referenced by
 * their `key` — a short, stable, lower-case name — so a feature's rule survives renaming a group.
 * Shared with the web client through a symlink.
 */

/** The group the market page belongs to (created with the schema, can't be deleted) */
export const PRO_GROUP_KEY = 'pro';

export const GROUP_LIMITS = {
  key: 32,
  name: 40,
  description: 200,
  note: 300,
};

const KEY_RE = /^[a-z][a-z0-9_-]{1,31}$/;

export function isValidGroupKey(key) {
  return KEY_RE.test(String(key || ''));
}

/**
 * Validate a group from the admin
 * @param {object} body
 * @param {{ partial?: boolean }} [options] partial: only the fields present (an edit; the key can't change)
 * @returns {{ value?: { key?: string, name?: string, description?: string, allowRequests?: boolean }, error?: string }}
 */
export function validateGroup(body, { partial = false } = {}) {
  const input = body && typeof body === 'object' ? body : {};
  const value = {};
  if (!partial) {
    const key = String(input.key || '').trim().toLowerCase();
    if (!isValidGroupKey(key)) {
      return { error: 'شناسه‌ی گروه باید با حرف انگلیسی شروع شود و فقط حروف کوچک انگلیسی، رقم، - و _ داشته باشد (۲ تا ۳۲ نویسه).' };
    }
    value.key = key;
  }
  if (!partial || input.name !== undefined) {
    const name = String(input.name || '').trim();
    if (!name) return { error: 'نام گروه الزامی است.' };
    if (name.length > GROUP_LIMITS.name) return { error: `نام گروه حداکثر ${GROUP_LIMITS.name} نویسه است.` };
    value.name = name;
  }
  if (!partial || input.description !== undefined) {
    const description = String(input.description || '').trim();
    if (description.length > GROUP_LIMITS.description) return { error: `توضیح گروه حداکثر ${GROUP_LIMITS.description} نویسه است.` };
    value.description = description;
  }
  if (!partial || input.allowRequests !== undefined) value.allowRequests = input.allowRequests === true;
  return { value };
}

/** A join request's note from the user, trimmed and bounded */
export function cleanRequestNote(note) {
  return String(note || '').trim().slice(0, GROUP_LIMITS.note);
}
