/**
 * pgMigration.service.js — One-time copy of the old Postgres database (through Hyperdrive) into D1
 *
 * Runs by itself: while the Worker still has the HYPERDRIVE binding and the copy isn't finished,
 * every cron tick copies as much as it can (page by page, each page and its progress written in
 * one D1 batch, so a failed tick just repeats its page) and the API answers 503 MAINTENANCE —
 * nobody can sign in or save anything that the copy would miss or overwrite. Progress:
 * GET /api/migration-status. Once it says `done`, the HYPERDRIVE binding (and this file) can go.
 *
 * What is copied: every table of d1Schema.js, in the columns both sides have; price_history
 * becomes price_daily (each item's last price of each Tehran day); of app_state only the admin's
 * source overrides (the price book and the sources' items are rebuilt in KV by the cron).
 * Rows are inserted with OR IGNORE, so a repeated page never duplicates or clobbers anything.
 */

import { APP_TABLES, ensureD1Schema } from "../repositories/d1Schema.js";
import { logger } from "../lib/logger.js";

const SKIP = new Set(["app_schema", "price_daily", "app_state"]);
const PAGE_ROWS = 2000;
const HISTORY_KEYS_PER_PAGE = 100;
const GROUP_BYTES = 900_000; // JSON per D1 statement (a bound value may be up to 2 MB)
const MAX_ROW_BYTES = 1_900_000;
const TICK_BUDGET_MS = 40_000;
const TICK_MAX_PAGES = 150; // keeps a tick far under 1000 D1 queries
const LEASE_MS = 120_000;
const STATUS_CACHE_MS = 10_000;

const STATE_DDL = `CREATE TABLE IF NOT EXISTS pg_migration (
  id INTEGER PRIMARY KEY,
  state TEXT NOT NULL,
  lock_until INTEGER NOT NULL DEFAULT 0
)`;

/** A value as D1 stores it: flags 0/1, times as ISO text, objects as JSON text */
export function toD1Value(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).replace(/\u0000/g, "");
}

/** INSERT OR IGNORE … from one JSON parameter: [[v1, v2, …], …] */
export function insertFromJsonSql(table, columns) {
  const values = columns.map((_, i) => `json_extract(value, '$[${i}]')`).join(", ");
  return `INSERT OR IGNORE INTO ${table} (${columns.join(", ")}) SELECT ${values} FROM json_each(?1)`;
}

/** Rows (objects) → JSON groups under GROUP_BYTES; a row too big for D1 is set aside */
export function groupRows(columns, rows, oversized, label) {
  const groups = [];
  let current = [];
  let size = 2;
  for (const row of rows) {
    const tuple = JSON.stringify(columns.map((c) => toD1Value(row[c])));
    if (tuple.length > MAX_ROW_BYTES) {
      oversized.push(`${label}: ${columns[0]}=${row[columns[0]]} (${tuple.length} bytes)`);
      continue;
    }
    if (current.length && size + tuple.length + 1 > GROUP_BYTES) {
      groups.push(`[${current.join(",")}]`);
      current = [];
      size = 2;
    }
    current.push(tuple);
    size += tuple.length + 1;
  }
  if (current.length) groups.push(`[${current.join(",")}]`);
  return groups;
}

const quote = (c) => `"${c.replace(/"/g, '""')}"`;

// ── State ───────────────────────────────────────────────────────────────

async function readState(db) {
  await db.prepare(STATE_DDL).run();
  const row = await db.prepare("SELECT state, lock_until FROM pg_migration WHERE id = 1").first();
  return row ? { ...JSON.parse(row.state), lockUntil: Number(row.lock_until) || 0 } : null;
}

function saveStateStatement(db, state, lockUntil) {
  const { lockUntil: _drop, ...rest } = state;
  return db
    .prepare("INSERT INTO pg_migration (id, state, lock_until) VALUES (1, ?1, ?2) ON CONFLICT (id) DO UPDATE SET state = excluded.state, lock_until = excluded.lock_until")
    .bind(JSON.stringify(rest), lockUntil);
}

/** Take the tick's lease (false when another tick holds it) */
async function takeLease(db, now) {
  await db.prepare(`INSERT OR IGNORE INTO pg_migration (id, state, lock_until) VALUES (1, '{"phase":"pending"}', 0)`).run();
  const row = await db
    .prepare("UPDATE pg_migration SET lock_until = ?1 WHERE id = 1 AND lock_until < ?2 RETURNING id")
    .bind(now + LEASE_MS, now)
    .first();
  return Boolean(row);
}

// ── Whether the API waits ────────────────────────────────────────────────

let statusCache = { at: 0, pending: true };

/** For tests */
export function resetMigrationStatusCache() {
  statusCache = { at: 0, pending: true };
}

/**
 * Whether the copy still has to run (the API answers 503 until it's done)
 * @param {object} env
 */
export async function isMigrationPending(env) {
  if (!env?.HYPERDRIVE?.connectionString || !env?.DB?.prepare) return false;
  if (!statusCache.pending) return false;
  if (Date.now() - statusCache.at < STATUS_CACHE_MS) return true;
  try {
    const state = await readState(env.DB);
    statusCache = { at: Date.now(), pending: state?.phase !== "done" };
  } catch (err) {
    logger.warn("[PgMigration] Status read failed:", { error: err.message });
    statusCache = { at: Date.now(), pending: true };
  }
  return statusCache.pending;
}

/** Progress for GET /api/migration-status (no data, only counts) */
export async function getMigrationStatus(env) {
  if (!env?.HYPERDRIVE?.connectionString) return { pending: false, phase: "not-configured" };
  const state = (await readState(env.DB)) || { phase: "pending" };
  const { lockUntil, plan, ...rest } = state;
  return {
    pending: state.phase !== "done",
    ...rest,
    tables: plan ? plan.map((t) => t.name) : undefined,
    current: plan && state.step < plan.length ? plan[state.step].name : null,
    running: lockUntil > Date.now(),
  };
}

// ── The copy ─────────────────────────────────────────────────────────────

async function buildPlan(client) {
  const { rows } = await client.query(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()"
  );
  const pgColumns = new Map();
  for (const { table_name: t, column_name: c } of rows) {
    if (!pgColumns.has(t)) pgColumns.set(t, new Set());
    pgColumns.get(t).add(c);
  }
  const plan = [];
  for (const table of APP_TABLES) {
    if (SKIP.has(table.name)) continue;
    const have = pgColumns.get(table.name);
    if (!have) continue;
    const columns = table.columns.filter((c) => have.has(c));
    const pk = await client.query(
      `SELECT a.attname FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       WHERE i.indrelid = $1::regclass AND i.indisprimary`,
      [table.name]
    );
    const order = pk.rows.map((r) => r.attname).filter((c) => have.has(c));
    plan.push({ kind: "table", name: table.name, columns, order });
  }
  if (pgColumns.has("app_state")) plan.push({ kind: "overrides", name: "app_state" });
  if (pgColumns.has("price_history")) plan.push({ kind: "history", name: "price_daily" });
  return plan;
}

/** One page of a step: { statements, rows, next } — next is null when the step is finished */
async function copyPage(client, db, item, cursor, oversized) {
  if (item.kind === "table") {
    const offset = Number(cursor) || 0;
    const order = item.order.length ? item.order.map(quote).join(", ") : "ctid";
    const { rows } = await client.query(
      `SELECT ${item.columns.map(quote).join(", ")} FROM ${quote(item.name)} ORDER BY ${order} LIMIT ${PAGE_ROWS} OFFSET ${offset}`
    );
    const sql = insertFromJsonSql(item.name, item.columns);
    const statements = groupRows(item.columns, rows, oversized, item.name).map((json) => db.prepare(sql).bind(json));
    return { statements, rows: rows.length, next: rows.length < PAGE_ROWS ? null : offset + rows.length };
  }

  if (item.kind === "overrides") {
    const columns = ["key", "value", "expires_at", "updated_at"];
    const { rows } = await client.query(
      "SELECT key, value, expires_at, updated_at FROM app_state WHERE key = 'price_source_overrides'"
    );
    const sql = insertFromJsonSql("app_state", columns);
    const statements = groupRows(columns, rows, oversized, "app_state").map((json) => db.prepare(sql).bind(json));
    return { statements, rows: rows.length, next: null };
  }

  // history: a batch of item keys at a time, each key's last value of each Tehran day
  const after = typeof cursor === "string" ? cursor : "";
  const keys = await client.query(
    `SELECT DISTINCT item_key FROM price_history WHERE item_key > $1 ORDER BY item_key LIMIT ${HISTORY_KEYS_PER_PAGE}`,
    [after]
  );
  const keyList = keys.rows.map((r) => r.item_key);
  if (!keyList.length) return { statements: [], rows: 0, next: null };
  const { rows } = await client.query(
    `SELECT DISTINCT ON (item_key, day) item_key, day, value, updated_at
     FROM (
       SELECT item_key,
              to_char(recorded_at AT TIME ZONE 'Asia/Tehran', 'YYYY-MM-DD') AS day,
              value::float8 AS value,
              (extract(epoch FROM recorded_at) * 1000)::bigint AS updated_at,
              recorded_at
       FROM price_history WHERE item_key = ANY($1)
     ) h
     ORDER BY item_key, day, recorded_at DESC`,
    [keyList]
  );
  const columns = ["item_key", "day", "value", "updated_at"];
  const sql = insertFromJsonSql("price_daily", columns);
  const statements = groupRows(columns, rows, oversized, "price_daily").map((json) => db.prepare(sql).bind(json));
  return {
    statements,
    rows: rows.length,
    next: keyList.length < HISTORY_KEYS_PER_PAGE ? null : keyList[keyList.length - 1],
  };
}

/**
 * Copy as much as one tick allows. Safe to call from overlapping ticks (a lease) and to repeat
 * after a failure (each page and its progress are one D1 transaction).
 * @param {object} env - needs env.DB and env.HYPERDRIVE
 * @param {{ connect?: (connectionString: string) => Promise<object>, budgetMs?: number }} [options]
 * @returns {Promise<object|null>} the state after the tick, or null when there was nothing to do
 */
export async function runMigrationTick(env, { connect, budgetMs = TICK_BUDGET_MS } = {}) {
  if (!(await isMigrationPending(env))) return null;
  const db = env.DB;
  const started = Date.now();
  await ensureD1Schema(db);
  const current = await readState(db);
  if (current?.phase === "done") return current;
  if (!(await takeLease(db, started))) return null;

  const state = { phase: "running", step: 0, cursor: null, counts: {}, oversized: [], ...current };
  if (state.phase === "pending") state.phase = "running";
  state.startedAt ||= new Date(started).toISOString();

  let client = null;
  try {
    client = connect
      ? await connect(env.HYPERDRIVE.connectionString)
      : await (async () => {
          const { default: pg } = await import("pg");
          pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
          pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
          const c = new pg.Client({ connectionString: env.HYPERDRIVE.connectionString });
          await c.connect();
          return c;
        })();

    if (!state.plan) state.plan = await buildPlan(client);

    let pages = 0;
    while (state.step < state.plan.length && pages < TICK_MAX_PAGES && (pages === 0 || Date.now() - started < budgetMs)) {
      const item = state.plan[state.step];
      const page = await copyPage(client, db, item, state.cursor, state.oversized);
      state.counts[item.name] = (state.counts[item.name] || 0) + page.rows;
      if (page.next === null) {
        state.step += 1;
        state.cursor = null;
      } else {
        state.cursor = page.next;
      }
      if (state.step >= state.plan.length) {
        state.phase = "done";
        state.finishedAt = new Date().toISOString();
      }
      state.lastError = null;
      state.updatedAt = new Date().toISOString();
      await db.batch([...page.statements, saveStateStatement(db, state, Date.now() + LEASE_MS)]);
      pages += 1;
    }

    await saveStateStatement(db, state, 0).run();
    if (state.phase === "done") {
      statusCache = { at: Date.now(), pending: false };
      logger.info("[PgMigration] Done:", { counts: state.counts, oversized: state.oversized.length });
    }
    return state;
  } catch (err) {
    logger.error("[PgMigration] Tick failed:", { error: err.message, step: state.step });
    // Keep the progress of the pages already written; only note the error and drop the lease
    const saved = (await readState(db).catch(() => null)) || state;
    saved.lastError = err.message;
    saved.failures = (saved.failures || 0) + 1;
    await saveStateStatement(db, saved, 0).run().catch(() => {});
    return saved;
  } finally {
    await client?.end?.().catch?.(() => {});
  }
}
