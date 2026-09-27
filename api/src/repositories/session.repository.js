/**
 * session.repository.js — Postgres & KV Session Data Access Layer
 */

import { ensureSchema } from "./migration.repository.js";
import { getSessionKV, setSessionKV, deleteSessionKV } from "./kvCache.repository.js";
import { logger } from "../lib/logger.js";
import { SESSION_TTL_SECONDS } from "../config/constants.js";

/**
 * Save a session token to the database and KV
 * @param {object} env
 * @param {object} sessionData - { token, userId, email, name, picture, role, createdAt }
 * @param {number} [ttlSeconds=SESSION_TTL_SECONDS]
 */
export async function dbSaveSession(env, sessionData, ttlSeconds = SESSION_TTL_SECONDS) {
  const expiresAt = Date.now() + ttlSeconds * 1000;

  if (env && env.DB) {
    await ensureSchema(env);
    try {
      await env.DB.prepare(`
        INSERT INTO sessions (token, user_id, email, name, picture, role, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(token) DO UPDATE SET
          user_id = excluded.user_id, email = excluded.email, name = excluded.name,
          picture = excluded.picture, role = excluded.role, created_at = excluded.created_at,
          expires_at = excluded.expires_at
      `).bind(
        sessionData.token,
        sessionData.userId,
        sessionData.email,
        sessionData.name,
        sessionData.picture,
        sessionData.role,
        sessionData.createdAt,
        expiresAt
      ).run();
    } catch (e) {
      logger.error("[DB] dbSaveSession error:", { error: e.message });
    }
  }

  await setSessionKV(env, sessionData.token, sessionData, ttlSeconds);
}

/**
 * Retrieve a valid (non-expired) session from the database or KV
 * @param {object} env
 * @param {string} token
 * @returns {Promise<object|null>}
 */
export async function dbGetSession(env, token) {
  if (!token) return null;

  if (env && env.DB) {
    await ensureSchema(env);
    try {
      const row = await env.DB.prepare(`
        SELECT token, user_id AS userId, email, name, picture, role, created_at AS createdAt, expires_at AS expiresAt
        FROM sessions
        WHERE token = ? AND expires_at > ?
      `).bind(token, Date.now()).first();

      if (row) return row;
    } catch (e) {
      logger.error("[DB] dbGetSession error:", { error: e.message });
    }
  }

  return await getSessionKV(env, token);
}

/**
 * Delete a session from the database and KV on logout
 * @param {object} env
 * @param {string} token
 */
export async function dbDeleteSession(env, token) {
  if (!token) return;

  if (env && env.DB) {
    await ensureSchema(env);
    try {
      await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    } catch (e) {
      logger.error("[DB] dbDeleteSession error:", { error: e.message });
    }
  }

  await deleteSessionKV(env, token);
}

/**
 * Delete sessions that have already expired (run periodically from the cron)
 * @param {object} env
 */
export async function dbDeleteExpiredSessions(env) {
  if (!env || !env.DB) return;
  await ensureSchema(env);
  try {
    await env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(Date.now()).run();
  } catch (e) {
    logger.error("[DB] dbDeleteExpiredSessions error:", { error: e.message });
  }
}
