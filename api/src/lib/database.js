/**
 * database.js — The app's database for one request: Postgres through Hyperdrive
 *
 * The repositories only use `env.DB` (lib/pgDatabase.js gives it the interface they are written
 * against); this puts one on the environment of each request or scheduled run, and closes it
 * once the work is done.
 */

import { createPgDatabase } from "./pgDatabase.js";

/**
 * The environment for one request or scheduled run, with env.DB on Postgres
 * @returns {{ env: object, close: () => Promise<void> }}
 */
export function withDatabase(env) {
  const connectionString = env?.HYPERDRIVE?.connectionString;
  // Without the binding (reported by validateEnv) the environment stays as it is: requests that
  // need the database fail, and a database given directly (tests) is used as it is
  if (!connectionString) return { env, close: async () => {} };
  const db = createPgDatabase(connectionString);
  return { env: { ...env, DB: db }, close: () => db.close() };
}
