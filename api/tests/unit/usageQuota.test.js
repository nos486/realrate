/**
 * usageQuota.test.js — User tiers, daily limits and their counters (D1 app_state)
 */

import { describe, it, expect, vi } from 'vitest';
import { dailyLimitFor, userTierOf, USER_TIERS } from '../../src/config/usageLimits.js';
import { consumeQuota, getQuota, refundQuota, tehranDay } from '../../src/lib/usageQuota.js';
import { memoryStateDb } from '../helpers/memoryStateDb.js';

const memoryEnv = () => ({ DB: memoryStateDb() });

const USER = { id: 'u1', role: 'user' };
const ADMIN = { id: 'a1', role: 'admin' };

describe('tiers', () => {
  it('puts admins in the unlimited tier and everyone else in the user tier', () => {
    expect(userTierOf(ADMIN)).toBe('admin');
    expect(userTierOf(USER)).toBe('user');
    expect(USER_TIERS.admin.unlimited).toBe(true);
    expect(dailyLimitFor(USER, 'cheque_scan')).toBe(10);
    expect(dailyLimitFor(ADMIN, 'cheque_scan')).toBeNull();
  });

  it('allows nothing of a feature no tier lists', () => {
    expect(dailyLimitFor(USER, 'unknown_feature')).toBe(0);
    expect(dailyLimitFor(ADMIN, 'unknown_feature')).toBe(0);
  });
});

describe('counters', () => {
  it('counts per user and day, refuses past the limit, and gives uses back', async () => {
    const env = memoryEnv();
    for (let i = 1; i <= 10; i++) {
      expect((await consumeQuota(env, USER, 'cheque_scan')).remaining).toBe(10 - i);
    }
    await expect(consumeQuota(env, USER, 'cheque_scan')).rejects.toMatchObject({ statusCode: 429, code: 'QUOTA_EXCEEDED' });
    // The refused use is not counted
    expect((await getQuota(env, USER, 'cheque_scan')).used).toBe(10);

    await refundQuota(env, USER, 'cheque_scan');
    expect((await getQuota(env, USER, 'cheque_scan')).remaining).toBe(1);

    // Another user has their own count
    expect((await getQuota(env, { id: 'u2', role: 'user' }, 'cheque_scan')).used).toBe(0);
  });

  it('starts over on a new Tehran day', async () => {
    const env = memoryEnv();
    const lateEvening = new Date('2026-09-27T20:00:00Z'); // 23:30 in Tehran
    const afterMidnight = new Date('2026-09-27T21:00:00Z'); // 00:30 the next day
    expect(tehranDay(lateEvening)).toBe('2026-09-27');
    expect(tehranDay(afterMidnight)).toBe('2026-09-28');

    await consumeQuota(env, USER, 'cheque_scan', { now: lateEvening });
    expect((await getQuota(env, USER, 'cheque_scan', { now: afterMidnight })).used).toBe(0);
  });

  it('refuses a feature the tier does not allow at all', async () => {
    await expect(consumeQuota(memoryEnv(), USER, 'unknown_feature')).rejects.toMatchObject({ statusCode: 429 });
  });
});
