/**
 * user.repository.js — Cloudflare D1 User Data Access Layer
 */

import { ensureD1Tables } from "./migration.repository.js";
import { logger } from "../lib/logger.js";
import { sanitizeHomeLayout } from "../domain/homeLayout.js";
import { hashSharePassword } from "../lib/security.js";

/**
 * Generate a random alphanumeric slug for shared URLs
 * @param {number} len
 * @returns {string}
 */
export function generateRandomSlug(len = 8) {
  const chars = '23456789abcdefghjkmnpqrstuvwxyz';
  let slug = '';
  for (let i = 0; i < len; i++) {
    slug += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return slug;
}

/**
 * Upsert a user into D1 SQL
 * @param {object} env
 * @param {object} userData - { id, email, name, picture, role, createdAt, lastLogin }
 * @returns {object} updated userData
 */
export async function dbUpsertUser(env, userData) {
  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      await env.DB.prepare(`
        INSERT INTO users (id, email, name, picture, role, created_at, last_login, login_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(email) DO UPDATE SET
          name = excluded.name,
          picture = excluded.picture,
          role = excluded.role,
          last_login = excluded.last_login,
          login_count = users.login_count + 1,
          -- Google proves the address. A password set by an unverified sign-up could have been
          -- chosen by someone else who typed this email, so it is dropped rather than trusted.
          password_hash = CASE WHEN users.email_verified = 0 THEN '' ELSE users.password_hash END,
          email_verified = 1
      `).bind(
        userData.id,
        userData.email,
        userData.name,
        userData.picture,
        userData.role,
        userData.createdAt,
        userData.lastLogin
      ).run();

      const updated = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(userData.email).first();
      if (updated) {
        // An account first created with email/password keeps its own id; sessions must use it
        userData.id = updated.id;
        userData.loginCount = updated.login_count;
        userData.createdAt = updated.created_at;

        // Auto-assign default random share_slug if none set
        if (!updated.share_slug) {
          let assignedSlug = generateRandomSlug(8);
          let saved = false;
          for (let attempt = 0; attempt < 5; attempt++) {
            try {
              await env.DB.prepare("UPDATE users SET share_slug = ? WHERE id = ?").bind(assignedSlug, updated.id).run();
              userData.shareSlug = assignedSlug;
              saved = true;
              break;
            } catch (e) {
              assignedSlug = generateRandomSlug(8);
            }
          }
          if (!saved) {
            userData.shareSlug = assignedSlug;
          }
        } else {
          userData.shareSlug = updated.share_slug;
        }

        userData.shareEnabled = updated.share_enabled || 0;
        userData.customName = updated.custom_name || '';
      }
    } catch (e) {
      logger.error("D1 dbUpsertUser error:", { error: e.message });
    }
  }

  return userData;
}

/**
 * One page of registered users for the admin panel, most recently active first
 * @param {object} env
 * @param {{ q?: string, limit?: number, offset?: number }} [options] q matches name, custom name,
 *   email, id or share slug (case-insensitive substring)
 * @returns {Promise<{ users: object[], total: number }>}
 */
export async function dbGetUsersPage(env, { q = "", limit = 20, offset = 0 } = {}) {
  if (!env || !env.DB) return { users: [], total: 0 };
  await ensureD1Tables(env);

  const term = String(q || "").trim().toLowerCase();
  // LIKE wildcards in the search text are matched literally
  const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const where = term
    ? `WHERE LOWER(COALESCE(name, '')) LIKE ?1 ESCAPE '\\'
         OR LOWER(COALESCE(custom_name, '')) LIKE ?1 ESCAPE '\\'
         OR LOWER(email) LIKE ?1 ESCAPE '\\'
         OR LOWER(id) LIKE ?1 ESCAPE '\\'
         OR LOWER(COALESCE(share_slug, '')) LIKE ?1 ESCAPE '\\'`
    : "";
  const params = term ? [pattern] : [];

  try {
    const countRow = await env.DB.prepare(`SELECT COUNT(*) AS total FROM users ${where}`).bind(...params).first();
    const { results } = await env.DB.prepare(`
      SELECT id, email, name, custom_name AS customName, picture, role,
             share_slug AS shareSlug, share_enabled AS shareEnabled,
             created_at AS createdAt, last_login AS lastLogin, login_count AS loginCount
      FROM users
      ${where}
      ORDER BY last_login DESC, id
      LIMIT ${term ? "?2" : "?1"} OFFSET ${term ? "?3" : "?2"}
    `).bind(...params, limit, offset).all();
    return { users: Array.isArray(results) ? results : [], total: Number(countRow?.total) || 0 };
  } catch (e) {
    logger.error("D1 dbGetUsersPage error:", { error: e.message });
    return { users: [], total: 0 };
  }
}

/**
 * Headline counts for the admin panel
 * @param {object} env
 * @returns {Promise<{ registeredUsers: number, publicPortfolios: number }>}
 */
export async function dbGetUserStats(env) {
  if (!env || !env.DB) return { registeredUsers: 0, publicPortfolios: 0 };
  await ensureD1Tables(env);
  try {
    const row = await env.DB.prepare(`
      SELECT (SELECT COUNT(*) FROM users) AS registeredUsers,
             (SELECT COUNT(*) FROM portfolios WHERE share_enabled = 1) AS publicPortfolios
    `).first();
    return {
      registeredUsers: Number(row?.registeredUsers) || 0,
      publicPortfolios: Number(row?.publicPortfolios) || 0,
    };
  } catch (e) {
    logger.error("D1 dbGetUserStats error:", { error: e.message });
    return { registeredUsers: 0, publicPortfolios: 0 };
  }
}

/**
 * Get user by ID or email
 * @param {object} env
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function dbGetUserById(env, userId) {
  if (!userId) return null;
  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      const row = await env.DB.prepare(`
        SELECT id, email, name, custom_name AS customName, picture, role,
               share_slug AS shareSlug, share_password AS sharePassword,
               share_enabled AS shareEnabled, created_at AS createdAt, last_login AS lastLogin
        FROM users
        WHERE id = ? OR email = ?
      `).bind(userId, userId).first();
      return row || null;
    } catch (e) {
      logger.error("D1 dbGetUserById error:", { error: e.message });
    }
  }
  return null;
}

/**
 * Get user by Share Slug (for shared portfolio view)
 * @param {object} env
 * @param {string} slug
 * @returns {Promise<object|null>}
 */
export async function dbGetUserByShareSlug(env, slug) {
  if (!slug) return null;
  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      const row = await env.DB.prepare(`
        SELECT id, email, name, custom_name AS customName, picture, role,
               share_slug AS shareSlug, share_password AS sharePassword,
               share_enabled AS shareEnabled
        FROM users
        WHERE LOWER(share_slug) = LOWER(?)
      `).bind(slug.trim()).first();
      return row || null;
    } catch (e) {
      logger.error("D1 dbGetUserByShareSlug error:", { error: e.message });
    }
  }
  return null;
}

/**
 * Update user settings (custom name, share slug, share password, share enabled)
 * @param {object} env
 * @param {string} userId
 * @param {object} settings
 * @returns {Promise<object|null>}
 */
export async function dbUpdateUserSettings(env, userId, { customName, shareSlug, sharePassword, shareEnabled }) {
  if (!userId) throw new Error("شناسه کاربر الزامی است.");
  if (env && env.DB) {
    await ensureD1Tables(env);

    // Validate and check if new shareSlug is already taken by another user
    if (shareSlug) {
      const cleanedSlug = shareSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      if (cleanedSlug.length < 2) {
        throw new Error("آدرس اختصاصی باید حداقل ۲ کاراکتر و شامل حروف یا ارقام انگلیسی باشد.");
      }
      const existing = await env.DB.prepare(`
        SELECT id FROM users WHERE LOWER(share_slug) = LOWER(?) AND id != ? AND email != ?
      `).bind(cleanedSlug, userId, userId).first();
      if (existing) {
        throw new Error("این آدرس اختصاصی (slug) قبلاً توسط کاربر دیگری انتخاب شده است. لطفاً شناسه دیگری انتخاب فرمایید.");
      }
      shareSlug = cleanedSlug;
    }

    const updates = [];
    const bindings = [];

    if (customName !== undefined) {
      updates.push("custom_name = ?");
      bindings.push(customName ? customName.trim() : null);
    }
    if (shareSlug !== undefined) {
      updates.push("share_slug = ?");
      bindings.push(shareSlug);
    }
    if (sharePassword !== undefined) {
      const cleanPassword = String(sharePassword || '').trim();
      updates.push("share_password = ?");
      bindings.push(cleanPassword ? await hashSharePassword(cleanPassword) : null);
    }
    if (shareEnabled !== undefined) {
      updates.push("share_enabled = ?");
      bindings.push(shareEnabled ? 1 : 0);
    }

    if (updates.length > 0) {
      bindings.push(userId, userId);
      await env.DB.prepare(`
        UPDATE users SET ${updates.join(", ")} WHERE id = ? OR email = ?
      `).bind(...bindings).run();
    }

    return await dbGetUserById(env, userId);
  }
  return null;
}

/**
 * The user's customized home page layout, or null for the default home page
 * @param {object} env
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function dbGetHomeLayout(env, userId) {
  if (!userId || !env?.DB) return null;
  await ensureD1Tables(env);
  const row = await env.DB.prepare(`SELECT home_layout AS homeLayout FROM users WHERE id = ? OR email = ?`)
    .bind(userId, userId).first();
  if (!row?.homeLayout) return null;
  try {
    return sanitizeHomeLayout(JSON.parse(row.homeLayout));
  } catch {
    return null;
  }
}

/**
 * Save (or with null, reset) the user's home page layout
 * @param {object} env
 * @param {string} userId
 * @param {object|null} layout Already sanitized
 */
export async function dbSaveHomeLayout(env, userId, layout) {
  if (!userId) throw new Error("شناسه کاربر الزامی است.");
  await ensureD1Tables(env);
  await env.DB.prepare(`UPDATE users SET home_layout = ? WHERE id = ? OR email = ?`)
    .bind(layout ? JSON.stringify(layout) : "", userId, userId).run();
  return layout;
}
