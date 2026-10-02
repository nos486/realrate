/**
 * memoryStateDb.js — An in-memory stand-in for env.DB that understands the state store's
 * statements on `app_state` (stateStore.repository.js); any other statement does nothing.
 *
 * db.rows: Map key → { value, expiresAt }; db.calls: 'select' | 'put' | 'increment' | 'delete'
 * db.value(key) / db.json(key): what is stored
 */

export function memoryStateDb(initial = {}) {
  const rows = new Map(Object.entries(initial).map(([k, v]) => [k, { value: typeof v === 'string' ? v : JSON.stringify(v), expiresAt: null }]));
  const calls = [];
  const live = (key, now) => rows.has(key) && (rows.get(key).expiresAt === null || rows.get(key).expiresAt > now);

  const db = {
    rows,
    calls,
    value: (key) => rows.get(key)?.value ?? null,
    json: (key) => (rows.has(key) ? JSON.parse(rows.get(key).value) : null),
    prepare(sql) {
      const isState = /\bapp_state\b/.test(sql);
      const make = (params = []) => ({
        sql,
        params,
        bind: (...p) => make(p),
        async first() {
          if (isState && /RETURNING value/.test(sql)) {
            calls.push('increment');
            const [key, initialValue, expiresAt, , now, delta] = params;
            const current = live(key, now) ? parseInt(rows.get(key).value, 10) || 0 : null;
            const value = current === null ? initialValue : String(Math.max(0, current + delta));
            rows.set(key, { value, expiresAt });
            return { value };
          }
          return null;
        },
        async all() {
          if (isState && /^\s*SELECT key, value FROM app_state/.test(sql)) {
            calls.push('select');
            const now = params[params.length - 1];
            const keys = params.slice(0, -1);
            return { results: keys.filter((k) => live(k, now)).map((k) => ({ key: k, value: rows.get(k).value })) };
          }
          return { results: [] };
        },
        async run() {
          if (isState && /INSERT INTO app_state/.test(sql)) {
            calls.push('put');
            rows.set(params[0], { value: params[1], expiresAt: params[2] });
          } else if (isState && /DELETE FROM app_state WHERE key/.test(sql)) {
            calls.push('delete');
            rows.delete(params[0]);
          } else if (isState && /DELETE FROM app_state WHERE expires_at/.test(sql)) {
            for (const [k, r] of rows) if (r.expiresAt !== null && r.expiresAt <= params[0]) rows.delete(k);
          }
          return { results: [], meta: { changes: 0 } };
        },
      });
      return make();
    },
    async batch(statements) {
      return Promise.all(statements.map((s) => s.run()));
    },
    async exec() {
      return { count: 1 };
    },
  };
  return db;
}

/**
 * A state database whose reads come from `get(key)` (a stored string or null), for tests that
 * describe what is stored as a function of the key
 */
export function stateDbFrom(get) {
  const db = memoryStateDb();
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    if (!/^\s*SELECT key, value FROM app_state/.test(sql)) return prepare(sql);
    const make = (params = []) => ({
      sql,
      params,
      bind: (...p) => make(p),
      first: async () => null,
      run: async () => ({}),
      async all() {
        db.calls.push('select');
        const keys = params.slice(0, -1);
        const values = await Promise.all(keys.map(async (k) => (db.rows.has(k) ? db.rows.get(k).value : get(k))));
        return { results: keys.map((k, i) => ({ key: k, value: values[i] })).filter((r) => r.value !== null && r.value !== undefined) };
      },
    });
    return make();
  };
  return db;
}
