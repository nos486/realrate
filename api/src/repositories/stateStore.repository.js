/**
 * stateStore.repository.js — The app's small key/value state, in Postgres (table `app_state`)
 *
 * What used to live in Workers KV and changes all the time — the price book, each price source's
 * items, the admin's source overrides, the app's latest release, rate-limit and daily-quota
 * counters — is kept here: the cron writes the prices every minute, far past KV's free daily
 * writes (1,000). The store has KV's shape (get / put with expirationTtl / delete, plus getMany),
 * so the repositories read the same either way:
 *
 *   - with the database (env.DB): Postgres. A key that was never written here is looked up once
 *     in KV (when the binding is there) and copied over, so nothing is lost on the switch.
 *   - without it (tests, a misconfigured environment): the KV binding, as before.
 *
 * Expired rows are ignored when read and purged by the hourly cron (purgeExpiredState).
 */

import { ensureSchema } from "./schema.repository.js";
import { logger } from "../lib/logger.js";

/** Keys copied from KV on their first read (everything else simply starts empty) */
const MIGRATED_FROM_KV = [/^prices$/, /^source_items:/, /^price_source_overrides$/];

const kvOf = (env) => env?.REALRATE_KV || env?.KV || null;
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

function pgStore(env) {
  const db = env.DB;
  const ready = () => ensureSchema(env);

  async function copyFromKv(key) {
    const kv = kvOf(env);
    if (!kv || !MIGRATED_FROM_KV.some((re) => re.test(key))) return null;
    try {
      const value = await kv.get(key);
      if (value !== null && value !== undefined) await put(key, value);
      return value ?? null;
    } catch {
      return null;
    }
  }

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
    for (const key of unique) {
      const raw = found.has(key) ? found.get(key) : await copyFromKv(key);
      result.set(key, decode(raw, type));
    }
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

  return {
    kind: "postgres",
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

function kvStore(kv) {
  return {
    kind: "kv",
    get: (key, type) => (type ? kv.get(key, type) : kv.get(key)),
    async getMany(keys, type) {
      const unique = [...new Set(keys.filter(Boolean))];
      const values = await Promise.all(unique.map((key) => (type ? kv.get(key, type) : kv.get(key))));
      return new Map(unique.map((key, i) => [key, values[i] ?? null]));
    },
    put: (key, value, options) => (options ? kv.put(key, value, options) : kv.put(key, value)),
    delete: (key) => kv.delete(key),
  };
}

/**
 * The state store for this request: Postgres when the database is there, else KV, else null
 * @returns {{ kind: 'postgres'|'kv', get: Function, getMany: Function, put: Function, delete: Function }|null}
 */
export function getStateStore(env) {
  if (hasDatabase(env)) return pgStore(env);
  const kv = kvOf(env);
  return kv ? kvStore(kv) : null;
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
