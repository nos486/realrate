/**
 * auth.js — Google OAuth verification, session management, and admin role checking
 */

import { DEMO_ENABLED } from "../config/constants.js";
import { dbGetSession } from "../repositories/session.repository.js";
import { logger } from "./logger.js";

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
 * Extract and authenticate a user from Bearer header or Cookie using the database
 * Dynamically re-evaluates role against current ADMIN_EMAIL so changing it takes
 * effect without requiring users to re-login.
 * @param {Request} request
 * @param {object} env
 * @returns {object|null} user session or null
 */
export function getAuthenticatedUser(request, env) {
  // The router gates (maintenance, demo, encryption) and the handler all ask for the user of
  // the same request: look the session up once per request, not once per caller
  if (!request || typeof request !== "object") return lookupUser(request, env);
  let pending = userLookups.get(request);
  if (!pending) {
    pending = lookupUser(request, env);
    userLookups.set(request, pending);
  }
  return pending;
}

/** One session lookup per Request object (entries go away with the request) */
const userLookups = new WeakMap();

async function lookupUser(request, env) {
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
    // A demo visitor's session ends while the demo is switched off
    if (!DEMO_ENABLED && session.kind === "demo_view") return null;

    // Dynamically evaluate role — changing ADMIN_EMAIL takes effect immediately
    const isAdmin = isUserAdmin(session.email, env);
    const role = isAdmin ? "admin" : "user";

    return { ...session, role, isAdmin };
  } catch (e) {
    logger.error("Error retrieving user session:", { error: e.message });
    return null;
  }
}
