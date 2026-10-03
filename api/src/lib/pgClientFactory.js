/**
 * pgClientFactory.js — Where Postgres connections come from
 *
 * On Cloudflare each request opens its own pg.Client and Hyperdrive pools the real connections.
 * The Node server (api/server.js) has no Hyperdrive, so it installs a factory that lends
 * connections from one shared pg.Pool instead: the same connect() / query() / end() shape, where
 * end() gives the connection back to the pool. Without a factory nothing changes.
 */

import pg from "pg";

let factory = null;

/** @param {((connectionString: string, options: object) => object)|null} fn */
export function setPgClientFactory(fn) {
  factory = typeof fn === "function" ? fn : null;
}

/** A client with connect() / query() / end() */
export function newPgClient(connectionString, options = {}) {
  return factory ? factory(connectionString, options) : new pg.Client({ connectionString, ...options });
}
