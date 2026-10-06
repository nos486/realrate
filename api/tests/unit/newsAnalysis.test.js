/**
 * newsAnalysis.test.js — the analyst's card: its prompt (the day's numbered news only; no
 * forecast of any market) and answer (the analysis, the day's drivers), when it is written again
 * (new news, the interval, the day's budget), one model only — on real
 * SQLite (D1) with a fake model
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildAnalysisPrompt, parseAnalysis, tehranDayStart } from '../../src/domain/news.js';
import {
  maybeUpdateNewsAnalysis,
  getNewsAnalysis,
  getNewsAnalysisStatus,
} from '../../src/services/news/newsAnalysis.service.js';
import { answerOf } from '../../src/services/news/workersAi.js';
import { dbInsertNews, dbTopNewsSince } from '../../src/repositories/news.repository.js';
import { resetD1SchemaCache } from '../../src/repositories/d1Schema.js';
import { NEWS_ANALYSIS } from '../../src/config/news.config.js';
import { handleGetNewsToday } from '../../src/handlers/newsRoutes.js';
import { sqliteD1 } from '../helpers/sqliteD1.js';

const NOW = Date.parse('2026-10-05T10:00:00Z'); // 13:30 in Tehran
const ANSWER = JSON.stringify({
  t: 'فشار تورمی و مذاکرات، دلار را در کانال صعودی نگه می‌دارد',
  s: 'با افزایش نرخ بهره و اخبار مذاکرات، بازار ارز در کوتاه‌مدت نوسانی می‌ماند.',
  n: [{ i: 1, w: 3, a: ['usd', 'x'] }, { i: 'N1', w: 1 }, { i: 99, w: 2 }],
  k: ['نرخ بهره بالا رفت', 'انس طلا رکورد زد'],
  r: 'نتیجه‌ی مذاکرات',
});
const DEFAULT = NEWS_ANALYSIS.model.id;

describe('the prompt and the answer', () => {
  const news = [{ id: 'c/1', title: 'تیتر', summary: 'خلاصه', importance: 3, category: 'currency', url: 'https://t.me/c/1', publishedAt: Date.parse('2026-10-05T06:00:00Z') }];

  it('numbers the news in Tehran time, and asks for an explanation of it, not a forecast', () => {
    const [system, user] = buildAnalysisPrompt(news);
    expect(system.content).toMatch(/EXPLAIN THE NEWS, NOT TO FORECAST/);
    expect(system.content).toMatch(/never give a direction, a prediction, a price/);
    // A strong item may be said to raise a likelihood, in the text
    expect(system.content).toMatch(/clearly makes a move in a market more likely/);
    expect(system.content).not.toMatch(/"o":|STABILITY|PREVIOUS OUTLOOK/);
    expect(user.content).toBe("TODAY'S NEWS (Tehran time, oldest first):\nN1 [09:30 currency !] تیتر — خلاصه");
  });

  it('reads the answer: the analysis and the drivers; an old answer\'s directions are dropped', () => {
    const a = parseAnalysis(`پاسخ:\n${JSON.stringify({ ...JSON.parse(ANSWER), o: [{ a: 'usd', d: 'up', c: 3 }] })}`, news);
    expect(a.title).toMatch(/^فشار تورمی/);
    expect(a).not.toHaveProperty('outlook');
    expect(a.drivers).toEqual([{ id: 'c/1', title: 'تیتر', url: 'https://t.me/c/1', impact: 3, assets: ['usd'] }]);
    expect(a.points).toHaveLength(2);
    expect(a.risk).toBe('نتیجه‌ی مذاکرات');
    expect(parseAnalysis('{"t":"","s":"x"}')).toBeNull();
    expect(parseAnalysis('nothing')).toBeNull();
    // Words of another language: not usable
    expect(parseAnalysis(JSON.stringify({ ...JSON.parse(ANSWER), k: ['رشد 小幅 قیمت'] }))).toBeNull();
    expect(parseAnalysis(JSON.stringify({ ...JSON.parse(ANSWER), r: 'ریسک slightly بالا' }))).toBeNull();
    expect(parseAnalysis(JSON.stringify({ ...JSON.parse(ANSWER), r: 'تصمیم Fed و OPEC' }))).not.toBeNull();
  });

  it('a completion with no text says why', () => {
    expect(() => answerOf({ choices: [{ message: { content: null, reasoning_content: '…' }, finish_reason: 'length' }] }))
      .toThrow(/token limit ran out during the model's reasoning/);
    expect(() => answerOf({ choices: [{ message: { content: '' }, finish_reason: 'stop' }] })).toThrow(/finish_reason: stop/);
  });

  it("reads every reply shape Workers AI gives", () => {
    expect(answerOf({ response: 'a' })).toBe('a');
    expect(answerOf({ choices: [{ message: { content: 'b' } }] })).toBe('b');
  });

  it('the Tehran day starts at 20:30 UTC', () => {
    expect(new Date(tehranDayStart(NOW)).toISOString()).toBe('2026-10-04T20:30:00.000Z');
  });
});

describe('maybeUpdateNewsAnalysis', () => {
  let env;
  const opts = (extra) => ({ ...extra });
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
    expect(await maybeUpdateNewsAnalysis(env, opts({ now: NOW }))).toMatchObject({ updated: false, reason: 'too-few' });

    await dbInsertNews(env, [item(3, 10, 3)]);
    expect(await maybeUpdateNewsAnalysis(env, opts({ now: NOW }))).toEqual({ updated: true });
    expect(env.AI.run).toHaveBeenCalledTimes(1);
    const [model, request] = env.AI.run.mock.calls[0];
    expect(model).toBe(DEFAULT);
    expect(request).toMatchObject({ temperature: 0, reasoning_effort: 'low', response_format: { type: 'json_object' } });
    // The day's news only: no prices, trends or earlier outlook
    expect(request.messages[1].content).toMatch(/^TODAY'S NEWS/);
    expect(request.messages[1].content).toContain('N3 [');
    const saved = await getNewsAnalysis(env);
    expect(saved).toMatchObject({ day: tehranDayStart(NOW), at: NOW, newsCount: 3, model: DEFAULT });

    // Nothing new: not again
    expect((await maybeUpdateNewsAnalysis(env, opts({ now: NOW + 3600000 }))).reason).toBe('nothing-new');

    // New news, but too soon
    await new Promise((r) => setTimeout(r, 5));
    await dbInsertNews(env, [item(4, 1)]);
    expect((await maybeUpdateNewsAnalysis(env, opts({ now: NOW + 60000 }))).reason).toBe('too-soon');
    expect((await maybeUpdateNewsAnalysis(env, opts({ now: NOW + NEWS_ANALYSIS.minIntervalMinutes * 60000 }))).updated).toBe(true);
    expect(env.AI.run).toHaveBeenCalledTimes(2);
    expect(env.AI.run.mock.calls[1][1].messages[1].content).toMatch(/N4 \[[\d:]+ currency\] خبر 4/);
  });

  it('force (admin) writes it whatever the interval; without the model nothing happens', async () => {
    await dbInsertNews(env, [item(1, 30)]);
    expect((await maybeUpdateNewsAnalysis(env, opts({ now: NOW, force: true }))).updated).toBe(true);
    expect((await maybeUpdateNewsAnalysis({ DB: env.DB }, opts({ now: NOW, force: true }))).reason).toBe('no-model');
  });

  it('the model fails or answers unusably: no other model, the last analysis stays, the panel is told', async () => {
    await dbInsertNews(env, [item(1, 30)]);
    expect((await maybeUpdateNewsAnalysis(env, opts({ now: NOW, force: true }))).updated).toBe(true);
    expect(await getNewsAnalysisStatus(env)).toEqual({ at: NOW, model: DEFAULT, ok: true });
    env.AI.run.mockClear();

    env.AI.run.mockResolvedValueOnce({ response: 'not json' });
    expect(await maybeUpdateNewsAnalysis(env, opts({ now: NOW + 1, force: true }))).toEqual({ updated: false, reason: 'model-error', error: 'bad-answer' });
    expect(env.AI.run).toHaveBeenCalledTimes(1);
    expect(await getNewsAnalysisStatus(env)).toEqual({ at: NOW + 1, model: DEFAULT, ok: false, error: 'bad-answer' });

    const foreign = JSON.stringify({ ...JSON.parse(ANSWER), s: 'قیمت دلار با افزایش nhẹ همراه بود.' });
    env.AI.run.mockResolvedValueOnce({ choices: [{ message: { content: foreign } }] });
    expect((await maybeUpdateNewsAnalysis(env, opts({ now: NOW + 2, force: true }))).error).toBe('foreign-text');

    env.AI.run.mockRejectedValueOnce(new Error('3040: capacity'));
    expect((await maybeUpdateNewsAnalysis(env, opts({ now: NOW + 3, force: true }))).error).toBe('3040: capacity');
    expect(env.AI.run).toHaveBeenCalledTimes(3);
    expect(await getNewsAnalysisStatus(env)).toMatchObject({ ok: false, error: '3040: capacity' });
    // The last good analysis is still there
    expect(await getNewsAnalysis(env)).toMatchObject({ at: NOW, title: expect.stringMatching(/^فشار/) });
  });

  it("today's top: most important first", async () => {
    await dbInsertNews(env, [item(1, 30, 1), item(2, 20, 3), item(3, 10, 2)]);
    expect((await dbTopNewsSince(env, tehranDayStart(NOW))).map((n) => n.postId)).toEqual([2, 3, 1]);
  });

  it('GET /api/news/today: the analysis and the top news', async () => {
    const now = Date.now();
    await dbInsertNews(env, [1, 2, 3].map((i) => ({ ...item(i, 0), publishedAt: now - i * 60000 })));
    await maybeUpdateNewsAnalysis(env, opts({ now, force: true }));
    const body = await (await handleGetNewsToday(new Request('https://x/api/news/today'), env)).json();
    expect(body.top).toHaveLength(3);
    expect(body.analysis.title).toMatch(/^فشار تورمی/);
  });
});
