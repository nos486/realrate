/**
 * usageQuota.test.js — User tiers, daily limits and their KV counters
 */

import { describe, it, expect, vi } from 'vitest';
import { dailyLimitFor, userTierOf, USER_TIERS } from '../../src/config/usageLimits.js';
import { consumeQuota, getQuota, refundQuota, tehranDay } from '../../src/lib/usageQuota.js';

function memoryEnv() {
  const store = new Map();
  return {
    store,
    REALRATE_KV: {
      get: vi.fn(async (k) => (store.has(k) ? store.get(k) : null)),
      put: vi.fn(async (k, v) => { store.set(k, v); }),
    },
  };
}

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

describe('rate gate (Gemini: 5 calls a minute, all users together)', async () => {
  const { decideRateSlot, acquireServiceSlot, RateGate } = await import('../../src/lib/rateGate.js');
  const { SERVICE_RATE_LIMITS } = await import('../../src/config/usageLimits.js');

  it('allows 5 calls in any 60 seconds and says when the next one frees up', () => {
    const rule = SERVICE_RATE_LIMITS.gemini;
    expect(rule).toEqual({ limit: 5, windowSec: 60 });
    let times = [];
    for (let i = 0; i < 5; i++) {
      const d = decideRateSlot(times, 1000 + i * 1000, rule);
      expect(d.ok).toBe(true);
      times = d.times;
    }
    const sixth = decideRateSlot(times, 10000, rule);
    expect(sixth.ok).toBe(false);
    expect(sixth.retryAfterSec).toBe(51); // the first call (t=1s) leaves the window at 61s
    // Sliding: once the first call is a minute old, one more is allowed
    expect(decideRateSlot(times, 61001, rule).ok).toBe(true);
  });

  /** A RATE_GATE binding backed by real RateGate objects with in-memory storage */
  function gateBinding() {
    const objects = new Map();
    return {
      idFromName: (name) => name,
      get: (id) => {
        if (!objects.has(id)) {
          const store = new Map();
          objects.set(id, new RateGate({ storage: { get: async (k) => store.get(k), put: async (k, v) => { store.set(k, v); } } }));
        }
        const obj = objects.get(id);
        return { fetch: (url, init) => obj.fetch(new Request(url, init)) };
      },
    };
  }

  it('refuses the 6th call of the minute with 429 SERVICE_BUSY', async () => {
    const env = { RATE_GATE: gateBinding() };
    for (let i = 0; i < 5; i++) await acquireServiceSlot(env, 'gemini');
    await expect(acquireServiceSlot(env, 'gemini')).rejects.toMatchObject({ statusCode: 429, code: 'SERVICE_BUSY' });
  });

  it('never blocks when the gate is missing or fails', async () => {
    await expect(acquireServiceSlot({}, 'gemini')).resolves.toBeUndefined();
    const broken = { idFromName: () => 'x', get: () => ({ fetch: async () => { throw new Error('down'); } }) };
    await expect(acquireServiceSlot({ RATE_GATE: broken }, 'gemini')).resolves.toBeUndefined();
  });
});
