// @vitest-environment happy-dom
/**
 * offlineSync.test.js — The Android app's offline copy of the encrypted records: first sync,
 * reads from the copy, changes made offline queued and sent later, changes from other devices,
 * a reset account, a change the server refuses, the vault remembered for offline unlocking
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── A small fake of the server's vault API ──
const server = vi.hoisted(() => ({
  online: true,
  epoch: 'epoch-1',
  clock: 0,
  records: new Map(),
  tombstones: new Map(),
  refuse: null,
  vault: { salt: 's', wrappedKey: 'enc:e2ee:v1:key' },
}));

vi.mock('../../../web/src/shared/api/httpClient.js', async (orig) => {
  const actual = await orig();
  const { HttpError } = actual;
  const key = (kind, id) => `${kind}|${id}`;
  const tick = () => new Date(Date.UTC(2026, 8, 1) + ++server.clock * 1000).toISOString();
  const offline = () => {
    // What httpClient throws when a request gets no answer
    if (!server.online) throw new HttpError('اتصال به سرور برقرار نشد.', 0, null, 'NETWORK_ERROR');
  };
  const httpClient = {
    get: vi.fn(async (path) => {
      offline();
      if (path === '/api/vault') return { success: true, vault: server.vault };
      if (path.startsWith('/api/vault/sync')) {
        const url = new URL(`https://x${path}`);
        const cursor = url.searchParams.get('cursor') || '';
        const limit = Number(url.searchParams.get('limit')) || 200;
        const [time = '', kind = '', id = ''] = cursor ? cursor.split('|') : [];
        const after = (c) => !cursor || c.time > time || (c.time === time && (c.kind > kind || (c.kind === kind && c.id > id)));
        const changes = [
          ...[...server.records.values()].map((r) => ({ time: r.updatedAt, kind: r.kind, id: r.id, record: r })),
          ...(cursor ? [...server.tombstones.entries()].map(([k, t]) => { const [kd, i] = k.split('|'); return { time: t, kind: kd, id: i, deleted: true }; }) : []),
        ].filter(after).sort((a, b) => (a.time + a.kind + a.id).localeCompare(b.time + b.kind + b.id));
        const page = changes.slice(0, limit);
        const last = page[page.length - 1];
        return {
          success: true,
          epoch: server.epoch,
          records: page.filter((c) => c.record).map((c) => c.record),
          deleted: page.filter((c) => c.deleted).map((c) => ({ kind: c.kind, id: c.id, deletedAt: c.time })),
          cursor: last ? `${last.time}|${last.kind}|${last.id}` : cursor,
          more: changes.length > limit,
        };
      }
      throw new HttpError('not found', 404);
    }),
    put: vi.fn(async (path, body) => {
      offline();
      const [, , , , kind, id] = path.split('/').map(decodeURIComponent);
      if (server.refuse === id) throw new HttpError('refused', 400, { errorCode: 'BAD' });
      const prev = server.records.get(key(kind, id));
      const now = tick();
      const record = { kind, id, payload: body.payload, recordDate: body.recordDate || '', parentId: body.parentId || '', createdAt: prev?.createdAt || now, updatedAt: now };
      server.records.set(key(kind, id), record);
      server.tombstones.delete(key(kind, id));
      return { success: true, record };
    }),
    delete: vi.fn(async (path) => {
      offline();
      const [, , , , kind, id] = path.split('/').map(decodeURIComponent);
      if (!server.records.delete(key(kind, id))) throw new HttpError('not found', 404);
      server.tombstones.set(key(kind, id), tick());
      return { success: true };
    }),
  };
  return { ...actual, httpClient };
});

import * as offline from '../../../web/src/shared/offline/offlineSync.js';
import { filterRecords } from '../../../web/src/shared/offline/localStore.js';
import { listVaultRecords, putVaultRecord, deleteVaultRecord, getVault } from '../../../web/src/shared/vault/vaultApi.js';
import { httpClient, HttpError } from '../../../web/src/shared/api/httpClient.js';

const C = (n) => `enc:e2ee:v1:${n}`;
let user = 0;

function seed(kind, id, recordDate = '', parentId = '') {
  const t = new Date(Date.UTC(2026, 8, 1) + ++server.clock * 1000).toISOString();
  server.records.set(`${kind}|${id}`, { kind, id, payload: C(id), recordDate, parentId, createdAt: t, updatedAt: t });
}

async function start() {
  await offline.startOffline(`u${++user}`);
  await offline.syncNow();
}

beforeEach(() => {
  Object.assign(server, { online: true, epoch: 'epoch-1', clock: 0, refuse: null });
  server.records.clear();
  server.tombstones.clear();
  // Offline at the first failure (the confirmation delay has tests of its own)
  offline.configureOffline({ isEnabled: () => true, offlineConfirmMs: 0 });
  offline.reportOnline();
});
afterEach(async () => {
  await offline.stopOffline({ clear: true });
  vi.clearAllMocks();
});

describe('the local query', () => {
  const rows = [
    { id: 'a', recordDate: '2026-09-02', createdAt: '1', parentId: 'p1' },
    { id: 'b', recordDate: '2026-09-01', createdAt: '2', parentId: 'p2' },
    { id: 'c', recordDate: '', createdAt: '3', parentId: 'p1' },
    { id: 'd', recordDate: '2026-09-02', createdAt: '4', parentId: 'p1' },
  ];
  it('filters and sorts like the server (date, then creation), with pages', () => {
    expect(filterRecords(rows).records.map((r) => r.id)).toEqual(['d', 'a', 'b', 'c']);
    expect(filterRecords(rows, { order: 'asc' }).records.map((r) => r.id)).toEqual(['c', 'b', 'a', 'd']);
    expect(filterRecords(rows, { from: '2026-09-02' }).records.map((r) => r.id)).toEqual(['d', 'a']);
    expect(filterRecords(rows, { to: '2026-09-01' }).records.map((r) => r.id)).toEqual(['b']);
    expect(filterRecords(rows, { parent: 'p1' }).records.map((r) => r.id)).toEqual(['d', 'a', 'c']);
    expect(filterRecords(rows, { undated: true }).records.map((r) => r.id)).toEqual(['c']);
    expect(filterRecords(rows, { limit: 2, offset: 1 })).toEqual({ records: [rows[0], rows[1]], total: 4 });
  });
});

describe('offline copy', () => {
  it('first sync: every record, then reads come from the copy', async () => {
    seed('income', 'i1', '2026-09-01');
    seed('income', 'i2', '2026-09-05');
    seed('expense', 'e1', '2026-09-03', 'g1');
    await start();
    expect(offline.isOfflineReady()).toBe(true);
    httpClient.get.mockClear();
    const res = await listVaultRecords('income', undefined, { from: '2026-09-02' });
    expect(res.records.map((r) => r.id)).toEqual(['i2']);
    expect(httpClient.get).not.toHaveBeenCalledWith(expect.stringContaining('/api/vault/records'), expect.anything());
    // Works without a connection too
    server.online = false;
    expect((await listVaultRecords('expense', undefined, { parent: 'g1' })).records.map((r) => r.id)).toEqual(['e1']);
  });

  it('offline: a change is kept and queued, then sent when the connection is back', async () => {
    await start();
    server.online = false;
    const res = await putVaultRecord('expense', 'e9', C('e9'), { recordDate: '2026-09-10', parentId: 'g1' });
    expect(res).toMatchObject({ success: true, queued: true });
    expect(offline.getOfflineState()).toMatchObject({ online: false, pending: 1 });
    expect((await listVaultRecords('expense', undefined, {})).records.map((r) => r.id)).toEqual(['e9']);
    expect(server.records.has('expense|e9')).toBe(false);

    server.online = true;
    await offline.syncNow();
    expect(server.records.get('expense|e9')).toMatchObject({ payload: C('e9'), recordDate: '2026-09-10', parentId: 'g1' });
    expect(offline.getOfflineState()).toMatchObject({ online: true, pending: 0 });
  });

  it('offline delete: gone from the copy at once, from the server once online', async () => {
    seed('income', 'i1', '2026-09-01');
    await start();
    server.online = false;
    await deleteVaultRecord('income', 'i1');
    expect((await listVaultRecords('income', undefined, {})).records).toEqual([]);
    server.online = true;
    await offline.syncNow();
    expect(server.records.has('income|i1')).toBe(false);
  });

  it('changes from another device arrive, and the screens are told', async () => {
    seed('income', 'i1', '2026-09-01');
    seed('income', 'i2', '2026-09-02');
    await start();
    const changed = vi.fn();
    window.addEventListener(offline.VAULT_CHANGED_EVENT, changed);
    // Another device edits i1 and deletes i2
    await httpClient.put('/api/vault/records/income/i1', { payload: C('i1b'), recordDate: '2026-09-01' });
    await httpClient.delete('/api/vault/records/income/i2');
    await offline.syncNow();
    const list = (await listVaultRecords('income', undefined, {})).records;
    expect(list.map((r) => [r.id, r.payload])).toEqual([['i1', C('i1b')]]);
    expect(changed).toHaveBeenCalledTimes(1);
    // Nothing new: no event
    await offline.syncNow();
    expect(changed).toHaveBeenCalledTimes(1);
    window.removeEventListener(offline.VAULT_CHANGED_EVENT, changed);
  });

  it('a reset account (new epoch) starts the copy over', async () => {
    seed('income', 'old');
    await start();
    server.records.clear();
    server.epoch = 'epoch-2';
    seed('income', 'new');
    await offline.syncNow();
    expect((await listVaultRecords('income', undefined, {})).records.map((r) => r.id)).toEqual(['new']);
  });

  it('a queued change the server refuses is dropped, reported, and the copy rebuilt', async () => {
    seed('income', 'i1');
    await start();
    server.online = false;
    await putVaultRecord('income', 'bad', C('bad'));
    server.online = true;
    server.refuse = 'bad';
    const reported = vi.fn();
    window.addEventListener(offline.OFFLINE_SYNC_ERROR_EVENT, reported);
    await offline.syncNow();
    expect(reported).toHaveBeenCalled();
    expect(offline.getOfflineState().pending).toBe(0);
    expect((await listVaultRecords('income', undefined, {})).records.map((r) => r.id)).toEqual(['i1']);
    window.removeEventListener(offline.OFFLINE_SYNC_ERROR_EVENT, reported);
  });

  it('online, a refusal still fails as before (nothing queued)', async () => {
    await start();
    server.refuse = 'bad';
    await expect(putVaultRecord('income', 'bad', C('bad'))).rejects.toMatchObject({ status: 400 });
    expect(offline.getOfflineState().pending).toBe(0);
  });

  it('the vault is remembered, so it can be unlocked offline', async () => {
    await start();
    await getVault();
    server.online = false;
    expect(await getVault()).toMatchObject({ vault: server.vault });
  });

  it('pages through a large first sync', async () => {
    for (let i = 0; i < 1203; i++) seed('transaction', `t${String(i).padStart(4, '0')}`, '2026-09-01', 'pf');
    await start();
    expect((await listVaultRecords('transaction', undefined, { parent: 'pf', limit: 50 })).total).toBe(1203);
  });

  it('signing out deletes the copy', async () => {
    seed('income', 'i1');
    await start();
    await offline.stopOffline({ clear: true });
    expect(offline.isOfflineActive()).toBe(false);
    // Reads go to the server again
    await listVaultRecords('income', undefined, {}).catch(() => {});
    expect(httpClient.get).toHaveBeenCalledWith(expect.stringContaining('/api/vault/records/income'), undefined);
  });
});

describe('telling offline from a hiccup', () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  it('a failure the next try gets past is never shown as offline', async () => {
    offline.configureOffline({ offlineConfirmMs: 300 });
    await start();
    offline.reportOffline();
    expect(offline.getOfflineState().online).toBe(true);
    await offline.syncNow();
    await wait(400);
    expect(offline.getOfflineState().online).toBe(true);
  });

  it('failures that last are shown as offline', async () => {
    offline.configureOffline({ offlineConfirmMs: 100 });
    await start();
    server.online = false;
    offline.reportOffline();
    expect(offline.getOfflineState().online).toBe(true);
    await wait(200);
    expect(offline.getOfflineState().online).toBe(false);
  });

  it('the browser saying it is offline is believed at once', async () => {
    offline.configureOffline({ offlineConfirmMs: 10_000 });
    await start();
    window.dispatchEvent(new Event('offline'));
    expect(offline.getOfflineState().online).toBe(false);
  });

  it('only no answer or a gateway error is a network problem — never a bug or a refusal', () => {
    expect(offline.isNetworkError(new HttpError('x', 0))).toBe(true);
    expect(offline.isNetworkError(new HttpError('x', 503))).toBe(true);
    expect(offline.isNetworkError(new HttpError('x', 503, { errorCode: 'MAINTENANCE' }))).toBe(false);
    expect(offline.isNetworkError(new HttpError('x', 409))).toBe(false);
    expect(offline.isNetworkError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(false);
    expect(offline.isNetworkError(new DOMException('quota', 'QuotaExceededError'))).toBe(false);
  });
});
