/**
 * userGroups.repository.js — Groups of users, their members and join requests (D1)
 *
 * Tables: user_groups, user_group_members, user_group_requests (d1Schema.js). A user's groups
 * decide which group-restricted features they get (lib/features.js).
 *
 * A user's group keys are read on every request that checks a feature, so they are kept in this
 * isolate's memory for GROUP_KEYS_MEMO_MS (isolateCache.js); a membership change made here is seen
 * at once, one made in another isolate within that time.
 */

import { ensureSchema } from "./schema.repository.js";
import { AppError } from "../lib/AppError.js";
import { createIsolateCache } from "../lib/isolateCache.js";

export const GROUP_KEYS_MEMO_MS = 30_000;
const groupKeysMemo = createIsolateCache({ ttlMs: GROUP_KEYS_MEMO_MS, max: 5000 });

/** Forget the group keys kept in memory: one user's, or (no argument) everyone's */
export function forgetUserGroupKeys(userId) {
  if (userId) groupKeysMemo.delete(userId);
  else groupKeysMemo.clear();
}

const GROUP_COLUMNS = `
  g.id, g.key, g.name, g.description, g.allow_requests AS allowRequests, g.is_system AS isSystem,
  g.created_at AS createdAt, g.updated_at AS updatedAt`;

const toGroup = (row) => row && ({
  id: row.id,
  key: row.key,
  name: row.name,
  description: row.description || "",
  allowRequests: Number(row.allowRequests) === 1,
  isSystem: Number(row.isSystem) === 1,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  ...(row.memberCount !== undefined ? { memberCount: Number(row.memberCount) || 0 } : {}),
  ...(row.requestCount !== undefined ? { requestCount: Number(row.requestCount) || 0 } : {}),
});

const toPerson = (row) => ({
  userId: row.userId,
  email: row.email || "",
  name: row.customName || row.name || "",
  picture: row.picture || "",
});

function newGroupId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `grp_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Every group with its member and pending request counts */
export async function dbListGroups(env) {
  await ensureSchema(env);
  const { results = [] } = await env.DB.prepare(`
    SELECT ${GROUP_COLUMNS},
      (SELECT COUNT(*) FROM user_group_members m WHERE m.group_id = g.id) AS memberCount,
      (SELECT COUNT(*) FROM user_group_requests r WHERE r.group_id = g.id) AS requestCount
    FROM user_groups g
    ORDER BY g.is_system DESC, g.created_at
  `).all();
  return results.map(toGroup);
}

export async function dbGetGroup(env, groupId) {
  await ensureSchema(env);
  return toGroup(await env.DB.prepare(`SELECT ${GROUP_COLUMNS} FROM user_groups g WHERE g.id = ?`).bind(groupId).first());
}

export async function dbGetGroupByKey(env, key) {
  await ensureSchema(env);
  return toGroup(await env.DB.prepare(`SELECT ${GROUP_COLUMNS} FROM user_groups g WHERE g.key = ?`).bind(key).first());
}

/** @param {{ key: string, name: string, description: string, allowRequests: boolean }} value validated (domain/userGroups.js) */
export async function dbCreateGroup(env, value) {
  await ensureSchema(env);
  if (await dbGetGroupByKey(env, value.key)) throw AppError.badRequest("گروهی با این شناسه وجود دارد.", "GROUP_EXISTS");
  const id = newGroupId();
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO user_groups (id, key, name, description, allow_requests, is_system, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)
  `).bind(id, value.key, value.name, value.description, value.allowRequests ? 1 : 0, now, now).run();
  return dbGetGroup(env, id);
}

/** @param {{ name?: string, description?: string, allowRequests?: boolean }} patch */
export async function dbUpdateGroup(env, groupId, patch) {
  await ensureSchema(env);
  const sets = [];
  const params = [];
  if (patch.name !== undefined) { sets.push("name = ?"); params.push(patch.name); }
  if (patch.description !== undefined) { sets.push("description = ?"); params.push(patch.description); }
  if (patch.allowRequests !== undefined) { sets.push("allow_requests = ?"); params.push(patch.allowRequests ? 1 : 0); }
  if (sets.length) {
    sets.push("updated_at = ?");
    params.push(new Date().toISOString());
    await env.DB.prepare(`UPDATE user_groups SET ${sets.join(", ")} WHERE id = ?`).bind(...params, groupId).run();
  }
  // Requests are only for groups that accept them
  if (patch.allowRequests === false) {
    await env.DB.prepare("DELETE FROM user_group_requests WHERE group_id = ?").bind(groupId).run();
  }
  return dbGetGroup(env, groupId);
}

/** The group with its members and requests, in one batch */
export async function dbDeleteGroup(env, groupId) {
  await ensureSchema(env);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM user_group_members WHERE group_id = ?").bind(groupId),
    env.DB.prepare("DELETE FROM user_group_requests WHERE group_id = ?").bind(groupId),
    env.DB.prepare("DELETE FROM user_groups WHERE id = ? AND is_system = 0").bind(groupId),
  ]);
  forgetUserGroupKeys();
}

/**
 * One page of a group's members, newest first
 * @returns {Promise<{ members: Array<object>, total: number }>}
 */
export async function dbListGroupMembers(env, groupId, { q = "", limit = 20, offset = 0 } = {}) {
  await ensureSchema(env);
  const search = q ? `%${q}%` : null;
  const where = `m.group_id = ?${search ? " AND (u.email LIKE ? OR u.name LIKE ? OR u.custom_name LIKE ?)" : ""}`;
  const params = search ? [groupId, search, search, search] : [groupId];
  const total = await env.DB.prepare(`
    SELECT COUNT(*) AS n FROM user_group_members m JOIN users u ON u.id = m.user_id WHERE ${where}
  `).bind(...params).first();
  const { results = [] } = await env.DB.prepare(`
    SELECT m.user_id AS userId, u.email, u.name, u.custom_name AS customName, u.picture,
           m.added_at AS addedAt, m.added_by AS addedBy
    FROM user_group_members m JOIN users u ON u.id = m.user_id
    WHERE ${where}
    ORDER BY m.added_at DESC, m.user_id
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();
  return {
    members: results.map((row) => ({ ...toPerson(row), addedAt: row.addedAt, addedBy: row.addedBy || "" })),
    total: Number(total?.n) || 0,
  };
}

/** Add a member (no-op when already one); their request to the group, if any, is settled */
export async function dbAddGroupMember(env, groupId, userId, addedBy = "") {
  await ensureSchema(env);
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO user_group_members (group_id, user_id, added_at, added_by) VALUES (?, ?, ?, ?)
      ON CONFLICT (group_id, user_id) DO NOTHING
    `).bind(groupId, userId, new Date().toISOString(), addedBy),
    env.DB.prepare("DELETE FROM user_group_requests WHERE group_id = ? AND user_id = ?").bind(groupId, userId),
  ]);
  forgetUserGroupKeys(userId);
}

export async function dbRemoveGroupMember(env, groupId, userId) {
  await ensureSchema(env);
  await env.DB.prepare("DELETE FROM user_group_members WHERE group_id = ? AND user_id = ?").bind(groupId, userId).run();
  forgetUserGroupKeys(userId);
}

/** Pending requests (of one group, or of all), oldest first */
export async function dbListGroupRequests(env, groupId = null) {
  await ensureSchema(env);
  const { results = [] } = await env.DB.prepare(`
    SELECT r.group_id AS groupId, r.user_id AS userId, r.requested_at AS requestedAt, r.note,
           u.email, u.name, u.custom_name AS customName, u.picture
    FROM user_group_requests r JOIN users u ON u.id = r.user_id
    ${groupId ? "WHERE r.group_id = ?" : ""}
    ORDER BY r.requested_at
    LIMIT 200
  `).bind(...(groupId ? [groupId] : [])).all();
  return results.map((row) => ({ ...toPerson(row), groupId: row.groupId, requestedAt: row.requestedAt, note: row.note || "" }));
}

/** A user's request to join (asking again only refreshes it) */
export async function dbCreateGroupRequest(env, groupId, userId, note = "") {
  await ensureSchema(env);
  await env.DB.prepare(`
    INSERT INTO user_group_requests (group_id, user_id, requested_at, note) VALUES (?, ?, ?, ?)
    ON CONFLICT (group_id, user_id) DO UPDATE SET requested_at = excluded.requested_at, note = excluded.note
  `).bind(groupId, userId, new Date().toISOString(), note).run();
}

export async function dbDeleteGroupRequest(env, groupId, userId) {
  await ensureSchema(env);
  await env.DB.prepare("DELETE FROM user_group_requests WHERE group_id = ? AND user_id = ?").bind(groupId, userId).run();
}

/** The keys of the groups a user is in, e.g. ["pro"] */
export async function dbGetUserGroupKeys(env, userId) {
  if (!env?.DB || !userId) return [];
  const keys = await groupKeysMemo.getOrLoad(userId, async () => {
    await ensureSchema(env);
    const { results = [] } = await env.DB.prepare(`
      SELECT g.key FROM user_group_members m JOIN user_groups g ON g.id = m.group_id WHERE m.user_id = ? ORDER BY g.key
    `).bind(userId).all();
    return results.map((row) => row.key);
  });
  return [...keys];
}

/** The keys of the groups a user has asked to join and is waiting on */
export async function dbGetUserRequestedGroupKeys(env, userId) {
  if (!env?.DB || !userId) return [];
  await ensureSchema(env);
  const { results = [] } = await env.DB.prepare(`
    SELECT g.key FROM user_group_requests r JOIN user_groups g ON g.id = r.group_id WHERE r.user_id = ? ORDER BY g.key
  `).bind(userId).all();
  return results.map((row) => row.key);
}
