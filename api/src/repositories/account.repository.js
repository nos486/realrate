/**
 * account.repository.js — Email/password accounts: credentials, verification and one-time links
 *
 * Google accounts and email accounts are the same `users` rows (unique by email): a Google user
 * can add a password, and signing in with Google verifies an email account.
 */

import { ensureD1Tables } from "./migration.repository.js";
import { deleteSessionKV } from "./kvCache.repository.js";
import { generateUrlToken, sha256Hex } from "../lib/security.js";

const AUTH_COLUMNS = `
  id, email, name, custom_name AS customName, picture, role,
  password_hash AS passwordHash, email_verified AS emailVerified, created_at AS createdAt
`;

function formatAuthRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name || "",
    customName: row.customName || "",
    picture: row.picture || "",
    role: row.role || "user",
    passwordHash: row.passwordHash || "",
    emailVerified: Number(row.emailVerified) === 1,
    createdAt: row.createdAt,
  };
}

/** Normalized form every lookup and insert uses */
export function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

export async function dbGetUserAuthByEmail(env, email) {
  if (!env?.DB) return null;
  await ensureD1Tables(env);
  const row = await env.DB.prepare(`SELECT ${AUTH_COLUMNS} FROM users WHERE email = ?`).bind(normalizeEmail(email)).first();
  return formatAuthRow(row);
}

export async function dbGetUserAuthById(env, userId) {
  if (!env?.DB || !userId) return null;
  await ensureD1Tables(env);
  const row = await env.DB.prepare(`SELECT ${AUTH_COLUMNS} FROM users WHERE id = ?`).bind(userId).first();
  return formatAuthRow(row);
}

/**
 * Create an unverified email/password account
 * @returns {Promise<object>} the account (auth shape)
 */
export async function dbCreatePasswordUser(env, { email, name, passwordHash, role = "user" }) {
  await ensureD1Tables(env);
  const now = new Date().toISOString();
  const id = `usr_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  await env.DB.prepare(`
    INSERT INTO users (id, email, name, picture, role, created_at, last_login, login_count,
                       password_hash, email_verified, password_updated_at)
    VALUES (?, ?, ?, '', ?, ?, ?, 0, ?, 0, ?)
  `).bind(id, normalizeEmail(email), name, role, now, now, passwordHash, now).run();
  return dbGetUserAuthById(env, id);
}

/** A repeated sign-up of a still-unverified account replaces its name and password */
export async function dbUpdateUnverifiedSignup(env, userId, { name, passwordHash }) {
  await ensureD1Tables(env);
  await env.DB.prepare(`
    UPDATE users SET name = ?, password_hash = ?, password_updated_at = ?
    WHERE id = ? AND email_verified = 0
  `).bind(name, passwordHash, new Date().toISOString(), userId).run();
}

/**
 * Set (or replace) a password. `markVerified` is for a reset through an emailed link, which
 * proves the address just like the verification link does.
 */
export async function dbSetUserPassword(env, userId, passwordHash, { markVerified = false } = {}) {
  await ensureD1Tables(env);
  await env.DB.prepare(`
    UPDATE users SET password_hash = ?, password_updated_at = ?${markVerified ? ", email_verified = 1" : ""}
    WHERE id = ?
  `).bind(passwordHash, new Date().toISOString(), userId).run();
}

export async function dbMarkEmailVerified(env, userId) {
  await ensureD1Tables(env);
  await env.DB.prepare(`UPDATE users SET email_verified = 1 WHERE id = ?`).bind(userId).run();
}

export async function dbRecordLogin(env, userId) {
  await ensureD1Tables(env);
  await env.DB.prepare(`
    UPDATE users SET last_login = ?, login_count = COALESCE(login_count, 0) + 1 WHERE id = ?
  `).bind(new Date().toISOString(), userId).run();
}

/**
 * Issue a one-time link token. Any earlier token of the same purpose for this user stops
 * working, so only the latest email's link is valid.
 * @returns {Promise<string>} the raw token (only its hash is stored)
 */
export async function dbCreateAuthToken(env, userId, purpose, ttlSeconds) {
  await ensureD1Tables(env);
  const token = generateUrlToken();
  const tokenHash = await sha256Hex(token);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM auth_tokens WHERE user_id = ? AND purpose = ?`).bind(userId, purpose),
    env.DB.prepare(`
      INSERT INTO auth_tokens (token_hash, user_id, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?)
    `).bind(tokenHash, userId, purpose, Date.now() + ttlSeconds * 1000, new Date().toISOString()),
  ]);
  return token;
}

/**
 * Use up a one-time token.
 * @returns {Promise<string|null>} the user id, or null when unknown, expired or of another purpose
 */
export async function dbConsumeAuthToken(env, token, purpose) {
  if (!token || typeof token !== "string" || token.length > 200) return null;
  await ensureD1Tables(env);
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(`
    SELECT user_id AS userId, purpose, expires_at AS expiresAt FROM auth_tokens WHERE token_hash = ?
  `).bind(tokenHash).first();
  if (!row || row.purpose !== purpose) return null;
  await env.DB.prepare(`DELETE FROM auth_tokens WHERE token_hash = ?`).bind(tokenHash).run();
  return Number(row.expiresAt) > Date.now() ? row.userId : null;
}

/**
 * Sign a user out everywhere (after a password reset or change), optionally keeping the
 * current session. Sessions live in D1 and KV, so both copies are removed.
 */
export async function dbDeleteUserSessions(env, userId, { exceptToken = null } = {}) {
  await ensureD1Tables(env);
  const { results = [] } = await env.DB.prepare(`SELECT token FROM sessions WHERE user_id = ?`).bind(userId).all();
  const tokens = results.map((r) => r.token).filter((t) => t && t !== exceptToken);
  for (const token of tokens) {
    await env.DB.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
    await deleteSessionKV(env, token);
  }
  return tokens.length;
}
