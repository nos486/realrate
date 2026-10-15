/**
 * schemaCleanup.test.js — The one-time cleanup after encryption became mandatory, on SQLite:
 * accounts without the vault go with everything they hold, portfolios without a data key go,
 * the tables and columns from before the vault are dropped — once, and nothing else is touched
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sqliteD1 } from '../helpers/sqliteD1.js';
import { ensureD1Schema, resetD1SchemaCache } from '../../src/repositories/d1Schema.js';

const NOW = '2026-10-01T00:00:00.000Z';

/** A database as it was before: the old portfolio columns and a plaintext table */
async function oldDatabase(db) {
  await db.batch([
    db.prepare(`CREATE TABLE portfolios (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, is_default INTEGER DEFAULT 0,
      share_slug TEXT UNIQUE, share_password TEXT, share_enabled INTEGER DEFAULT 0, is_e2ee INTEGER DEFAULT 0, e2ee_salt TEXT DEFAULT '',
      e2ee_verifier TEXT DEFAULT '', e2ee_wrapped_key TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
    db.prepare('CREATE TABLE loans (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL)'),
    db.prepare("INSERT INTO loans (id, user_id, title) VALUES ('ln_old', 'u_plain', 'وام')"),
  ]);
}

async function seed(db) {
  const user = (id, isDemo = 0) => db.prepare(`INSERT INTO users (id, email, created_at, last_login, is_demo) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, `${id}@x.ir`, NOW, NOW, isDemo);
  const vault = (id) => db.prepare(`INSERT INTO user_vaults (user_id, salt, wrapped_key, version, created_at, updated_at) VALUES (?, 's', 'w', 1, ?, ?)`)
    .bind(id, NOW, NOW);
  const portfolio = (id, userId, key, isDefault, createdAt) => db.prepare(`INSERT INTO portfolios (id, user_id, name, is_default, share_slug, e2ee_wrapped_key, created_at, updated_at)
    VALUES (?, ?, 'p', ?, ?, ?, ?, ?)`).bind(id, userId, isDefault, `s_${id}`, key, createdAt, createdAt);
  const record = (id, userId, parentId) => db.prepare(`INSERT INTO vault_records (user_id, kind, id, payload, record_date, parent_id, created_at, updated_at)
    VALUES (?, 'holding', ?, 'enc', '', ?, ?, ?)`).bind(userId, id, parentId, NOW, NOW);
  await db.batch([
    user('u_ok'), vault('u_ok'),
    user('u_plain'),
    user('u_demo', 1),
    // u_ok: a keyless (older) default portfolio and a keyed one
    portfolio('p_old', 'u_ok', '', 1, '2025-01-01'), record('r_old', 'u_ok', 'p_old'),
    portfolio('p_new', 'u_ok', 'enc:key', 0, '2026-01-01'), record('r_new', 'u_ok', 'p_new'),
    portfolio('p_plain', 'u_plain', 'enc:key', 1, '2026-01-01'), record('r_plain', 'u_plain', 'p_plain'),
    db.prepare(`INSERT INTO sessions (token, user_id, email, role, created_at, expires_at) VALUES ('t_plain', 'u_plain', 'u_plain@x.ir', 'user', '${NOW}', 9999999999999)`),
  ]);
}

const ids = async (db, sql) => (await db.prepare(sql).all()).results.map((r) => Object.values(r)[0]);

describe('one-time cleanup of unencrypted data', () => {
  let db;
  beforeEach(() => {
    resetD1SchemaCache();
    db = sqliteD1();
  });
  afterEach(() => db.close());

  it('deletes accounts without the vault and keyless portfolios, keeps the rest, and drops the old schema', async () => {
    await oldDatabase(db);
    // The tables as they are today, before the cleanup's version runs
    await ensureD1Schema(db).catch(() => {});
    await db.prepare('DELETE FROM app_cleanups').run();
    await db.prepare('DELETE FROM app_schema').run();
    await seed(db);

    resetD1SchemaCache();
    await ensureD1Schema(db);

    expect(await ids(db, 'SELECT id FROM users ORDER BY id')).toEqual(['u_demo', 'u_ok']);
    expect(await ids(db, "SELECT COUNT(*) FROM sessions WHERE user_id = 'u_plain'")).toEqual([0]);
    expect(await ids(db, 'SELECT id FROM portfolios ORDER BY id')).toEqual(['p_new']);
    expect(await ids(db, 'SELECT id FROM vault_records ORDER BY id')).toEqual(['r_new']);
    // The keyless default went: the keyed one is the default now
    expect(await ids(db, "SELECT is_default FROM portfolios WHERE id = 'p_new'")).toEqual([1]);
    expect(await ids(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'loans'")).toEqual([]);
    const columns = await ids(db, "SELECT name FROM pragma_table_info('portfolios')");
    expect(columns).not.toContain('is_e2ee');
    expect(columns).not.toContain('e2ee_salt');
    expect(columns).toContain('e2ee_wrapped_key');
  });

  it('runs once: an account made after it keeps its data on the next schema run', async () => {
    await ensureD1Schema(db);
    await db.prepare(`INSERT INTO users (id, email, created_at, last_login) VALUES ('u_new', 'new@x.ir', ?, ?)`).bind(NOW, NOW).run();
    await db.prepare('DELETE FROM app_schema').run();
    resetD1SchemaCache();
    await ensureD1Schema(db);
    expect(await ids(db, 'SELECT id FROM users')).toEqual(['u_new']);
  });
});
