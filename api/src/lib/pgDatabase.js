/**
 * pgDatabase.js — The app's database on Postgres (through Cloudflare Hyperdrive), with the same
 * interface the repositories were written against (Cloudflare D1's): prepare(sql).bind(...args)
 * then .first() / .all() / .run(), and batch([...]) as one transaction.
 *
 * The repositories' SQL is written once and runs here as Postgres: translateSql() turns
 * `?` / `?N` placeholders into `$N`, quotes camelCase aliases (Postgres would fold them to
 * lower case), makes LIKE case-insensitive as it is in SQLite, and rewrites the few SQLite-only
 * forms still in use. Whole numbers and numerics come back as JS numbers, as they did from D1.
 *
 * One connection per request (Hyperdrive pools the real ones): opened on the first query and
 * closed once the request is done and no query is running — a query from work still running
 * after the response (waitUntil) opens a new one, closed the same way.
 */

import pg from "pg";
import { logger } from "./logger.js";

// BIGINT (COUNT(*), timestamps) and NUMERIC (SUM, AVG) as numbers, like D1 returned them
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

const CONNECT_TIMEOUT_MS = 5000;
const QUERY_TIMEOUT_MS = 20000;

/**
 * SQL written for D1 (SQLite) as Postgres
 * @param {string} sql
 * @returns {string}
 */
export function translateSql(sql) {
  const text = String(sql).replace(/datetime\('now'\)/gi, "to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')");
  // Code outside string literals and quoted identifiers gets the rewrites; literals stay as written
  const code = (part) => part
    // camelCase aliases keep their case
    .replace(/\bAS\s+([a-z][a-z0-9_]*[A-Z][A-Za-z0-9_]*)\b/g, 'AS "$1"')
    // SQLite's LIKE ignores (ASCII) case
    .replace(/\bLIKE\b/gi, "ILIKE");
  let out = "";
  let segment = "";
  let next = 1;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === ch) {
          if (text[j + 1] === ch) { j += 2; continue; }
          break;
        }
        j++;
      }
      out += code(segment) + text.slice(i, j + 1);
      segment = "";
      i = j + 1;
      continue;
    }
    if (ch === "?") {
      const m = /^\?(\d+)/.exec(text.slice(i, i + 12));
      segment += m ? `$${m[1]}` : `$${next++}`;
      i += m ? m[0].length : 1;
      continue;
    }
    segment += ch;
    i += 1;
  }
  out += code(segment);
  // INSERT OR IGNORE → ON CONFLICT DO NOTHING
  if (/^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(out)) {
    out = `${out.replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i, "INSERT INTO").replace(/;?\s*$/, "")} ON CONFLICT DO NOTHING`;
  }
  return out;
}

/**
 * A database for one request (or one scheduled run)
 * @param {string} connectionString - Hyperdrive's
 * @param {{ createClient?: (connectionString: string) => object }} [deps] - for tests
 */
export function createPgDatabase(connectionString, deps = {}) {
  let client = null;
  let connecting = null;
  let pending = 0;
  let closeWhenIdle = false;

  const newClient = deps.createClient || ((cs) => new pg.Client({
    connectionString: cs,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
  }));

  async function connected() {
    if (client) return client;
    if (!connecting) {
      const c = newClient(connectionString);
      connecting = c.connect().then(() => {
        client = c;
        connecting = null;
        return c;
      }, (err) => {
        connecting = null;
        throw err;
      });
    }
    return connecting;
  }

  function endIfIdle() {
    if (!closeWhenIdle || pending > 0 || !client) return Promise.resolve();
    const c = client;
    client = null;
    return c.end().catch(() => {});
  }

  async function query(sql, params) {
    pending++;
    try {
      const c = await connected();
      return await c.query(translateSql(sql), params);
    } catch (err) {
      logger.warn("[Postgres] Query failed:", { error: err.message, sql: String(sql).slice(0, 200) });
      throw err;
    } finally {
      pending--;
      // Once the request is done, the connection closes as soon as nothing runs on it
      queueMicrotask(() => { endIfIdle(); });
    }
  }

  const resultOf = (res) => ({
    success: true,
    results: res.rows || [],
    meta: { changes: res.rowCount ?? 0, rows_read: res.rows?.length ?? 0, rows_written: res.rowCount ?? 0 },
  });

  function statement(sql, params = []) {
    return {
      sql,
      params,
      bind: (...args) => statement(sql, args),
      async first(column) {
        const res = await query(sql, params);
        const row = res.rows?.[0] ?? null;
        if (column !== undefined) return row ? (row[column] ?? null) : null;
        return row;
      },
      async all() {
        return resultOf(await query(sql, params));
      },
      async run() {
        return resultOf(await query(sql, params));
      },
      async raw() {
        const res = await query(sql, params);
        return (res.rows || []).map((row) => Object.values(row));
      },
    };
  }

  return {
    isPostgres: true,
    prepare: (sql) => statement(sql),
    /** Several statements in one transaction (D1's batch is atomic too) */
    async batch(statements) {
      pending++;
      try {
        const c = await connected();
        await c.query("BEGIN");
        try {
          const results = [];
          for (const st of statements) results.push(resultOf(await c.query(translateSql(st.sql), st.params)));
          await c.query("COMMIT");
          return results;
        } catch (err) {
          await c.query("ROLLBACK").catch(() => {});
          throw err;
        }
      } finally {
        pending--;
        queueMicrotask(() => { endIfIdle(); });
      }
    },
    /** Plain SQL, possibly several statements (no parameters) */
    async exec(sql) {
      await query(sql, []);
      return { count: 1 };
    },
    /** The request is done: close the connection once nothing runs on it */
    close() {
      closeWhenIdle = true;
      return endIfIdle();
    },
  };
}
