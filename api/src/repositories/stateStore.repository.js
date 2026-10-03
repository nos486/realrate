/**
 * stateStore.repository.js — The app's small key/value state that must be consistent, in D1
 * (table `app_state`)
 *
 * Rate-limit and daily-quota counters, the admin's source overrides, the sources' sync state and
 * the app's latest release — read right after they are written, so not in Workers KV (whose
 * reads can lag a minute). A get / put (expirationTtl) / delete / getMany interface, and an atomic
 * increment for counters. Without a database (env.DB) there is no store (null): callers treat
 * that as "nothing stored". The price book and the sources' items are in KV (kvStore.js).
 *
 * Expired rows are ignored when read and purged by the hourly cron (purgeExpiredState).
 */

import { ensureSchema } from "./schema.repository.js";
import { logger } from "../lib/logger.js";

const hasDatabase = (env) => typeof env?.DB?.prepare === "function";

const decode = (value, type) => {
  if (value === null || value === undefined) return null;
  if (type !== "json") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

function d1Store(env) {
  const db = env.DB;
  const ready = () => ensureSchema(env);

  async function getMany(keys, type) {
    const result = new Map();
    const unique = [...new Set(keys.filter(Boolean))];
    if (!unique.length) return result;
    await ready();
    const { results = [] } = await db.prepare(
      `SELECT key, value FROM app_state WHERE key IN (${unique.map(() => "?").join(", ")})
         AND (expires_at IS NULL OR expires_at > ?)`
    ).bind(...unique, Date.now()).all();
    const found = new Map(results.map((row) => [row.key, row.value]));
    for (const key of unique) result.set(key, decode(found.get(key), type));
    return result;
  }

  async function put(key, value, { expirationTtl } = {}) {
    await ready();
    const now = Date.now();
    const expiresAt = expirationTtl ? now + Number(expirationTtl) * 1000 : null;
    await db.prepare(
      `INSERT INTO app_state (key, value, expires_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at, updated_at = excluded.updated_at`
    ).bind(key, String(value), expiresAt, now).run();
  }

  /** Add `delta` to a counter in one statement (an expired one starts over); returns the new count */
  async function increment(key, delta = 1, { expirationTtl } = {}) {
    await ready();
    const now = Date.now();
    const expiresAt = expirationTtl ? now + Number(expirationTtl) * 1000 : null;
    const row = await db.prepare(
      `INSERT INTO app_state (key, value, expires_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET
         value = CASE WHEN app_state.expires_at IS NOT NULL AND app_state.expires_at <= ? THEN excluded.value
                      ELSE CAST(CAST(MAX(0, COALESCE(CAST(NULLIF(app_state.value, '') AS INTEGER), 0) + ?) AS INTEGER) AS TEXT) END,
         expires_at = excluded.expires_at, updated_at = excluded.updated_at
       RETURNING value`
    ).bind(key, String(Math.max(0, delta)), expiresAt, now, now, delta).first();
    return parseInt(row?.value ?? "0", 10) || 0;
  }

  return {
    kind: "d1",
    increment,
    async get(key, type) {
      return (await getMany([key], type)).get(key) ?? null;
    },
    getMany,
    put,
    async delete(key) {
      await ready();
      await db.prepare("DELETE FROM app_state WHERE key = ?").bind(key).run();
    },
  };
}

/**
 * The state store for this request (null without a database)
 * @returns {{ kind: 'd1', get: Function, getMany: Function, put: Function, increment: Function, delete: Function }|null}
 */
export function getStateStore(env) {
  return hasDatabase(env) ? d1Store(env) : null;
}
/** Delete expired rows (rate-limit and quota counters); run from the hourly cron */
export async function purgeExpiredState(env) {
  if (!hasDatabase(env)) return;
  try {
    await ensureSchema(env);
    await env.DB.prepare("DELETE FROM app_state WHERE expires_at IS NOT NULL AND expires_at <= ?").bind(Date.now()).run();
  } catch (err) {
    logger.warn("[StateStore] purge failed:", { error: err.message });
  }
}
