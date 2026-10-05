/**
 * newsAnalysis.test.js — the analyst's card: its prompt and answer, and when it is written again
 * (new news, the interval, the day's budget) on real SQLite (D1) with a fake model
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildAnalysisPrompt, parseAnalysis, tehranDayStart } from '../../src/domain/news.js';
import { maybeUpdateNewsAnalysis, getNewsAnalysis } from '../../src/services/news/newsAnalysis.service.js';
import { dbInsertNews, dbTopNewsSince } from '../../src/repositories/news.repository.js';
import { resetD1SchemaCache } from '../../src/repositories/d1Schema.js';
import { NEWS_ANALYSIS } from '../../src/config/news.config.js';
import { handleGetNewsToday } from '../../src/handlers/newsRoutes.js';
import { sqliteD1 } from '../helpers/sqliteD1.js';

const NOW = Date.parse('2026-10-05T10:00:00Z'); // 13:30 in Tehran
const ANSWER = JSON.stringify({
  t: 'فشار تورمی و مذاکرات، دلار را در کانال صعودی نگه می‌دارد',
  s: 'با افزایش نرخ بهره و اخبار مذاکرات، بازار ارز در کوتاه‌مدت نوسانی می‌ماند.',
  o: [{ a: 'usd', d: 'up', n: 'انتظارات تورمی' }, { a: 'gold', d: 'sideways', n: 'انس ثابت' }, { a: 'usd', d: 'down', n: 'تکراری' }, { a: 'x', d: 'up' }],
  k: ['نرخ بهره بالا رفت', 'انس طلا رکورد زد'],
  r: 'نتیجه‌ی مذاکرات',
});

describe('the prompt and the answer', () => {
  it('gives the prices and the news in Tehran time, important ones marked', () => {
    const [system, user] = buildAnalysisPrompt(
      [{ title: 'تیتر', summary: 'خلاصه', importance: 3, publishedAt: Date.parse('2026-10-05T06:00:00Z') }],
      [{ name: 'دلار', price: 105000, unit: 'تومان', changePercent: -0.5 }, { name: 'صفر', price: 0 }],
    );
    expect(system.content).toMatch(/analyst/);
    expect(user.content).toContain('دلار: 105,000 تومان (-0.50%)');
    expect(user.content).not.toContain('صفر');
    expect(user.content).toContain('[09:30 !] تیتر — خلاصه');
  });

  it('reads the answer: each asset once, an unknown direction as flat', () => {
    const a = parseAnalysis(`پاسخ:\n${ANSWER}`);
    expect(a.title).toMatch(/^فشار تورمی/);
    expect(a.outlook).toEqual([
      { asset: 'usd', direction: 'up', note: 'انتظارات تورمی' },
      { asset: 'gold', direction: 'flat', note: 'انس ثابت' },
    ]);
    expect(a.points).toHaveLength(2);
    expect(a.risk).toBe('نتیجه‌ی مذاکرات');
    expect(parseAnalysis('{"t":"","s":"x"}')).toBeNull();
    expect(parseAnalysis('nothing')).toBeNull();
  });

  it('the Tehran day starts at 20:30 UTC', () => {
    expect(new Date(tehranDayStart(NOW)).toISOString()).toBe('2026-10-04T20:30:00.000Z');
  });
});

describe('maybeUpdateNewsAnalysis', () => {
  let env;
  const readPrices = async () => [{ name: 'دلار', price: 105000, unit: 'تومان', changePercent: 1 }];
  const item = (id, minutesAgo, importance = 1) => ({
    id: `c/${id}`, channel: 'c', postId: id, url: `https://t.me/c/${id}`, title: `خبر ${id}`, summary: `خلاصه ${id}`,
    text: '', category: 'currency', importance, publishedAt: NOW - minutesAgo * 60000,
  });

  beforeEach(() => {
    resetD1SchemaCache();
    env = { DB: sqliteD1(), AI: { run: vi.fn(async () => ({ response: ANSWER })) } };
  });

  it("waits for the day's first news, then writes it once until more news comes and the interval passes", async () => {
    await dbInsertNews(env, [item(1, 30), item(2, 20)]);
    expect(await maybeUpdateNewsAnalysis(env, { now: NOW, readPrices })).toMatchObject({ updated: false, reason: 'too-few' });

    await dbInsertNews(env, [item(3, 10, 3)]);
    expect(await maybeUpdateNewsAnalysis(env, { now: NOW, readPrices })).toEqual({ updated: true });
    expect(env.AI.run).toHaveBeenCalledTimes(1);
    expect(env.AI.run.mock.calls[0][0]).toBe(NEWS_ANALYSIS.models[0]);
    expect(env.AI.run.mock.calls[0][1].messages[1].content).toContain('دلار: 105,000');
    const saved = await getNewsAnalysis(env);
    expect(saved).toMatchObject({ day: tehranDayStart(NOW), at: NOW, newsCount: 3 });

    // Nothing new: not again
    expect((await maybeUpdateNewsAnalysis(env, { now: NOW + 3600000, readPrices })).reason).toBe('nothing-new');

    // New news, but too soon
    await new Promise((r) => setTimeout(r, 5));
    await dbInsertNews(env, [item(4, 1)]);
    expect((await maybeUpdateNewsAnalysis(env, { now: NOW + 60000, readPrices })).reason).toBe('too-soon');
    expect((await maybeUpdateNewsAnalysis(env, { now: NOW + NEWS_ANALYSIS.minIntervalMinutes * 60000, readPrices })).updated).toBe(true);
    expect(env.AI.run).toHaveBeenCalledTimes(2);
  });

  it('force (admin) writes it whatever the interval; without the model nothing happens', async () => {
    await dbInsertNews(env, [item(1, 30)]);
    expect((await maybeUpdateNewsAnalysis(env, { now: NOW, force: true, readPrices })).updated).toBe(true);
    expect((await maybeUpdateNewsAnalysis({ DB: env.DB }, { now: NOW, force: true, readPrices })).reason).toBe('no-model');
  });

  it('a bad answer keeps the last analysis', async () => {
    await dbInsertNews(env, [item(1, 30)]);
    env.AI.run.mockResolvedValueOnce({ response: 'not json' });
    expect((await maybeUpdateNewsAnalysis(env, { now: NOW, force: true, readPrices })).reason).toBe('bad-answer');
    expect(await getNewsAnalysis(env)).toBeNull();
  });

  it("today's top: most important first", async () => {
    await dbInsertNews(env, [item(1, 30, 1), item(2, 20, 3), item(3, 10, 2)]);
    expect((await dbTopNewsSince(env, tehranDayStart(NOW))).map((n) => n.postId)).toEqual([2, 3, 1]);
  });

  it('GET /api/news/today: the analysis and the top news', async () => {
    const now = Date.now();
    await dbInsertNews(env, [1, 2, 3].map((i) => ({ ...item(i, 0), publishedAt: now - i * 60000 })));
    await maybeUpdateNewsAnalysis(env, { now, force: true, readPrices });
    const body = await (await handleGetNewsToday(new Request('https://x/api/news/today'), env)).json();
    expect(body.top).toHaveLength(3);
    expect(body.analysis.title).toMatch(/^فشار تورمی/);
  });
});
