/**
 * d1ToPostgres.js — Moving the app's data from D1 to Postgres, once, from the admin panel
 *
 * The admin starts it and the panel keeps calling runMigrationStep() until it is done. Each call
 * works for a limited time and remembers where it stopped (KV MIGRATION_STATE_KV_KEY), so any
 * amount of data fits within a Worker's limits:
 *
 *   1. waiting  — maintenance mode goes on (only admins get through, so nothing is written while
 *                 the data moves) and the copy waits until every Worker has seen it
 *   2. copying  — Postgres tables are created and emptied, then every table of pgSchema.APP_TABLES
 *                 is copied from D1 in pages
 *   3. switch   — every table's row count is compared; only when all match does the app switch
 *                 to Postgres (lib/database.js). On a mismatch nothing switches and it can be
 *                 run again (the copy starts over).
 *
 * Maintenance mode stays on at the end: the admin turns it off once the switch has reached every
 * Worker (the panel says when).
 */

import { APP_TABLES, ensurePgSchema } from "../../repositories/pgSchema.js";
import { createPgDatabase } from "../../lib/pgDatabase.js";
import {
  DATABASE_BACKEND_KV_KEY,
  DATABASE_BACKENDS,
  databaseBackend,
  forgetDatabaseBackend,
} from "../../lib/database.js";
import { getKv } from "../../repositories/kvCache.repository.js";
import { getGlobalSettings, saveGlobalSettings } from "../../repositories/settings.repository.js";
import { SETTINGS_MEMORY_CACHE_TTL_MS } from "../../config/constants.js";
import { logger } from "../../lib/logger.js";

export const MIGRATION_STATE_KV_KEY = "database_migration";

/** Rows per D1 read / Postgres insert */
const PAGE_SIZE = 200;
/** Work per call, leaving room within the Worker's limits */
const STEP_BUDGET_MS = 20000;
/** How long every Worker needs to see maintenance mode (settings are cached this long) */
export const MAINTENANCE_SETTLE_MS = SETTINGS_MEMORY_CACHE_TTL_MS + 10000;

async function readState(env) {
  try {
    return (await getKv(env)?.get(MIGRATION_STATE_KV_KEY, "json")) || null;
  } catch {
    return null;
  }
}

async function writeState(env, state) {
  await getKv(env)?.put(MIGRATION_STATE_KV_KEY, JSON.stringify(state));
  return state;
}

/** D1 (the source) — env.D1 once lib/database.js ran, env.DB before */
const sourceOf = (env) => env.D1 || env.DB;

function pgOf(env) {
  const cs = env?.HYPERDRIVE?.connectionString;
  if (!cs) throw new Error("اتصال Postgres (HYPERDRIVE) تنظیم نشده است.");
  return env.DB?.isPostgres ? env.DB : createPgDatabase(cs);
}

const isMissingTable = (err) => /no such table/i.test(String(err?.message || err));

/** A table's row count in D1 (0 for a table D1 never created) */
async function d1Count(d1, table) {
  try {
    return Number((await d1.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first())?.count) || 0;
  } catch (err) {
    if (isMissingTable(err)) return 0;
    throw err;
  }
}

async function pgCount(pg, table) {
  return Number((await pg.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first())?.count) || 0;
}

/** Row counts of every table on both sides */
export async function compareCounts(env) {
  const d1 = sourceOf(env);
  const pg = pgOf(env);
  await ensurePgSchema(pg);
  const tables = [];
  for (const { name } of APP_TABLES) {
    const [source, target] = await Promise.all([d1Count(d1, name), pgCount(pg, name)]);
    tables.push({ table: name, d1: source, postgres: target, match: source === target });
  }
  return tables;
}

/**
 * Copy one page of a table: rows [offset, offset + PAGE_SIZE) of D1 into Postgres
 * @returns {Promise<number>} rows copied (fewer than PAGE_SIZE: the table is done)
 */
export async function copyPage(d1, pg, table, offset) {
  let rows;
  try {
    ({ results: rows = [] } = await d1.prepare(`SELECT * FROM ${table.name} ORDER BY rowid LIMIT ? OFFSET ?`)
      .bind(PAGE_SIZE, offset).all());
  } catch (err) {
    if (isMissingTable(err)) return 0;
    throw err;
  }
  if (rows.length === 0) return 0;
  // Only the columns both sides have (an old D1 may lack a newer column: its default applies)
  const columns = table.columns.filter((c) => Object.hasOwn(rows[0], c));
  const params = [];
  const values = rows.map((row) => `(${columns.map((c) => {
    params.push(row[c] ?? null);
    return "?";
  }).join(", ")})`);
  await pg.prepare(
    `INSERT INTO ${table.name} (${columns.join(", ")}) VALUES ${values.join(", ")} ON CONFLICT DO NOTHING`,
  ).bind(...params).run();
  return rows.length;
}

/**
 * Where the move is
 * @returns {Promise<{ backend: string, state: object|null }>}
 */
export async function getMigrationStatus(env) {
  forgetDatabaseBackend();
  return { backend: await databaseBackend(env), state: await readState(env) };
}

/**
 * Do the next part of the move (the panel calls this until `state.phase` is "done")
 * @param {object} env
 * @param {{ now?: () => number, restart?: boolean }} [options]
 * @returns {Promise<{ backend: string, state: object }>}
 */
export async function runMigrationStep(env, { now = () => Date.now(), restart = false } = {}) {
  forgetDatabaseBackend();
  if (await databaseBackend(env) === DATABASE_BACKENDS.postgres) {
    const state = (await readState(env)) || { phase: "done" };
    return { backend: DATABASE_BACKENDS.postgres, state };
  }
  const d1 = sourceOf(env);
  if (!d1 || d1.isPostgres) throw new Error("پایگاه داده D1 برای انتقال در دسترس نیست.");
  const pg = pgOf(env);
  const deadline = now() + STEP_BUDGET_MS;

  let state = restart ? null : await readState(env);

  // 1. Maintenance on, then wait until every Worker has seen it
  if (!state || state.phase === "failed" || state.phase === "done") {
    const settings = await getGlobalSettings(env, true);
    await saveGlobalSettings(env, { ...settings, maintenance_mode: true });
    state = await writeState(env, {
      phase: "waiting",
      startedAt: new Date(now()).toISOString(),
      copyAfter: now() + MAINTENANCE_SETTLE_MS,
    });
    return { backend: DATABASE_BACKENDS.d1, state };
  }
  if (state.phase === "waiting") {
    if (now() < state.copyAfter) return { backend: DATABASE_BACKENDS.d1, state };
    // 2. A clean copy: tables created, emptied
    await ensurePgSchema(pg);
    for (const { name } of [...APP_TABLES].reverse()) await pg.prepare(`TRUNCATE TABLE ${name}`).run();
    state = await writeState(env, { ...state, phase: "copying", tableIndex: 0, offset: 0, copied: {} });
  }

  if (state.phase === "copying") {
    while (state.tableIndex < APP_TABLES.length && now() < deadline) {
      const table = APP_TABLES[state.tableIndex];
      const n = await copyPage(d1, pg, table, state.offset);
      const copied = { ...state.copied, [table.name]: (state.copied?.[table.name] || 0) + n };
      state = n < PAGE_SIZE
        ? { ...state, tableIndex: state.tableIndex + 1, offset: 0, copied }
        : { ...state, offset: state.offset + n, copied };
    }
    await writeState(env, state);
    if (state.tableIndex < APP_TABLES.length) return { backend: DATABASE_BACKENDS.d1, state };
  }

  // 3. Every table counted on both sides; only a full match switches
  const counts = await compareCounts(env);
  if (!counts.every((c) => c.match)) {
    state = await writeState(env, { ...state, phase: "failed", counts, error: "تعداد ردیف‌ها در دو طرف برابر نیست." });
    logger.error("[D1→Postgres] Row counts differ; not switching", { counts });
    return { backend: DATABASE_BACKENDS.d1, state };
  }
  await getKv(env).put(DATABASE_BACKEND_KV_KEY, DATABASE_BACKENDS.postgres);
  forgetDatabaseBackend();
  const switchedAt = now();
  state = await writeState(env, {
    ...state,
    phase: "done",
    counts,
    switchedAt: new Date(switchedAt).toISOString(),
    // When every Worker uses Postgres (they re-read the switch every few seconds)
    safeToOpenAt: switchedAt + 15000,
  });
  logger.info("[D1→Postgres] Data moved and the app switched to Postgres", { counts });
  return { backend: DATABASE_BACKENDS.postgres, state };
}
