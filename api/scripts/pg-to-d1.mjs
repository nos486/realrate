#!/usr/bin/env node
/**
 * pg-to-d1.mjs — Copy the app's data from Postgres (Hyperdrive's database) into SQL files for D1
 *
 *   DATABASE_URL=postgres://user:pass@host:5432/realrate node api/scripts/pg-to-d1.mjs d1-import
 *   for f in d1-import/*.sql; do npx wrangler d1 execute realrate --remote --file "$f" -y; done
 *
 * - Every table of d1Schema.js, in its columns (a column Postgres doesn't have takes its default).
 *   The first file creates the tables and records the schema version, so the Worker doesn't run
 *   the DDL again.
 * - price_history (every change) becomes price_daily: each item's last price of each Tehran day.
 * - app_state: only the admin's source overrides. The price book and the sources' items go to KV
 *   and are rebuilt by the first cron ticks; counters and the release cache start over.
 * Rows are grouped into INSERTs under D1's statement limit (100 KB); a single row over it is
 * reported (it cannot be imported this way).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { APP_TABLES, SCHEMA_VERSION } from '../src/repositories/d1Schema.js';

const OUT = process.argv[2] || 'd1-import';
const URL = process.env.DATABASE_URL;
const STATEMENT_LIMIT = 95_000; // D1: 100 KB per statement
const FILE_LIMIT = 20_000_000; // bytes per file
const SKIP = new Set(['app_schema', 'price_daily', 'app_state']);

if (!URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

/** A value as an SQLite literal */
export function literal(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  return `'${String(value).replace(/\u0000/g, '').replace(/'/g, "''")}'`;
}

let fileIndex = 0;
let fileName = '';
let fileParts = [];
let fileSize = 0;
const oversized = [];

function flushFile() {
  if (!fileParts.length) return;
  writeFileSync(join(OUT, fileName), fileParts.join('\n') + '\n');
  console.log(`  wrote ${fileName} (${(fileSize / 1e6).toFixed(1)} MB)`);
  fileParts = [];
  fileSize = 0;
}

function startFile(label) {
  flushFile();
  fileIndex += 1;
  fileName = `${String(fileIndex).padStart(4, '0')}-${label}.sql`;
}

function add(sql) {
  if (fileSize + sql.length > FILE_LIMIT) startFile(fileName.replace(/^\d+-|\.sql$/g, ''));
  fileParts.push(sql);
  fileSize += sql.length + 1;
}

/** INSERT statements for rows, grouped under the statement limit */
function addRows(table, columns, rows) {
  const head = `INSERT INTO ${table} (${columns.join(', ')}) VALUES `;
  let values = [];
  let size = head.length;
  const flush = () => {
    if (values.length) add(`${head}${values.join(',\n')};`);
    values = [];
    size = head.length;
  };
  for (const row of rows) {
    const tuple = `(${columns.map((c) => literal(row[c])).join(', ')})`;
    if (head.length + tuple.length > STATEMENT_LIMIT) {
      oversized.push(`${table}: ${columns.slice(0, 3).map((c) => `${c}=${row[c]}`).join(' ')} (${tuple.length} bytes)`);
      continue;
    }
    if (size + tuple.length + 2 > STATEMENT_LIMIT) flush();
    values.push(tuple);
    size += tuple.length + 2;
  }
  flush();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const client = new pg.Client({ connectionString: URL });
  await client.connect();
  const counts = {};
  try {
    const { rows: existing } = await client.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()",
    );
    const pgColumns = new Map();
    for (const { table_name: t, column_name: c } of existing) {
      if (!pgColumns.has(t)) pgColumns.set(t, new Set());
      pgColumns.get(t).add(c);
    }

    // 1. The tables, and the schema version the Worker checks
    startFile('schema');
    for (const sql of APP_TABLES.flatMap((t) => t.ddl)) add(`${sql.trim()};`);
    add(`INSERT INTO app_schema (id, version) VALUES (1, ${literal(SCHEMA_VERSION)}) ON CONFLICT (id) DO UPDATE SET version = excluded.version;`);

    // 2. Every table
    for (const table of APP_TABLES) {
      if (SKIP.has(table.name)) continue;
      const have = pgColumns.get(table.name);
      if (!have) {
        console.log(`  ${table.name}: not in Postgres, skipped`);
        continue;
      }
      const columns = table.columns.filter((c) => have.has(c));
      const { rows } = await client.query(`SELECT ${columns.map((c) => `"${c}"`).join(', ')} FROM ${table.name}`);
      counts[table.name] = rows.length;
      if (!rows.length) continue;
      startFile(table.name);
      addRows(table.name, columns, rows);
    }

    // 3. The admin's source overrides
    if (pgColumns.has('app_state')) {
      const { rows } = await client.query("SELECT key, value, expires_at, updated_at FROM app_state WHERE key = 'price_source_overrides'");
      counts.app_state = rows.length;
      if (rows.length) {
        startFile('app_state');
        addRows('app_state', ['key', 'value', 'expires_at', 'updated_at'], rows);
      }
    }

    // 4. The price history, one row per item and Tehran day (its last price that day)
    if (pgColumns.has('price_history')) {
      const { rows } = await client.query(`
        SELECT DISTINCT ON (item_key, day) item_key, day, value, updated_at
        FROM (
          SELECT item_key,
                 to_char(recorded_at AT TIME ZONE 'Asia/Tehran', 'YYYY-MM-DD') AS day,
                 value::float8 AS value,
                 (extract(epoch FROM recorded_at) * 1000)::bigint AS updated_at,
                 recorded_at
          FROM price_history
        ) h
        ORDER BY item_key, day, recorded_at DESC
      `);
      counts.price_daily = rows.length;
      if (rows.length) {
        startFile('price_daily');
        addRows('price_daily', ['item_key', 'day', 'value', 'updated_at'], rows);
      }
    }
  } finally {
    await client.end();
  }
  flushFile();

  console.log('\nRows:', counts);
  if (oversized.length) {
    console.warn(`\n${oversized.length} row(s) over D1's 100 KB statement limit were NOT written:`);
    for (const line of oversized) console.warn(`  ${line}`);
    process.exitCode = 2;
  }
  console.log(`\nNext: for f in ${OUT}/*.sql; do npx wrangler d1 execute realrate --remote --file "$f" -y; done`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
