/**
 * database.js — Which database the app runs on: D1 until the data is moved, then Postgres
 *
 * The switch is one KV value (DATABASE_BACKEND_KV_KEY), set by the admin's "move to Postgres"
 * step (services/database/d1ToPostgres.js) once every table is copied and counted. Each request
 * gets `env.DB` for the current backend (the repositories only ever use env.DB) and keeps D1 as
 * `env.D1` for the copy.
 */

import { getKv } from "../repositories/kvCache.repository.js";
import { createPgDatabase } from "./pgDatabase.js";

export const DATABASE_BACKEND_KV_KEY = "database_backend";
export const DATABASE_BACKENDS = { d1: "d1", postgres: "postgres" };

// Read at most every few seconds per isolate: after the switch, every isolate follows within this
const BACKEND_CACHE_MS = 5000;
let cached = { value: null, at: 0 };

/** For tests, and right after the switch in this isolate */
export function forgetDatabaseBackend() {
  cached = { value: null, at: 0 };
}

/** @returns {Promise<"d1"|"postgres">} */
export async function databaseBackend(env) {
  if (cached.value && Date.now() - cached.at < BACKEND_CACHE_MS) return cached.value;
  let value = DATABASE_BACKENDS.d1;
  try {
    const stored = await getKv(env)?.get(DATABASE_BACKEND_KV_KEY);
    if (stored === DATABASE_BACKENDS.postgres) value = DATABASE_BACKENDS.postgres;
  } catch {
    // KV unreadable: keep the last known backend
    if (cached.value) return cached.value;
  }
  cached = { value, at: Date.now() };
  return value;
}

/**
 * The environment for one request or scheduled run, with env.DB on the current backend
 * @returns {Promise<{ env: object, close: () => Promise<void> }>}
 */
export async function withDatabase(env) {
  const backend = await databaseBackend(env);
  const connectionString = env?.HYPERDRIVE?.connectionString;
  if (backend === DATABASE_BACKENDS.postgres) {
    // Never fall back to D1 once switched: it no longer has the latest data
    if (!connectionString) throw new Error("Postgres (HYPERDRIVE) is not configured, but the data lives there");
    const db = createPgDatabase(connectionString);
    return { env: { ...env, DB: db, D1: env.DB }, close: () => db.close() };
  }
  return { env: { ...env, D1: env.DB }, close: async () => {} };
}
