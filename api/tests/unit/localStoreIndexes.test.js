// @vitest-environment happy-dom
/**
 * localStoreIndexes.test.js — the offline copy answers date-range and portfolio queries from its
 * indexes with the same result as filtering the whole kind, and a version-1 database is upgraded
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { openLocalStore, filterRecords } from '../../../web/src/shared/offline/localStore.js';

const rec = (kind, id, recordDate, parentId = '') => ({ kind, id, payload: `enc:${id}`, recordDate, parentId, createdAt: `2026-01-01T00:00:0${id.length}Z`, updatedAt: '2026-01-02T00:00:00Z' });
const ROWS = [
  rec('expense', 'a', '2026-01-05', 'g1'),
  rec('expense', 'bb', '2026-02-10', 'g1'),
  rec('expense', 'ccc', '2026-03-15', 'g2'),
  rec('expense', 'dddd', '', 'g2'),
  rec('income', 'i', '2026-02-10'),
];
const FILTERS = [
  {},
  { from: '2026-02-01' },
  { to: '2026-02-28' },
  { from: '2026-02-01', to: '2026-03-31', order: 'asc' },
  { parent: 'g2' },
  { parent: 'g1', from: '2026-02-01' },
  { undated: true },
  { limit: 2, offset: 1, order: 'asc' },
];

let store;
let n = 0;
beforeEach(async () => {
  store = await openLocalStore(`idx-${n++}`);
  await store.applyChanges({ put: ROWS });
});

describe('local store indexes', () => {
  it.each(FILTERS.map((f) => [JSON.stringify(f), f]))('query %s matches filtering the whole kind', async (_name, filters) => {
    const expected = filterRecords(ROWS.filter((r) => r.kind === 'expense'), filters);
    const got = await store.queryRecords('expense', filters);
    expect(got.records.map((r) => r.id)).toEqual(expected.records.map((r) => r.id));
    expect(got.total).toBe(expected.total);
  });

  it('reads several records in one go, in order, null where missing', async () => {
    const got = await store.getRecords([{ kind: 'expense', id: 'bb' }, { kind: 'expense', id: 'zz' }, { kind: 'income', id: 'i' }]);
    expect(got.map((r) => r && r.id)).toEqual(['bb', null, 'i']);
  });

  it('upgrades a version-1 database and fills the new indexes', async () => {
    const name = 'realrate-offline-legacy';
    await new Promise((resolve, reject) => {
      const open = indexedDB.open(name, 1);
      open.onupgradeneeded = () => {
        const records = open.result.createObjectStore('records', { keyPath: ['kind', 'id'] });
        records.createIndex('kind', 'kind');
        open.result.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
        open.result.createObjectStore('meta', { keyPath: 'key' });
        for (const r of ROWS) records.put(r);
      };
      open.onsuccess = () => { open.result.close(); resolve(); };
      open.onerror = () => reject(open.error);
    });
    const legacy = await openLocalStore('legacy');
    const got = await legacy.queryRecords('expense', { from: '2026-02-01', to: '2026-03-31' });
    expect(got.records.map((r) => r.id).sort()).toEqual(['bb', 'ccc']);
  });
});
