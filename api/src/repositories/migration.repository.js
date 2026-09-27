/**
 * migration.repository.js — Make sure the app's tables exist before a repository uses them
 *
 * The tables are defined in pgSchema.js and created in Postgres once per isolate. A failure is
 * logged, not thrown: the query that follows reports the real problem.
 */

import { logger } from "../lib/logger.js";
import { ensurePgSchema } from "./pgSchema.js";

/**
 * Create the app's tables if they aren't there (idempotent)
 * @param {object} env - needs env.DB (lib/pgDatabase.js)
 */
export async function ensureSchema(env) {
  if (!env?.DB?.prepare) return;
  try {
    await ensurePgSchema(env.DB);
  } catch (err) {
    logger.error("[DB] Schema setup failed:", { error: err.message });
  }
}
