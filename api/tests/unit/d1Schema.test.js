/**
 * d1Schema.test.js — the app's tables on real SQLite (D1): created in one batch on first use, a new
 * isolate asks one question and runs the DDL only when the stored schema version differs
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ensureD1Schema, resetD1SchemaCache, SCHEMA_VERSION, APP_TABLES } from '../../src/repositories/d1Schema.js';
import { sqliteD1 } from '../helpers/sqliteD1.js';

const tableNames = (db) => db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);

describe('ensureD1Schema', () => {
  beforeEach(() => resetD1SchemaCache());

  it('creates every table and stores the version', async () => {
    const db = sqliteD1();
    await ensureD1Schema(db);
    expect(tableNames(db)).toEqual(expect.arrayContaining(APP_TABLES.map((t) => t.name)));
    expect(await db.prepare('SELECT version FROM app_schema WHERE id = 1').first('version')).toBe(SCHEMA_VERSION);
    db.close();
  });

  it('every table has the columns it lists (the data migration copies those)', async () => {
    const db = sqliteD1();
    await ensureD1Schema(db);
    for (const table of APP_TABLES) {
      const columns = db.sqlite.prepare(`PRAGMA table_info(${table.name})`).all().map((c) => c.name);
      expect(columns).toEqual(table.columns);
    }
    db.close();
  });

  it('a new isolate on a current database asks one question and runs nothing', async () => {
    const db = sqliteD1();
    await ensureD1Schema(db);
    resetD1SchemaCache();
    const before = db.queries;
    await ensureD1Schema(db);
    expect(db.queries - before).toBe(1);
    db.close();
  });

  it('an older version runs the DDL again (idempotent) and stores the new one', async () => {
    const db = sqliteD1();
    await ensureD1Schema(db);
    await db.prepare("UPDATE app_schema SET version = 'v1-old' WHERE id = 1").run();
    resetD1SchemaCache();
    await ensureD1Schema(db);
    expect(await db.prepare('SELECT version FROM app_schema WHERE id = 1').first('version')).toBe(SCHEMA_VERSION);
    db.close();
  });

  it('runs once per isolate, even when asked together', async () => {
    const db = sqliteD1();
    await Promise.all([ensureD1Schema(db), ensureD1Schema(db)]);
    const after = db.queries;
    await ensureD1Schema(db);
    expect(db.queries).toBe(after);
    db.close();
  });
});
