/**
 * deleteUserAccount.test.js — dbDeleteUserAccount deletes the user and every per-user table's rows,
 * found from the schema (a table added later is covered without touching the function)
 */
import { describe, it, expect } from 'vitest';
import { dbDeleteUserAccount } from '../../src/repositories/account.repository.js';
import { APP_TABLES, ensureD1Schema } from '../../src/repositories/d1Schema.js';

describe('dbDeleteUserAccount', () => {
  it('deletes the user row and the rows of every table that has a user_id', async () => {
    const sql = [];
    const db = {
      prepare(q) {
        const text = q.replace(/\s+/g, ' ').trim();
        const stmt = { bind: (...a) => ({ ...stmt, args: a }), run: async () => ({ meta: {} }), first: async () => null, all: async () => ({ results: [] }), text };
        return stmt;
      },
      async batch(stmts) { sql.push(...stmts.map((s) => [s.text, s.args])); },
    };
    // The schema setup runs its own statements first: only the account's deletes are checked
    await ensureD1Schema(db);
    sql.length = 0;
    await dbDeleteUserAccount({ DB: db }, 'u1');
    const deletes = sql.filter(([q]) => q.startsWith('DELETE'));
    for (const table of APP_TABLES.filter((t) => t.columns.includes('user_id'))) {
      expect(deletes).toContainEqual([`DELETE FROM ${table.name} WHERE user_id = ?`, ['u1']]);
    }
    expect(deletes).toContainEqual(['DELETE FROM users WHERE id = ?', ['u1']]);
    // Never a delete without the user
    expect(deletes.every(([, args]) => args?.[0] === 'u1')).toBe(true);
  });
});
