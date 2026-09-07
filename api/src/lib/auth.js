/**
 * auth.js — Google OAuth verification, session management, and admin role checking
 */

import { dbGetSession } from "./db.js";

/**
 * Check if an email belongs to an admin (supports comma-separated ADMIN_EMAIL env var)
 * @param {string} email
 * @param {object} env
 * @returns {boolean}
 */
export function isUserAdmin(email, env) {
  if (!email || !env) return false;
  const adminConfig = (env.ADMIN_EMAIL || "").toLowerCase();
  const adminEmails = adminConfig.split(",").map(e => e.trim()).filter(Boolean);
  return adminEmails.includes(email.toLowerCase().trim());
}

/**
 * Extract and authenticate a user from Bearer header or Cookie using D1 (or KV fallback)
 * Dynamically re-evaluates role against current ADMIN_EMAIL so changing it takes
 * effect without requiring users to re-login.
 * @param {Request} request
 * @param {object} env
 * @returns {object|null} user session or null
 */
export async function getAuthenticatedUser(request, env) {
  let token = null;

  // 1. Check Authorization: Bearer <token> header
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  }

  // 2. Check realrate_session cookie
  if (!token) {
    const cookieHeader = request.headers.get("Cookie");
    if (cookieHeader) {
      const match = cookieHeader.match(/realrate_session=([^;]+)/);
      if (match) token = decodeURIComponent(match[1].trim());
    }
  }

  if (!token) return null;

  try {
    const session = await dbGetSession(env, token);
    if (!session || !session.email) return null;

    // Dynamically evaluate role — changing ADMIN_EMAIL takes effect immediately
    const isAdmin = isUserAdmin(session.email, env);
    const role = isAdmin ? "admin" : "user";

    return { ...session, role, isAdmin };
  } catch (e) {
    console.error("Error retrieving user session:", e);
    return null;
  }
}
