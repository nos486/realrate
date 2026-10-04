/**
 * isolateCache.test.js — Small values kept in the isolate's memory for a TTL, and the reads that
 * use it (sessions, group keys) going to D1 once per TTL, not once per request (real SQLite)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createIsolateCache } from '../../src/lib/isolateCache.js';
import { dbSaveSession, dbGetSession, dbDeleteSession, forgetSessions } from '../../src/repositories/session.repository.js';
import { dbDeleteUserSessions } from '../../src/repositories/account.repository.js';
import { dbGetUserGroupKeys, dbAddGroupMember, dbRemoveGroupMember, forgetUserGroupKeys } from '../../src/repositories/userGroups.repository.js';
import { resetD1SchemaCache } from '../../src/repositories/d1Schema.js';
import { sqliteD1 } from '../helpers/sqliteD1.js';

describe('createIsolateCache', () => {
  it('keeps a value for its TTL', async () => {
    const cache = createIsolateCache({ ttlMs: 1000 });
    const load = vi.fn(async () => 'v');
    expect(await cache.getOrLoad('k', load, 0)).toBe('v');
    expect(await cache.getOrLoad('k', load, 999)).toBe('v');
    expect(load).toHaveBeenCalledTimes(1);
    expect(await cache.getOrLoad('k', load, 1000)).toBe('v');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('concurrent loads share one; undefined and failures are not kept', async () => {
    const cache = createIsolateCache({ ttlMs: 1000 });
    const load = vi.fn(async () => 1);
    await Promise.all([1, 2, 3].map(() => cache.getOrLoad('k', load)));
    expect(load).toHaveBeenCalledTimes(1);

    const missing = vi.fn(async () => undefined);
    await cache.getOrLoad('m', missing);
    await cache.getOrLoad('m', missing);
    expect(missing).toHaveBeenCalledTimes(2);

    await expect(cache.getOrLoad('e', async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(await cache.getOrLoad('e', async () => 2)).toBe(2);
  });

  it('keeps at most `max` entries, dropping the oldest', () => {
    const cache = createIsolateCache({ ttlMs: 1000, max: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect([cache.get('a'), cache.get('b'), cache.get('c')]).toEqual([undefined, 2, 3]);
  });

  it('deleteWhere forgets matching entries', () => {
    const cache = createIsolateCache({ ttlMs: 1000 });
    cache.set('t1', { userId: 'u1' });
    cache.set('t2', { userId: 'u2' });
    cache.deleteWhere((v) => v.userId === 'u1');
    expect([cache.get('t1'), cache.get('t2')]).toEqual([undefined, { userId: 'u2' }]);
  });
});

/** The D1 binding, counting the statements that read `table` */
function countingDb(table) {
  const db = sqliteD1();
  const counter = { reads: 0 };
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    if (new RegExp(`^\\s*SELECT[\\s\\S]*FROM ${table}\\b`, 'i').test(sql)) counter.reads += 1;
    return prepare(sql);
  };
  return { db, counter };
}

describe('sessions', () => {
  let env;
  let counter;
  const session = { token: 'tok1', userId: 'u1', email: 'a@b.c', name: 'A', picture: '', role: 'user', createdAt: new Date().toISOString() };

  beforeEach(async () => {
    resetD1SchemaCache();
    forgetSessions();
    ({ db: env, counter } = (() => { const made = countingDb('sessions'); return { db: { DB: made.db }, counter: made.counter }; })());
    await dbSaveSession(env, session);
  });

  it('a burst of requests reads the session once', async () => {
    for (let i = 0; i < 5; i++) expect(await dbGetSession(env, 'tok1')).toMatchObject({ userId: 'u1' });
    expect(counter.reads).toBe(1);
  });

  it('signing out here is seen at once', async () => {
    await dbGetSession(env, 'tok1');
    await dbDeleteSession(env, 'tok1');
    expect(await dbGetSession(env, 'tok1')).toBeNull();
  });

  it('signing out everywhere is seen at once', async () => {
    await dbGetSession(env, 'tok1');
    await dbDeleteUserSessions(env, 'u1');
    expect(await dbGetSession(env, 'tok1')).toBeNull();
  });

  it('an unknown token is not kept (read each time) and gives null', async () => {
    expect(await dbGetSession(env, 'nope')).toBeNull();
    expect(await dbGetSession(env, 'nope')).toBeNull();
    expect(counter.reads).toBe(2);
  });
});

describe('group keys', () => {
  it('read once, and a membership change made here is seen at once', async () => {
    resetD1SchemaCache();
    forgetUserGroupKeys();
    const made = countingDb('user_group_members');
    const env = { DB: made.db };
    expect(await dbGetUserGroupKeys(env, 'u1')).toEqual([]);
    expect(await dbGetUserGroupKeys(env, 'u1')).toEqual([]);
    expect(made.counter.reads).toBe(1);
    await dbAddGroupMember(env, 'grp_pro', 'u1');
    expect(await dbGetUserGroupKeys(env, 'u1')).toEqual(['pro']);
    await dbRemoveGroupMember(env, 'grp_pro', 'u1');
    expect(await dbGetUserGroupKeys(env, 'u1')).toEqual([]);
  });
});
