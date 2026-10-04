/**
 * session.repository.js — Sessions, in D1 (table `sessions`)
 *
 * Every signed-in request looks its session up, so a session read is kept in this isolate's
 * memory for SESSION_MEMO_MS (isolateCache.js): a page's burst of requests reads D1 once. A
 * sign-out or "sign out everywhere" made here is seen at once; one made in another isolate within
 * SESSION_MEMO_MS.
 */

import { ensureSchema } from "./schema.repository.js";
import { logger } from "../lib/logger.js";
import { createIsolateCache } from "../lib/isolateCache.js";
import { SESSION_TTL_SECONDS } from "../config/constants.js";

export const SESSION_MEMO_MS = 30_000;
const sessionMemo = createIsolateCache({ ttlMs: SESSION_MEMO_MS, max: 5000 });

/** Forget sessions kept in memory: one token, every session of a user, or (no argument) all */
export function forgetSessions({ token, userId } = {}) {
  if (token) sessionMemo.delete(token);
  else if (userId) sessionMemo.deleteWhere((session) => session?.userId === userId);
  else sessionMemo.clear();
}

/**
 * Save a session token to the database
 * @param {object} env
 * @param {object} sessionData - { token, userId, email, name, picture, role, createdAt }
 * @param {number} [ttlSeconds=SESSION_TTL_SECONDS]
 */
export async function dbSaveSession(env, sessionData, ttlSeconds = SESSION_TTL_SECONDS) {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const kind = sessionData.kind || '';
  forgetSessions({ token: sessionData.token });

  if (env && env.DB) {
    await ensureSchema(env);
    try {
      await env.DB.prepare(`
        INSERT INTO sessions (token, user_id, email, name, picture, role, created_at, expires_at, kind)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(token) DO UPDATE SET
          user_id = excluded.user_id, email = excluded.email, name = excluded.name,
          picture = excluded.picture, role = excluded.role, created_at = excluded.created_at,
          expires_at = excluded.expires_at, kind = excluded.kind
      `).bind(
        sessionData.token,
        sessionData.userId,
        sessionData.email,
        sessionData.name,
        sessionData.picture,
        sessionData.role,
        sessionData.createdAt,
        expiresAt,
        kind
      ).run();
    } catch (e) {
      logger.error("[DB] dbSaveSession error:", { error: e.message });
    }
  }
}

/**
 * Retrieve a valid (non-expired) session from the database
 * @param {object} env
 * @param {string} token
 * @returns {Promise<object|null>}
 */
export async function dbGetSession(env, token) {
  if (!token || !env?.DB) return null;
  const now = Date.now();
  const session = await sessionMemo.getOrLoad(token, () => readSession(env, token, now));
  // A kept session still ends on time
  if (session && Number(session.expiresAt) <= now) {
    sessionMemo.delete(token);
    return null;
  }
  return session ?? null;
}

/** The session row, or undefined (not kept: a failed or missing read is tried again) */
async function readSession(env, token, now) {
  await ensureSchema(env);
  try {
    const row = await env.DB.prepare(`
      SELECT token, user_id AS userId, email, name, picture, role, created_at AS createdAt, expires_at AS expiresAt,
             COALESCE(kind, '') AS kind
      FROM sessions
      WHERE token = ? AND expires_at > ?
    `).bind(token, now).first();
    return row || undefined;
  } catch (e) {
    logger.error("[DB] dbGetSession error:", { error: e.message });
    return undefined;
  }
}

/**
 * Delete a session from the database on logout
 * @param {object} env
 * @param {string} token
 */
export async function dbDeleteSession(env, token) {
  if (!token) return;

  if (env && env.DB) {
    await ensureSchema(env);
    try {
      await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
      forgetSessions({ token });
    } catch (e) {
      logger.error("[DB] dbDeleteSession error:", { error: e.message });
    }
  }
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
