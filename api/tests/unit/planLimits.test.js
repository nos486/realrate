// @vitest-environment happy-dom
/**
 * planLimits.test.js — The free plan's limits: who is limited, what counts, the Shamsi month cut-off
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ existing: new Set(), counts: [], portfolios: [], claims: [], claimOk: true, deleted: [] }));
vi.mock('../../src/repositories/vault.repository.js', () => ({
  dbExistingVaultRecordIds: vi.fn(async () => db.existing),
  dbCountVaultRecords: vi.fn(async (_env, _user, _kinds, opts) => {
    db.counts.push(opts);
    return db.used;
  }),
  dbDeleteVaultRecords: vi.fn(async (_env, _user, _kind, ids) => { db.deleted.push(...ids); }),
  dbClaimPlanCounter: vi.fn(async (_env, _user, counter, period, opts) => { db.claims.push({ counter, period, ...opts }); return db.claimOk; }),
  dbGetPlanCounter: vi.fn(async () => 0),
  dbReleasePlanCounter: vi.fn(async (_env, _user, counter, period, add) => { db.claims.push({ release: add, counter, period }); }),
}));
vi.mock('../../src/repositories/portfolio.repository.js', () => ({
  dbGetUserPortfolios: vi.fn(async () => db.portfolios),
}));

import { enforceRecordLimit, withRecordLimit, enforcePortfolioLimit, shamsiMonthStart, getPlanUsage } from '../../src/lib/planLimits.js';
import { isProUser, planLimitKeyOfKind, PLAN_LIMITS } from '../../src/config/planLimits.js';

const free = () => ({ id: 'u1', role: 'user', groups: [] });
const pro = () => ({ id: 'u2', role: 'user', groups: ['pro'] });

beforeEach(() => {
  db.existing = new Set();
  db.counts = [];
  db.used = 0;
  db.portfolios = [];
  db.claims = [];
  db.claimOk = true;
  db.deleted = [];
});

describe('who is limited', () => {
  it('limits only users outside the Pro group', () => {
    expect(isProUser(free())).toBe(false);
    expect(isProUser(pro())).toBe(true);
    expect(isProUser({ role: 'admin' })).toBe(true);
    expect(isProUser({ kind: 'demo_view' })).toBe(true);
    expect(isProUser(null)).toBe(false);
  });

  it('maps a vault kind to its limit', () => {
    expect(planLimitKeyOfKind('expense')).toBe('entries');
    expect(planLimitKeyOfKind('income')).toBe('entries');
    expect(planLimitKeyOfKind('portfolio_layout')).toBeNull();
  });
});

describe('record limits', () => {
  it('lets a Pro user store anything', async () => {
    db.used = 999;
    await expect(enforceRecordLimit({}, pro(), 'cheque', ['c1'])).resolves.toBeTruthy();
  });

  it('closes a section whose limit is 0', async () => {
    await expect(enforceRecordLimit({}, free(), 'cheque', ['c1'])).rejects.toMatchObject({ statusCode: 403, code: 'PLAN_LIMIT' });
  });

  it('allows records up to the limit and refuses the next', async () => {
    db.used = 1;
    await expect(enforceRecordLimit({}, free(), 'bank_account', ['a2'])).resolves.toBeTruthy();
    db.used = 2;
    await expect(enforceRecordLimit({}, free(), 'bank_account', ['a3'])).rejects.toMatchObject({ code: 'PLAN_LIMIT' });
  });

  it('counts a batch as many records', async () => {
    db.used = 8;
    await expect(enforceRecordLimit({}, free(), 'holding', ['h1', 'h2', 'h3'])).rejects.toMatchObject({ code: 'PLAN_LIMIT' });
    await expect(enforceRecordLimit({}, free(), 'holding', ['h1', 'h2'])).resolves.toBeTruthy();
  });

  it('never counts an edit of an existing record', async () => {
    db.used = 2;
    db.existing = new Set(['a1']);
    await expect(enforceRecordLimit({}, free(), 'bank_account', ['a1'])).resolves.toBeTruthy();
  });

  it('counts expenses and incomes together within the month', async () => {
    db.used = PLAN_LIMITS.entries.monthly;
    db.claimOk = false;
    await expect(enforceRecordLimit({}, free(), 'income', ['i1'], { now: new Date('2026-10-12T09:00:00Z') }))
      .rejects.toMatchObject({ code: 'PLAN_LIMIT' });
    expect(db.counts[0].since).toBe(shamsiMonthStart(new Date('2026-10-12T09:00:00Z')));
  });

  it('does not limit a kind without a limit', async () => {
    await expect(enforceRecordLimit({}, free(), 'category_settings', ['x'])).resolves.toBeTruthy();
    expect(db.counts).toHaveLength(0);
  });
});

describe('bypass attempts', () => {
  it('claims the monthly limit from a counter that deleting does not lower', async () => {
    const now = new Date('2026-10-12T09:00:00Z');
    db.used = 5;
    await enforceRecordLimit({}, free(), 'expense', ['e1', 'e2'], { now });
    expect(db.claims[0]).toMatchObject({ counter: 'entries', period: shamsiMonthStart(now), seed: 5, add: 2, limit: 30 });
  });

  it('gives the monthly claim back when storing fails', async () => {
    await expect(withRecordLimit({}, free(), 'expense', ['e1'], async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(db.claims.at(-1)).toMatchObject({ release: 1, counter: 'entries' });
  });

  it('removes the new records when parallel requests went over a total limit', async () => {
    // Before the store there is room; after it parallel requests have filled it
    db.used = 1;
    const store = vi.fn(async () => { db.used = 3; return 'stored'; });
    await expect(withRecordLimit({}, free(), 'bank_account', ['a2'], store)).rejects.toMatchObject({ code: 'PLAN_LIMIT' });
    expect(db.deleted).toEqual(['a2']);
  });

  it('returns the stored result when within the limit', async () => {
    db.used = 0;
    await expect(withRecordLimit({}, free(), 'bank_account', ['a1'], async () => 'ok')).resolves.toBe('ok');
    expect(db.deleted).toEqual([]);
  });
});

describe('portfolios', () => {
  it('allows one portfolio on the free plan', async () => {
    await expect(enforcePortfolioLimit({}, free())).resolves.toBeUndefined();
    db.portfolios = [{ id: 'p1' }];
    await expect(enforcePortfolioLimit({}, free())).rejects.toMatchObject({ code: 'PLAN_LIMIT' });
    await expect(enforcePortfolioLimit({}, pro())).resolves.toBeUndefined();
  });
});

describe('Shamsi month', () => {
  it('starts at Tehran midnight of the 1st of the Shamsi month', () => {
    // 2026-10-12 is 20 Mehr 1405: the month began on 2026-09-23 (1 Mehr), 00:00 Tehran (+03:30)
    expect(shamsiMonthStart(new Date('2026-10-12T09:00:00Z'))).toBe('2026-09-22T20:30:00.000Z');
    // Just after Tehran midnight on the 1st it is already the new month
    expect(shamsiMonthStart(new Date('2026-09-22T20:31:00Z'))).toBe('2026-09-22T20:30:00.000Z');
    // Just before, still the previous month (Shahrivar began 2026-08-23)
    expect(shamsiMonthStart(new Date('2026-09-22T20:29:00Z'))).toBe('2026-08-22T20:30:00.000Z');
  });
});

describe('usage report', () => {
  it('is empty for Pro and lists every limit for a free user', async () => {
    expect(await getPlanUsage({}, pro())).toEqual({ pro: true, usage: {} });
    db.used = 3;
    const { pro: isPro, usage } = await getPlanUsage({}, free());
    expect(isPro).toBe(false);
    expect(usage.entries).toEqual({ used: 3, limit: 30, period: 'month' });
    expect(usage.cheques).toEqual({ used: 3, limit: 0, period: 'total' });
    expect(usage.portfolios).toEqual({ used: 0, limit: 1, period: 'total' });
  });
});

describe('free-plan SMS reads (on the phone)', () => {
  it('allows 3 a day and 30 a month, and nothing is limited on Pro', async () => {
    const { takeSmsRead, setSmsPlanPro, smsFreeUsage } = await import('../../../web/src/shared/native/smsPlan.js');
    localStorage.clear();
    setSmsPlanPro(false);
    const day1 = new Date('2026-10-12T09:00:00Z');
    expect([1, 2, 3, 4].map(() => takeSmsRead(day1))).toEqual([true, true, true, false]);
    expect(smsFreeUsage(day1)).toEqual({ daily: 3, monthly: 3 });
    // The next Tehran day starts over the daily count, the month keeps counting
    const day2 = new Date('2026-10-13T09:00:00Z');
    expect(takeSmsRead(day2)).toBe(true);
    expect(smsFreeUsage(day2)).toEqual({ daily: 1, monthly: 4 });
    setSmsPlanPro(true);
    expect(takeSmsRead(day1)).toBe(true);
  });
});
