/**
 * telegramBot.test.js — the Telegram bot: its settings (the token never leaves), the channel name,
 * the message, queuing the feeds' articles once and posting them within the rate limit, and the
 * admin's connection check — on real SQLite (D1) with a fake Bot API
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sqliteD1 } from '../helpers/sqliteD1.js';
import { resetD1SchemaCache } from '../../src/repositories/d1Schema.js';
import { BOT_LIMITS } from '../../src/config/telegramBot.config.js';
import { normalizeChannel, getBotConfig, publicBotConfig, saveBotConfig, getBotStatus } from '../../src/services/bot/botConfig.service.js';
import { enqueueFeedNews, flushNewsQueue, formatNewsMessage } from '../../src/services/bot/newsChannel.service.js';
import { runBot } from '../../src/services/bot/bot.service.js';
import { callBotApi, isBotToken } from '../../src/services/bot/telegramApi.js';
import { handleAdminTestBot } from '../../src/handlers/botRoutes.js';

let adminUser = { role: 'admin' };
vi.mock('../../src/lib/auth.js', () => ({ getAuthenticatedUser: async () => adminUser }));

const TOKEN = '123456789:AAFakeTokenFakeTokenFakeTokenFake_12';
const NOW = Date.parse('2026-10-15T12:00:00Z');
/** A news item as the pipeline publishes it: Persian headline and summary, the original link */
const article = (n, extra = {}) => ({
  source: 'world',
  channel: 'bbc',
  channelTitle: 'BBC',
  postId: n,
  url: `https://example.com/a/${n}?utm=1`,
  title: `تیتر ${n}`,
  summary: `خلاصه ${n}`,
  publishedAt: NOW - (100 - n) * 1000,
  ...extra,
});

/** A fake Bot API: records the calls, answers by method */
function fakeApi(answers = {}) {
  const calls = [];
  const fetchFn = vi.fn(async (url, init) => {
    const method = url.split('/').pop();
    const params = JSON.parse(init.body);
    calls.push({ method, params });
    const answer = typeof answers[method] === 'function' ? answers[method](params, calls) : answers[method] ?? { ok: true, result: {} };
    return { status: answer.ok ? 200 : 400, json: async () => answer };
  });
  return { fetchFn, calls };
}

let env;
beforeEach(() => {
  adminUser = { role: 'admin' };
  resetD1SchemaCache();
  env = { DB: sqliteD1() };
});

describe('settings', () => {
  it('normalizes a channel from @name, a t.me link or a numeric id', () => {
    expect(normalizeChannel('@realrate_news')).toBe('@realrate_news');
    expect(normalizeChannel('https://t.me/realrate_news')).toBe('@realrate_news');
    expect(normalizeChannel('-1001234567890')).toBe('-1001234567890');
    expect(normalizeChannel('a b')).toBe('');
    expect(normalizeChannel('')).toBe('');
  });

  it('keeps the token out of what the admin reads, and checks its shape', async () => {
    await expect(saveBotConfig(env, { token: 'nope' })).rejects.toThrow();
    const saved = await saveBotConfig(env, { token: TOKEN, channel: 't.me/realrate_news', enabled: true });
    expect(saved).toMatchObject({ enabled: true, channel: '@realrate_news', tokenSource: 'admin' });
    const view = publicBotConfig(saved);
    expect(view.tokenSet).toBe(true);
    expect(JSON.stringify(view)).not.toContain(TOKEN);
  });

  it('refuses to switch on without a token and a channel', async () => {
    await expect(saveBotConfig(env, { enabled: true })).rejects.toThrow();
    await expect(saveBotConfig(env, { token: TOKEN, enabled: true })).rejects.toThrow();
  });

  it('prefers the TELEGRAM_BOT_TOKEN secret, and a change keeps the other fields', async () => {
    await saveBotConfig(env, { token: TOKEN, channel: '@realrate_news' });
    const withSecret = { ...env, TELEGRAM_BOT_TOKEN: '999999:SecretSecretSecretSecretSecretSecret' };
    expect((await getBotConfig(withSecret)).tokenSource).toBe('env');
    await saveBotConfig(env, { feeds: ['bbc'] });
    expect(await getBotConfig(env)).toMatchObject({ channel: '@realrate_news', token: TOKEN, feeds: ['bbc'] });
    await saveBotConfig(env, { token: null });
    expect((await getBotConfig(env)).token).toBe('');
  });
});

describe('the message', () => {
  it('is a bold headline, a short escaped summary and the source linking to the article', () => {
    const html = formatNewsMessage({ title: 'A <b> & B', summary: 'x'.repeat(400), url: 'https://e.com/a?x=1&y=2', sourceTitle: 'BBC' });
    expect(html).toContain('<b>A &lt;b&gt; &amp; B</b>');
    expect(html).toContain('<a href="https://e.com/a?x=1&amp;y=2">منبع: BBC</a>');
    expect(html.split('\n\n')[1].length).toBeLessThanOrEqual(BOT_LIMITS.summaryChars + 1);
  });
});

describe('queuing and posting', () => {
  const turnOn = (patch = {}) => saveBotConfig(env, { token: TOKEN, channel: '@realrate_news', enabled: true, ...patch });

  it('queues nothing while the bot is off', async () => {
    expect(await enqueueFeedNews(env, [article(1)], NOW)).toBe(0);
  });

  it('posts an article once, even when its feed shows it again or another feed has the same link', async () => {
    await turnOn();
    const { fetchFn, calls } = fakeApi();
    expect(await enqueueFeedNews(env, [article(1), article(2, { channel: 'cnbc', url: 'https://example.com/a/1' })], NOW)).toBe(1);
    expect(await flushNewsQueue(env, { now: NOW, fetchFn })).toMatchObject({ sent: 1, waiting: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0].params).toMatchObject({ chat_id: '@realrate_news', parse_mode: 'HTML' });
    // The article's own preview, a small picture above the Persian text
    expect(calls[0].params.link_preview_options).toEqual({ url: 'https://example.com/a/1?utm=1', prefer_small_media: true, show_above_text: true });
    expect(calls[0].params.text).toContain('تیتر 1');
    expect(calls[0].params.text).toContain('خلاصه 1');
    // The same article again, later
    expect(await enqueueFeedNews(env, [article(1)], NOW + 60000)).toBe(0);
  });

  it('queues only international items (a Telegram channel post is not)', async () => {
    await turnOn();
    expect(await enqueueFeedNews(env, [article(1, { source: 'telegram' })], NOW)).toBe(0);
  });

  it('only the chosen feeds are queued', async () => {
    await turnOn({ feeds: ['cnbc'] });
    expect(await enqueueFeedNews(env, [article(1), article(2, { channel: 'cnbc', url: 'https://example.com/other' })], NOW)).toBe(1);
  });

  it('sends a few per run, oldest first, and the rest the next run', async () => {
    await turnOn();
    const { fetchFn, calls } = fakeApi();
    await enqueueFeedNews(env, Array.from({ length: 11 }, (_, i) => article(i + 1)), NOW);
    const first = await flushNewsQueue(env, { now: NOW, fetchFn });
    expect(first).toMatchObject({ sent: BOT_LIMITS.sendPerRun, waiting: 3 });
    expect(calls[0].params.text).toContain('تیتر 1');
    expect(await flushNewsQueue(env, { now: NOW + 60000, fetchFn })).toMatchObject({ sent: 3, waiting: 0 });
  });

  it('keeps the queue when Telegram refuses, and drops an article it keeps refusing', async () => {
    await turnOn();
    const bad = fakeApi({ sendMessage: () => ({ ok: false, description: 'chat not found' }) });
    await enqueueFeedNews(env, [article(1)], NOW);
    for (let i = 1; i < BOT_LIMITS.maxTries; i++) {
      expect(await flushNewsQueue(env, { now: NOW + i, fetchFn: bad.fetchFn })).toMatchObject({ sent: 0, waiting: 1, error: 'chat not found' });
    }
    expect(await flushNewsQueue(env, { now: NOW + 99, fetchFn: bad.fetchFn })).toMatchObject({ sent: 0, waiting: 0 });
  });

  it('stops on a rate limit without counting a try', async () => {
    await turnOn();
    const limited = fakeApi({ sendMessage: () => ({ ok: false, description: 'Too Many Requests', parameters: { retry_after: 5 } }) });
    await enqueueFeedNews(env, [article(1), article(2)], NOW);
    await flushNewsQueue(env, { now: NOW, fetchFn: limited.fetchFn });
    expect(limited.calls).toHaveLength(1);
  });

  it('drops an article that waited past the queue window', async () => {
    await turnOn();
    const { fetchFn, calls } = fakeApi();
    await enqueueFeedNews(env, [article(1)], NOW);
    expect(await flushNewsQueue(env, { now: NOW + (BOT_LIMITS.queueMaxHours + 1) * 3600_000, fetchFn })).toMatchObject({ sent: 0 });
    expect(calls).toHaveLength(0);
  });

  it('runBot posts, records the status, and does nothing while off', async () => {
    const { fetchFn } = fakeApi();
    expect(await runBot(env, { now: NOW, fetchFn })).toMatchObject({ skipped: true });
    await turnOn();
    await enqueueFeedNews(env, [article(1), article(2)], NOW);
    expect(await runBot(env, { now: NOW, fetchFn })).toMatchObject({ sent: 2 });
    expect(await getBotStatus(env)).toMatchObject({ lastSentAt: NOW, sentTotal: 2, error: '' });
  });
});

describe('the Bot API client', () => {
  it('never lets the token into an error', async () => {
    const fetchFn = async () => { throw new Error(`failed for /bot${TOKEN}/sendMessage`); };
    const res = await callBotApi(TOKEN, 'sendMessage', {}, { fetchFn });
    expect(res.ok).toBe(false);
    expect(res.error).not.toContain(TOKEN);
  });

  it('recognizes a token', () => {
    expect(isBotToken(TOKEN)).toBe(true);
    expect(isBotToken('abc')).toBe(false);
  });
});

describe('the admin check', () => {
  const request = new Request('https://x.test/api/admin/bot/test', { method: 'POST' });
  const check = async (answers) => {
    await saveBotConfig(env, { token: TOKEN, channel: '@realrate_robot' });
    const res = await handleAdminTestBot(request, env, { fetchFn: fakeApi(answers).fetchFn });
    return res.json();
  };

  it('refuses a non-admin', async () => {
    adminUser = { role: 'user' };
    await expect(handleAdminTestBot(request, env)).rejects.toThrow();
  });

  it('says when the name is a bot, not a channel', async () => {
    const body = await check({
      getMe: { ok: true, result: { username: 'realrate_robot' } },
      getChat: { ok: true, result: { type: 'private' } },
    });
    expect(body).toMatchObject({ ok: false, step: 'channel', bot: { username: 'realrate_robot' } });
  });

  it('posts a test message when the channel is right', async () => {
    const body = await check({
      getMe: { ok: true, result: { username: 'realrate_bot' } },
      getChat: { ok: true, result: { type: 'channel', title: 'RealRate News' } },
    });
    expect(body).toMatchObject({ ok: true, chat: { title: 'RealRate News' } });
  });

  it('reports a token Telegram rejects, without the token', async () => {
    const body = await check({ getMe: { ok: false, description: 'Unauthorized' } });
    expect(body).toMatchObject({ ok: false, step: 'token' });
    expect(JSON.stringify(body)).not.toContain(TOKEN);
  });
});
