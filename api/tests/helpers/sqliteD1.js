/**
 * sqliteD1.js — The D1 binding's interface over Node's own SQLite (node:sqlite), for tests
 *
 * D1 is SQLite, so the app's real SQL runs here unchanged: prepare(sql).bind(...).first(column) /
 * all() / run() / raw(), batch([...]) as one transaction, exec(). Like D1, binding `undefined` is
 * an error (a bug the mock databases would hide) and booleans are stored as 1 / 0.
 *
 *   const db = sqliteD1();           // a fresh in-memory database
 *   const env = { DB: db };
 *   db.close();
 */

import { DatabaseSync } from 'node:sqlite';

function toSqliteValue(value, index) {
  if (value === undefined) throw new Error(`D1_TYPE_ERROR: Type 'undefined' not supported for value at index ${index}`);
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

export function sqliteD1() {
  const sqlite = new DatabaseSync(':memory:');
  let queries = 0;

  const runOne = (sql, params, mode) => {
    queries += 1;
    const statement = sqlite.prepare(sql);
    const values = params.map(toSqliteValue);
    if (mode === 'write') {
      // A statement with RETURNING gives rows, like a SELECT
      if (/\bRETURNING\b/i.test(sql)) {
        const results = statement.all(...values);
        return { results, changes: results.length, lastRowId: 0 };
      }
      const info = statement.run(...values);
      return { results: [], changes: Number(info.changes), lastRowId: Number(info.lastInsertRowid) };
    }
    const results = statement.all(...values);
    return { results, changes: 0, lastRowId: 0 };
  };

  const isRead = (sql) => /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(sql) && !/\bRETURNING\b/i.test(sql);
  const resultOf = ({ results, changes, lastRowId }) => ({
    success: true,
    results,
    meta: { changes, last_row_id: lastRowId, rows_read: results.length, rows_written: changes, duration: 0 },
  });

  function statement(sql, params = []) {
    const exec = () => runOne(sql, params, isRead(sql) ? 'read' : 'write');
    return {
      sql,
      params,
      bind: (...args) => statement(sql, args),
      async first(column) {
        const row = exec().results[0] ?? null;
        if (column !== undefined) return row ? (row[column] ?? null) : null;
        return row;
      },
      async all() {
        return resultOf(exec());
      },
      async run() {
        return resultOf(exec());
      },
      async raw() {
        return exec().results.map((row) => Object.values(row));
      },
    };
  }

  return {
    sqlite,
    get queries() {
      return queries;
    },
    prepare: (sql) => statement(sql),
    /** Every statement in one transaction, like D1 */
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map((st) => resultOf(runOne(st.sql, st.params, isRead(st.sql) ? 'read' : 'write')));
        sqlite.exec('COMMIT');
        return results;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
    async exec(sql) {
      sqlite.exec(sql);
      return { count: 1, duration: 0 };
    },
    close() {
      sqlite.close();
    },
  };
}
