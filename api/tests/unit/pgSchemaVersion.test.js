/**
 * pgSchemaVersion.test.js — a new isolate runs the DDL only when the stored schema version differs
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ensurePgSchema, resetPgSchemaCache, SCHEMA_VERSION, APP_TABLES } from '../../src/repositories/pgSchema.js';

function fakeDb(storedVersion) {
  const ran = [];
  return {
    ran,
    prepare(sql) {
      const st = {
        bind: (...params) => { st.params = params; return st; },
        first: async () => {
          if (storedVersion === undefined) throw new Error('relation "app_schema" does not exist');
          return storedVersion ? { version: storedVersion } : null;
        },
        run: async () => { ran.push({ sql, params: st.params }); return {}; },
      };
      return st;
    },
  };
}

const ddlCount = APP_TABLES.reduce((n, t) => n + t.ddl.length, 0);

describe('ensurePgSchema', () => {
  beforeEach(() => resetPgSchemaCache());

  it('skips every statement when the stored version is current', async () => {
    const db = fakeDb(SCHEMA_VERSION);
    await ensurePgSchema(db);
    expect(db.ran).toEqual([]);
  });

  it.each([['an older version', 'v1-old'], ['no version table yet', undefined]])('applies the DDL and stores the version for %s', async (_label, stored) => {
    const db = fakeDb(stored);
    await ensurePgSchema(db);
    expect(db.ran).toHaveLength(ddlCount + 1);
    expect(db.ran.at(-1).params).toEqual([SCHEMA_VERSION]);
  });

  it('runs once per isolate', async () => {
    const db = fakeDb('v1-old');
    await Promise.all([ensurePgSchema(db), ensurePgSchema(db)]);
    await ensurePgSchema(db);
    expect(db.ran).toHaveLength(ddlCount + 1);
  });
});
