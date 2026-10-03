/**
 * schema.repository.js — Make sure the app's tables exist before a repository uses them
 *
 * The tables are defined in d1Schema.js and created in D1 once per isolate. A failure is
 * logged, not thrown: the query that follows reports the real problem.
 */

import { logger } from "../lib/logger.js";
import { ensureD1Schema } from "./d1Schema.js";

/**
 * Create the app's tables if they aren't there (idempotent)
 * @param {object} env - needs env.DB (the D1 binding)
 */
export async function ensureSchema(env) {
  if (!env?.DB?.prepare) return;
  try {
    await ensureD1Schema(env.DB);
  } catch (err) {
    logger.error("[DB] Schema setup failed:", { error: err.message });
  }
}
