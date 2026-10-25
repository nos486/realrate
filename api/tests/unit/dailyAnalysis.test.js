/**
 * dailyAnalysis.test.js — the day's AI analysis in the Telegram and Rubika channels every night:
 * posted once, at the first run after 00:00 Tehran, only the day that just ended, only when
 * switched on, in each messenger's format
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sqliteD1 } from '../helpers/sqliteD1.js';
import { resetD1SchemaCache } from '../../src/repositories/d1Schema.js';
import { getStateStore } from '../../src/repositories/stateStore.repository.js';
import { tehranDayStart } from '../../src/domain/news.js';
import { analysisSegments, segmentsToHtml, postTelegramDailyAnalysis } from '../../src/services/bot/dailyAnalysis.service.js';
import { saveBotConfig } from '../../src/services/bot/botConfig.service.js';
import { saveRubikaConfig } from '../../src/services/bot/rubika/rubikaConfig.service.js';
import { runRubikaBot, RUBIKA_FEATURES } from '../../src/services/bot/rubika/rubikaBot.service.js';
import { BOT_FEATURES } from '../../src/services/bot/bot.service.js';

const TG_TOKEN = '123456789:AAFakeTokenFakeTokenFakeTokenFake_12';
const RB_TOKEN = 'BCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123';
/** A Tehran wall-clock time (UTC+3:30) on 2026-10-16 */
const tehran = (hh, mm = 0) => Date.parse(`2026-10-16T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+03:30`);
const YESTERDAY = tehranDayStart(tehran(0)) - 86400000;

const ANALYSIS = {
  title: 'تیتر <تحلیل>',
  summary: 'متن تحلیل',
  drivers: [{ id: 'n1', title: 'خبر یک', url: 'https://t.me/x/1', impact: 3, assets: ['usd'] }],
  points: ['نکته یک'],
  risk: 'نشست فردا',
  day: YESTERDAY,
  at: YESTERDAY + 23 * 3600000,
};

function fakeFetch(ok = { ok: true, result: {} }) {
  const calls = [];
  const fetchFn = vi.fn(async (url, init) => {
    calls.push({ url, params: JSON.parse(init.body) });
    const body = url.includes('rubika') ? { status: 'OK', data: {} } : ok;
    return { status: 200, json: async () => body };
  });
  return { fetchFn, calls };
}

let env;
beforeEach(async () => {
  resetD1SchemaCache();
  env = { DB: sqliteD1() };
  await getStateStore(env).put('news:analysis', JSON.stringify(ANALYSIS));
});

describe('the message', () => {
  it('has the date, the analysis, the news as headlines (no links) and the site', () => {
    const html = segmentsToHtml(analysisSegments(ANALYSIS));
    expect(html).toContain('<b>تیتر &lt;تحلیل&gt;</b>');
    expect(html).toContain('• خبر یک (اثر زیاد)');
    expect(html).toContain('نکته یک');
    expect(html).toContain('نشست فردا');
    expect(html).not.toContain('t.me');
    expect(html).toContain('<a href="https://realrate.geekio.org">');
  });
});

describe('the Telegram channel', () => {
  it('is a bot feature', () => {
    expect(BOT_FEATURES.map((f) => f.id)).toContain('daily-analysis');
    expect(RUBIKA_FEATURES.map((f) => f.id)).toContain('daily-analysis');
  });

  it('posts yesterday\'s analysis once after 00:00 Tehran, only when switched on', async () => {
    const api = fakeFetch();
    await saveBotConfig(env, { enabled: true, token: TG_TOKEN, channel: '@realrate_news' });
    expect(await postTelegramDailyAnalysis(env, { now: tehran(0, 1), fetchFn: api.fetchFn })).toEqual({ sent: 0 }); // off
    await saveBotConfig(env, { dailyAnalysis: true });
    await postTelegramDailyAnalysis(env, { now: tehran(23, 50) - 86400000, fetchFn: api.fetchFn });
    expect(api.calls).toHaveLength(0); // before midnight
    expect(await postTelegramDailyAnalysis(env, { now: tehran(0, 1), fetchFn: api.fetchFn })).toEqual({ sent: 1 });
    await postTelegramDailyAnalysis(env, { now: tehran(0, 2), fetchFn: api.fetchFn });
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0].params.chat_id).toBe('@realrate_news');
    expect(api.calls[0].params.parse_mode).toBe('HTML');
  });

  it('posts nothing late in the day or when the analysis is not of the day that ended', async () => {
    const api = fakeFetch();
    await saveBotConfig(env, { enabled: true, token: TG_TOKEN, channel: '@realrate_news', dailyAnalysis: true });
    await postTelegramDailyAnalysis(env, { now: tehran(12), fetchFn: api.fetchFn });
    await getStateStore(env).put('news:analysis', JSON.stringify({ ...ANALYSIS, day: YESTERDAY - 86400000 }));
    await postTelegramDailyAnalysis(env, { now: tehran(0, 5), fetchFn: api.fetchFn });
    expect(api.calls).toHaveLength(0);
  });

  it('reports a refused post as the run\'s error', async () => {
    const api = fakeFetch({ ok: false, description: 'Forbidden' });
    await saveBotConfig(env, { enabled: true, token: TG_TOKEN, channel: '@realrate_news', dailyAnalysis: true });
    expect(await postTelegramDailyAnalysis(env, { now: tehran(0, 1), fetchFn: api.fetchFn })).toEqual({ sent: 0, error: 'Forbidden' });
  });
});

describe('the Rubika channel', () => {
  it('posts it with Rubika\'s formatting, on its own day key', async () => {
    const api = fakeFetch();
    await saveBotConfig(env, { enabled: true, token: TG_TOKEN, channel: '@realrate_news', dailyAnalysis: true });
    await postTelegramDailyAnalysis(env, { now: tehran(0, 1), fetchFn: api.fetchFn });
    await saveRubikaConfig(env, { enabled: true, token: RB_TOKEN, channel: 'c0AbCdEfGhIjKlMnOpQrStUv', dailyAnalysis: true });
    await runRubikaBot(env, { now: tehran(0, 1), fetchFn: api.fetchFn });
    await runRubikaBot(env, { now: tehran(0, 2), fetchFn: api.fetchFn });
    const posts = api.calls.filter((c) => c.url.includes('rubika') && c.url.endsWith('/sendMessage'));
    expect(posts).toHaveLength(1);
    expect(posts[0].params.text).toContain('متن تحلیل');
    expect(posts[0].params.metadata.meta_data_parts.some((p) => p.type === 'Bold')).toBe(true);
  });
});
