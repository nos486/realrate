/**
 * session.repository.js — Cloudflare D1 & KV Session Data Access Layer
 */

import { ensureD1Tables } from "./migration.repository.js";
import { getSessionKV, setSessionKV, deleteSessionKV } from "./kvCache.repository.js";
import { logger } from "../lib/logger.js";
import { SESSION_TTL_SECONDS } from "../config/constants.js";

/**
 * Save a session token to D1 SQL and KV
 * @param {object} env
 * @param {object} sessionData - { token, userId, email, name, picture, role, createdAt }
 * @param {number} [ttlSeconds=SESSION_TTL_SECONDS]
 */
export async function dbSaveSession(env, sessionData, ttlSeconds = SESSION_TTL_SECONDS) {
  const expiresAt = Date.now() + ttlSeconds * 1000;

  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      await env.DB.prepare(`
        INSERT OR REPLACE INTO sessions (token, user_id, email, name, picture, role, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
      logger.error("D1 dbSaveSession error:", { error: e.message });
    }
  }

  await setSessionKV(env, sessionData.token, sessionData, ttlSeconds);
}

/**
 * Retrieve a valid (non-expired) session from D1 or KV
 * @param {object} env
 * @param {string} token
 * @returns {Promise<object|null>}
 */
export async function dbGetSession(env, token) {
  if (!token) return null;

  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      const row = await env.DB.prepare(`
        SELECT token, user_id AS userId, email, name, picture, role, created_at AS createdAt, expires_at AS expiresAt
        FROM sessions
        WHERE token = ? AND expires_at > ?
      `).bind(token, Date.now()).first();

      if (row) return row;
    } catch (e) {
      logger.error("D1 dbGetSession error:", { error: e.message });
    }
  }

  return await getSessionKV(env, token);
}

/**
 * Delete a session from D1 and KV on logout
 * @param {object} env
 * @param {string} token
 */
export async function dbDeleteSession(env, token) {
  if (!token) return;

  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    } catch (e) {
      logger.error("D1 dbDeleteSession error:", { error: e.message });
    }
  }

  await deleteSessionKV(env, token);
}
