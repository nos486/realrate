/**
 * isolateCache.js — Values kept in this Worker isolate's memory for a short time: the standard
 * for a small value read on (almost) every request — a session, a user's groups, the feature
 * rules, the app's latest release — so it is read from D1 once per isolate per TTL, not once per
 * request.
 *
 *   const sessions = createIsolateCache({ ttlMs: 30_000, max: 2000 });
 *   const session = await sessions.getOrLoad(token, () => dbReadSession(token));
 *   sessions.delete(token);                       // after a change made by this isolate
 *
 * Each isolate has its own copy: a change made elsewhere (another isolate, the admin's save) is
 * seen within the TTL, so a TTL is how long a change may take to reach every request. Concurrent
 * loads of one key share one read. A load that throws is not kept; `undefined` is not kept either
 * (use null for "known to be missing").
 */

/**
 * @param {{ ttlMs: number, max?: number }} options - max: entries kept (the oldest go first)
 */
export function createIsolateCache({ ttlMs, max = 1000 }) {
  /** key → { value, at } (Map order = insertion order: the first entry is the oldest) */
  const entries = new Map();
  const loading = new Map();

  const fresh = (entry, now) => entry && now - entry.at < ttlMs;

  function set(key, value, now = Date.now()) {
    entries.delete(key);
    entries.set(key, { value, at: now });
    while (entries.size > max) entries.delete(entries.keys().next().value);
  }

  return {
    /** The kept value, or undefined when there is none or it is too old */
    get(key, now = Date.now()) {
      const entry = entries.get(key);
      if (fresh(entry, now)) return entry.value;
      if (entry) entries.delete(key);
      return undefined;
    },
    set,
    /**
     * The kept value, else load it (once, however many ask at the same time) and keep it
     * @param {string} key
     * @param {() => Promise<any>} load
     */
    async getOrLoad(key, load, now = Date.now()) {
      const entry = entries.get(key);
      if (fresh(entry, now)) return entry.value;
      if (loading.has(key)) return loading.get(key);
      const pending = (async () => {
        const value = await load();
        if (value !== undefined) set(key, value, now);
        return value;
      })();
      loading.set(key, pending);
      try {
        return await pending;
      } finally {
        loading.delete(key);
      }
    },
    delete(key) {
      entries.delete(key);
    },
    /** Forget the entries whose value matches (e.g. every session of one user) */
    deleteWhere(predicate) {
      for (const [key, entry] of entries) if (predicate(entry.value, key)) entries.delete(key);
    },
    clear() {
      entries.clear();
      loading.clear();
    },
    get size() {
      return entries.size;
    },
  };
}
