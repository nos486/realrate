/**
 * dollarOutlook.test.js — the dollar outlook experiment (admin only): the prompt and answer, the
 * scoring against the real close and a flat guess, and the daily record on real SQLite (D1) with a
 * fake model and a fake dollar history
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const auth = vi.hoisted(() => ({ user: { id: 'a1', role: 'admin' } }));
vi.mock('../../src/lib/auth.js', () => ({ getAuthenticatedUser: vi.fn(async () => auth.user) }));
const history = vi.hoisted(() => ({ value: null }));
vi.mock('../../src/repositories/priceHistoryStore.repository.js', () => ({ getItemHistory: vi.fn(async () => history.value) }));

import { buildOutlookPrompt, parseOutlook, scoreOutlook, summarizeOutlooks, moveLabel } from '../../src/domain/dollarOutlook.js';
import { maybeRecordDollarOutlook, getDollarOutlooks } from '../../src/services/outlook/dollarOutlook.service.js';
import { handleAdminGetOutlook, handleAdminRunOutlook } from '../../src/handlers/outlookRoutes.js';
import { dbInsertNews } from '../../src/repositories/news.repository.js';
import { resetD1SchemaCache } from '../../src/repositories/d1Schema.js';
import { DOLLAR_OUTLOOK } from '../../src/config/dollarOutlook.config.js';
import { sqliteD1 } from '../helpers/sqliteD1.js';

const NOW = Date.parse('2026-10-05T18:00:00Z'); // 21:30 in Tehran
const ANSWER = JSON.stringify({ u: 50, f: 30, d: 20, lo: 1_000_000, hi: 1_080_000, r: 'نرخ بهره بالا رفته و روند اخیر صعودی است.' });

describe('the answer', () => {
  it('reads probabilities (made to add up to 100) and the range', () => {
    expect(parseOutlook(ANSWER, 1_040_000)).toEqual({ up: 50, flat: 30, down: 20, low: 1_000_000, high: 1_080_000, reason: 'نرخ بهره بالا رفته و روند اخیر صعودی است.' });
    const odd = parseOutlook(JSON.stringify({ u: 2, f: 1, d: 1, lo: 1, hi: 2, r: 'دلیل' }).replace('"lo":1,"hi":2', '"lo":1000100,"hi":1000200'), 1_000_000);
    expect(odd.up + odd.flat + odd.down).toBe(100);
  });

  it('rejects broken JSON, a range far from the price, a reversed range and Latin words', () => {
    expect(parseOutlook('nope', 1e6)).toBeNull();
    expect(parseOutlook(JSON.stringify({ u: 1, f: 1, d: 1, lo: 5, hi: 6, r: 'دلیل' }), 1e6)).toBeNull();
    expect(parseOutlook(JSON.stringify({ u: 1, f: 1, d: 1, lo: 1_100_000, hi: 1_000_000, r: 'دلیل' }), 1e6)).toBeNull();
    expect(parseOutlook(JSON.stringify({ u: 1, f: 1, d: 1, lo: 1e6, hi: 1.1e6, r: 'because of the fed' }), 1e6)).toBeNull();
  });

  it('asks for scenarios from the closes and the numbered news only', () => {
    const [system, user] = buildOutlookPrompt(
      [{ day: '2026-10-04', close: 1_000_000.4 }],
      [{ title: 'خبر', summary: 'خلاصه', publishedAt: NOW, importance: 3 }],
      { horizonDays: 7, flatBandPct: 1, summaryChars: 100, tehranClock: () => '21:30' },
    );
    expect(system.content).toMatch(/SCENARIOS/);
    expect(system.content).not.toMatch(/HORIZON|BAND/);
    expect(user.content).toContain('2026-10-04 1000000');
    expect(user.content).toContain('N1 [21:30 !] خبر');
  });
});

describe('scoring', () => {
  const rec = { base: 1_000_000, up: 60, flat: 30, down: 10, low: 1_010_000, high: 1_050_000 };

  it('labels a move against the flat band', () => {
    expect(moveLabel(100, 102, 1)).toBe('up');
    expect(moveLabel(100, 99.5, 1)).toBe('flat');
    expect(moveLabel(100, 97, 1)).toBe('down');
  });

  it('scores a right call, a miss, and a flat guess', () => {
    const hit = scoreOutlook(rec, 1_030_000, 1);
    expect(hit).toMatchObject({ label: 'up', hit: true, inRange: true, baselineHit: false, baselineBrier: 2 });
    expect(hit.brier).toBeCloseTo(0.16 + 0.09 + 0.01);
    const miss = scoreOutlook(rec, 950_000, 1);
    expect(miss).toMatchObject({ label: 'down', hit: false, inRange: false });
    expect(scoreOutlook(rec, 1_002_000, 1)).toMatchObject({ label: 'flat', baselineHit: true, baselineBrier: 0 });
  });

  it('totals the model against the flat guess', () => {
    expect(summarizeOutlooks([])).toEqual({ n: 0 });
    const s = summarizeOutlooks([scoreOutlook(rec, 1_030_000, 1), scoreOutlook(rec, 1_002_000, 1)]);
    expect(s).toMatchObject({ n: 2, hitRate: 50, baselineHitRate: 50, inRangeRate: 50 });
  });
});

describe('the daily record', () => {
  let env;
  const NEWS = (n, minutesAgo) => ({
    id: `c/${n}`, channel: 'c', postId: n, title: `خبر ${n}`, summary: 'خلاصه', importance: 2, category: 'currency',
    url: `https://t.me/c/${n}`, publishedAt: NOW - minutesAgo * 60000, savedAt: NOW - minutesAgo * 60000,
  });

  beforeEach(async () => {
    resetD1SchemaCache();
    auth.user = { id: 'a1', role: 'admin' };
    env = { DB: sqliteD1(), AI: { run: vi.fn(async () => ({ response: ANSWER })) } };
    history.value = { since: '2026-09-01', values: Array.from({ length: 35 }, (_, i) => 1_000_000 + i * 1000) }; // through 2026-10-05
    await dbInsertNews(env, [NEWS(1, 600), NEWS(2, 60)]);
  });

  it('records once a day, late in the Tehran day', async () => {
    expect(await maybeRecordDollarOutlook(env, { now: Date.parse('2026-10-05T06:00:00Z') })).toMatchObject({ recorded: false, reason: 'too-early' });
    const first = await maybeRecordDollarOutlook(env, { now: NOW });
    expect(first.recorded).toBe(true);
    expect(first.record).toMatchObject({ day: '2026-10-05', horizon: '2026-10-12', base: 1_034_000, up: 50, newsCount: 2 });
    const [model, request] = env.AI.run.mock.calls[0];
    expect(model).toBe(DOLLAR_OUTLOOK.model.id);
    expect(request.messages[1].content).toContain('2026-10-05 1034000');
    expect(await maybeRecordDollarOutlook(env, { now: NOW + 600000 })).toMatchObject({ recorded: false, reason: 'done' });
    expect(env.AI.run).toHaveBeenCalledTimes(1);
  });

  it('keeps the failure for the page and records nothing', async () => {
    env.AI.run = vi.fn(async () => ({ response: 'not json' }));
    expect(await maybeRecordDollarOutlook(env, { now: NOW })).toMatchObject({ recorded: false, reason: 'model-error' });
    const view = await getDollarOutlooks(env, { now: NOW });
    expect(view.records).toEqual([]);
    expect(view.status).toMatchObject({ ok: false, error: 'bad-answer' });
  });

  it('skips without history or without news', async () => {
    history.value = { since: '2026-10-01', values: [1, 2, 3] };
    expect((await maybeRecordDollarOutlook(env, { now: NOW, force: true })).reason).toBe('no-history');
  });

  it('scores a scenario once its horizon day has a close', async () => {
    await maybeRecordDollarOutlook(env, { now: NOW });
    const later = Date.parse('2026-10-13T08:00:00Z');
    history.value = { since: '2026-09-01', values: Array.from({ length: 43 }, (_, i) => 1_000_000 + i * 1000) }; // through 2026-10-13
    const view = await getDollarOutlooks(env, { now: later });
    expect(view.records).toHaveLength(1);
    // 2026-10-12 is index 41: 1,041,000 against 1,034,000 = +0.7%, inside the flat band
    expect(view.records[0].score).toMatchObject({ close: 1_041_000, label: 'flat', inRange: true });
    expect(view.summary.n).toBe(1);
    // Before the horizon: no score yet
    expect((await getDollarOutlooks(env, { now: NOW })).records[0].score).toBeUndefined();
  });

  it('is for admins only', async () => {
    auth.user = { id: 'u1', role: 'user' };
    const req = new Request('https://x/api/admin/outlook');
    await expect(handleAdminGetOutlook(req, env)).rejects.toMatchObject({ statusCode: 403 });
    await expect(handleAdminRunOutlook(req, env)).rejects.toMatchObject({ statusCode: 403 });
    auth.user = { id: 'a1', role: 'admin' };
    const res = await handleAdminGetOutlook(req, env);
    expect((await res.json()).success).toBe(true);
  });
});
