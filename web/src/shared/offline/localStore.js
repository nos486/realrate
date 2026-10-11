/**
 * localStore.js — The device's copy of the encrypted records (IndexedDB), one database per user
 *
 * Holds exactly what the server holds and nothing more readable: each record's ciphertext and its
 * plaintext metadata (record date, parent), the vault (salt + wrapped key), and the queue of
 * changes made offline (also ciphertext). Decrypting still needs the vault's key, which never
 * leaves memory.
 *
 * Stores:
 *   records  [kind, id] → { kind, id, payload, recordDate, parentId, createdAt, updatedAt }
 *            indexes: kind, kindDate [kind, recordDate], kindParent [kind, parentId] — a date range or a
 *            portfolio is read straight from the index, not by loading the whole kind
 *   outbox   seq (auto) → { op: 'put' | 'delete', kind, id, body?, queuedAt }   (in order)
 *   meta     key → { key, value }   (vault, sync cursor, epoch, synced)
 *
 * queryRecords() answers the same filters as GET /api/vault/records/:kind, the same way.
 */

const DB_PREFIX = 'realrate-offline-';
const DB_VERSION = 2;

/** A request (or transaction) as a promise */
function done(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finished(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

export function isLocalStoreAvailable() {
  return typeof indexedDB !== 'undefined';
}

/**
 * Open (creating it the first time) the store of one user
 * @returns {Promise<LocalStore>}
 */
export async function openLocalStore(userId) {
  const request = indexedDB.open(`${DB_PREFIX}${userId}`, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    // Version 2 added the two compound indexes (built from the records already stored)
    const records = db.objectStoreNames.contains('records')
      ? request.transaction.objectStore('records')
      : db.createObjectStore('records', { keyPath: ['kind', 'id'] });
    if (!records.indexNames.contains('kind')) records.createIndex('kind', 'kind');
    if (!records.indexNames.contains('kindDate')) records.createIndex('kindDate', ['kind', 'recordDate']);
    if (!records.indexNames.contains('kindParent')) records.createIndex('kindParent', ['kind', 'parentId']);
    if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
    if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
  };
  return new LocalStore(await done(request));
}

/** Delete a user's store (signing out) */
export async function deleteLocalStore(userId) {
  if (!isLocalStoreAvailable()) return;
  await done(indexedDB.deleteDatabase(`${DB_PREFIX}${userId}`)).catch(() => {});
}

const dayOk = (d) => d >= '1700';

/**
 * The server's list query, on local records: `from`/`to` on the record date (inclusive), `parent`,
 * `undated`, `order` (by record date, then creation), `limit`/`offset` with the `total`
 * @returns {{ records: object[], total?: number }}
 */
export function filterRecords(rows, { from = '', to = '', parent = '', undated = false, order = 'desc', limit = null, offset = 0 } = {}) {
  const dir = order === 'asc' ? 1 : -1;
  const list = rows
    .filter((r) => !from || (r.recordDate || '') >= from)
    .filter((r) => !to || (r.recordDate && r.recordDate <= to))
    .filter((r) => !parent || r.parentId === parent)
    .filter((r) => !undated || !r.recordDate || !dayOk(r.recordDate))
    .sort((a, b) => dir * (String(a.recordDate || '').localeCompare(String(b.recordDate || ''))
      || String(a.createdAt || '').localeCompare(String(b.createdAt || ''))));
  if (!limit) return { records: list };
  const start = Number(offset) || 0;
  return { records: list.slice(start, start + Number(limit)), total: list.length };
}

class LocalStore {
  constructor(db) {
    this.db = db;
  }

  close() {
    this.db.close();
  }

  /** Every record of a kind */
  async listKind(kind) {
    const tx = this.db.transaction('records', 'readonly');
    return done(tx.objectStore('records').index('kind').getAll(kind));
  }

  /**
   * The records a query can match, read through the narrowest index: a date range by [kind,
   * recordDate], a portfolio by [kind, parentId], else the whole kind. filterRecords still applies
   * every filter, so the index only decides how many rows are loaded.
   */
  async candidates(kind, { from = '', to = '', parent = '', undated = false } = {}) {
    const tx = this.db.transaction('records', 'readonly');
    const records = tx.objectStore('records');
    if (!undated && (from || to)) {
      return done(records.index('kindDate').getAll(IDBKeyRange.bound([kind, from || ''], [kind, to || '\uffff'])));
    }
    if (parent) return done(records.index('kindParent').getAll(IDBKeyRange.only([kind, parent])));
    return done(records.index('kind').getAll(kind));
  }

  async queryRecords(kind, filters) {
    return filterRecords(await this.candidates(kind, filters), filters);
  }

  async getRecord(kind, id) {
    const tx = this.db.transaction('records', 'readonly');
    return (await done(tx.objectStore('records').get([kind, id]))) || null;
  }

  /**
   * Several records in one transaction (the lookups run side by side)
   * @param {Array<{ kind: string, id: string }>} keys
   * @returns {Promise<Array<object|null>>} in the order given
   */
  async getRecords(keys) {
    const tx = this.db.transaction('records', 'readonly');
    const records = tx.objectStore('records');
    return Promise.all(keys.map(async ({ kind, id }) => (await done(records.get([kind, id]))) || null));
  }

  /**
   * Apply changes in one transaction: records stored (upsert) and deleted
   * @param {{ put?: object[], remove?: Array<{ kind: string, id: string }> }} changes
   */
  async applyChanges({ put = [], remove = [] }) {
    const tx = this.db.transaction('records', 'readwrite');
    const store = tx.objectStore('records');
    for (const r of put) {
      store.put({
        kind: r.kind,
        id: r.id,
        payload: r.payload,
        recordDate: r.recordDate || '',
        parentId: r.parentId || '',
        createdAt: r.createdAt || r.updatedAt || new Date().toISOString(),
        updatedAt: r.updatedAt || new Date().toISOString(),
      });
    }
    for (const { kind, id } of remove) store.delete([kind, id]);
    await finished(tx);
  }

  async clearRecords() {
    const tx = this.db.transaction('records', 'readwrite');
    tx.objectStore('records').clear();
    await finished(tx);
  }

  // ── Outbox: changes made offline, sent in order when back online ──

  async enqueue(op) {
    const tx = this.db.transaction('outbox', 'readwrite');
    const seq = await done(tx.objectStore('outbox').add({ ...op, queuedAt: new Date().toISOString() }));
    await finished(tx);
    return seq;
  }

  async outbox() {
    const tx = this.db.transaction('outbox', 'readonly');
    return done(tx.objectStore('outbox').getAll());
  }

  async outboxCount() {
    const tx = this.db.transaction('outbox', 'readonly');
    return done(tx.objectStore('outbox').count());
  }

  async dequeue(seq) {
    const tx = this.db.transaction('outbox', 'readwrite');
    tx.objectStore('outbox').delete(seq);
    await finished(tx);
  }

  // ── Meta ──

  async getMeta(key) {
    const tx = this.db.transaction('meta', 'readonly');
    return (await done(tx.objectStore('meta').get(key)))?.value;
  }

  async setMeta(key, value) {
    const tx = this.db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({ key, value });
    await finished(tx);
  }
}
