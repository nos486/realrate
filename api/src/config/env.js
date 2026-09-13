/**
 * env.js — Cloudflare Worker environment & binding validator
 */

import { logger } from "../lib/logger.js";

let hasLoggedWarnings = false;

/**
 * Validate presence of vital environment variables and Cloudflare bindings.
 * Workers cannot be killed, so we log structured warnings for missing bindings.
 * @param {object} env - Cloudflare worker env context
 * @returns {object} env
 */
export function validateEnv(env) {
  if (!env || typeof env !== "object") {
    logger.warn("[Env] Environment context is missing or invalid.");
    return env;
  }

  // Only log once during worker runtime lifecycle to prevent log flooding
  if (hasLoggedWarnings) {
    return env;
  }

  const missing = [];

  if (!env.DB) {
    missing.push("DB (D1 Database binding)");
  }

  if (!env.REALRATE_KV && !env.KV) {
    missing.push("REALRATE_KV / KV (KV Namespace binding)");
  }

  if (!env.GOOGLE_CLIENT_ID) {
    missing.push("GOOGLE_CLIENT_ID (OAuth Client ID)");
  }

  if (!env.ADMIN_EMAIL) {
    missing.push("ADMIN_EMAIL (Admin Email)");
  }

  if (missing.length > 0) {
    logger.warn("[Env] Missing vital environment variables or bindings:", {
      missingBindings: missing,
    });
    hasLoggedWarnings = true;
  }

  return env;
}
