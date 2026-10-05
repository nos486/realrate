/**
 * news.test.js — the news section: a channel page's posts, the keyword filter, repeats, the model's
 * prompt and answer, and a whole run on real SQLite (D1) with a fake channel and a fake model
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parseTelegramPosts,
  postHtmlToText,
  keywordScore,
  isNewsCandidate,
  guessCategory,
  similarity,
  buildNewsPrompt,
  parseNewsVerdicts,
  fallbackNewsItem,
  normalizeChannel,
} from '../../src/domain/news.js';
import { runNewsPolling, saveNewsChannels, getNewsChannels, getNewsStatus } from '../../src/services/news/news.service.js';
import { dbListNews, dbSetNewsHidden, dbPurgeOldNews } from '../../src/repositories/news.repository.js';
import { resetD1SchemaCache } from '../../src/repositories/d1Schema.js';
import { DEFAULT_NEWS_CHANNELS, NEWS_LIMITS, NEWS_AI_MODELS } from '../../src/config/news.config.js';
import { sqliteD1 } from '../helpers/sqliteD1.js';

const post = (channel, id, text, time = '2026-10-05T08:00:00+00:00', extra = '') => `
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="${channel}/${id}" data-view="x">
  ${extra}
  <div class="tgme_widget_message_text js-message_text" dir="auto">${text}</div>
  <div class="tgme_widget_message_footer"><a class="tgme_widget_message_date" href="https://t.me/${channel}/${id}"><time datetime="${time}" class="time">11:30</time></a></div>
</div></div>`;

const page = (channel, posts, title = 'خبر فوری') =>
  `<html><head><meta property="og:title" content="${title}"></head><body>${posts.join('\n')}</body></html>`;

describe('parseTelegramPosts', () => {
  it('reads every post with its id, link, time, text and photo, oldest first', () => {
    const html = page('Khabari', [
      post('Khabari', 12, 'دوم<br/>خط دوم', '2026-10-05T09:00:00+00:00'),
      post('Khabari', 11, 'اولی &amp; <b>مهم</b>', '2026-10-05T08:00:00+00:00',
        `<a class="tgme_widget_message_photo_wrap" style="width:100px;background-image:url('https://cdn4.telesco.pe/file/a.jpg')"></a>`),
    ]);
    const { title, posts } = parseTelegramPosts(html);
    expect(title).toBe('خبر فوری');
    expect(posts.map((p) => p.postId)).toEqual([11, 12]);
    expect(posts[0]).toMatchObject({
      channel: 'khabari',
      url: 'https://t.me/Khabari/11',
      text: 'اولی & مهم',
      image: 'https://cdn4.telesco.pe/file/a.jpg',
      publishedAt: Date.parse('2026-10-05T08:00:00Z'),
    });
    expect(posts[1].text).toBe('دوم\nخط دوم');
  });

  it('skips a post without text (a bare photo or sticker)', () => {
    const html = page('x', ['<div class="tgme_widget_message_wrap"><div data-post="chan/5"></div></div>']);
    expect(parseTelegramPosts(html).posts).toEqual([]);
  });

  it("reads the post's own text, not the quote of the post it replies to", () => {
    const reply = '<a class="tgme_widget_message_reply"><div class="tgme_widget_message_text js-message_reply_text">نقل‌قول</div></a>';
    const { posts } = parseTelegramPosts(page('chan', [post('chan', 3, 'متن اصلی', undefined, reply)]));
    expect(posts[0].text).toBe('متن اصلی');
  });
});

describe('postHtmlToText', () => {
  it("drops the channel's signature lines at the end", () => {
    expect(postHtmlToText('دلار گران شد<br/><br/>🆔 @khabari<br/>🔻🔻')).toBe('دلار گران شد');
    expect(postHtmlToText('خبر<br/><a href="https://t.me/x">t.me/eghtesadonline</a>')).toBe('خبر');
  });
});

describe('keywords', () => {
  it('passes market news and drops the rest', () => {
    expect(isNewsCandidate('قیمت دلار در بازار آزاد از ۹۰ هزار تومان گذشت')).toBe(true);
    expect(isNewsCandidate('بانک مركزي نرخ بهره را افزايش داد')).toBe(true); // Arabic ی and ک
    expect(isNewsCandidate('اونس طلا رکورد زد')).toBe(true);
    expect(isNewsCandidate('تیم ملی فوتبال برنده شد')).toBe(false);
    expect(isNewsCandidate('صف خرید در نماد فولاد؛ افزایش سرمایه تصویب شد')).toBe(false);
    expect(isNewsCandidate('شاخص کل بورس تهران امروز ۲ درصد رشد کرد')).toBe(true);
    expect(isNewsCandidate('عضو کانال VIP شوید، سیگنال طلا رایگان')).toBe(false);
  });

  it('matches whole words only («مس» is not in «مسکن»)', () => {
    // «بازار» and «مسکن» (a weak word of its own), not the strong «مس»
    expect(keywordScore('بازار مسکن')).toBe(2);
    expect(keywordScore('بازار مس')).toBe(3);
  });

  it('guesses the category from the first matching word', () => {
    expect(guessCategory('قیمت سکه و دلار')).toBe('gold');
    expect(guessCategory('دلار و سکه')).toBe('currency');
    expect(guessCategory('برنت به ۹۰ دلار رسید')).toBe('oil');
    expect(guessCategory('تورم ماهانه اعلام شد')).toBe('economy');
    expect(guessCategory('شاخص کل بورس ۵۰ هزار واحد بالا رفت')).toBe('bourse');
  });
});

describe('similarity', () => {
  it('a repost (even shortened) is the same news; another story is not', () => {
    const a = 'بانک مرکزی اعلام کرد نرخ تورم نقطه به نقطه در شهریور به ۴۵ درصد رسید';
    const b = '🔴 فوری | بانک مرکزی: نرخ تورم نقطه به نقطه شهریور به ۴۵ درصد رسید';
    expect(similarity(a, b)).toBeGreaterThanOrEqual(NEWS_LIMITS.duplicateSimilarity);
    expect(similarity(a, 'قیمت سکه امامی امروز کاهش یافت و به ۸۰ میلیون رسید')).toBeLessThan(NEWS_LIMITS.duplicateSimilarity);
  });
});

describe('the model', () => {
  it('one prompt numbers every post and clips long ones', () => {
    const messages = buildNewsPrompt([{ text: 'الف' }, { text: 'ب'.repeat(5000) }]);
    expect(messages[0].role).toBe('system');
    expect(messages[1].content).toMatch(/^#1\nالف\n\n#2\n/);
    expect(messages[1].content.length).toBeLessThan(NEWS_LIMITS.aiTextChars + 50);
  });

  it('reads the answer, with text around the JSON, and ignores bad items', () => {
    const answer = 'Sure:\n```json\n[{"i":1,"k":1,"c":"gold","p":3,"t":"سکه گران شد","s":"قیمت سکه بالا رفت."},{"i":2,"k":0},{"i":3,"k":1,"c":"nope","p":9,"t":"تیتر"},{"i":9,"k":1,"t":"x"}]\n```';
    const v = parseNewsVerdicts(answer, 3);
    expect(v.get(0)).toEqual({ keep: true, category: 'gold', importance: 3, title: 'سکه گران شد', summary: 'قیمت سکه بالا رفت.' });
    expect(v.get(1)).toEqual({ keep: false });
    expect(v.get(2)).toMatchObject({ keep: true, category: 'economy', importance: 3, summary: 'تیتر' });
    expect(v.size).toBe(3);
    expect(parseNewsVerdicts('no json', 2).size).toBe(0);
    expect(parseNewsVerdicts([{ i: 1, k: 1, t: 'x', s: 'y', c: 'oil', p: 2 }], 1).get(0).category).toBe('oil');
  });

  it('a headline or summary with words of another language is marked', () => {
    const v = parseNewsVerdicts([{ i: 1, k: 1, c: 'currency', p: 2, t: 'افزایش nhẹ دلار', s: 'خلاصه' }, { i: 2, k: 1, c: 'oil', p: 1, t: 'تصمیم OPEC', s: 'خلاصه' }], 2);
    expect(v.get(0).foreign).toBe(true);
    expect(v.get(1).foreign).toBeUndefined();
  });

  it('without the model: the first line is the headline', () => {
    expect(fallbackNewsItem('دلار ۱۰۰ هزار تومانی شد\nجزئیات خبر')).toMatchObject({ title: 'دلار ۱۰۰ هزار تومانی شد', summary: 'جزئیات خبر', category: 'currency' });
  });
});

describe('normalizeChannel', () => {
  it('accepts @name, links and plain names', () => {
    expect(normalizeChannel('@Khabari')).toBe('khabari');
    expect(normalizeChannel('https://t.me/s/eghtesadonline/123')).toBe('eghtesadonline');
    expect(normalizeChannel('a b')).toBe('');
  });
});

describe('runNewsPolling', () => {
  let db;
  let env;
  let pages;
  const fetchPage = async (channel) => {
    if (!pages[channel]) throw new Error('HTTP 404');
    return pages[channel];
  };
  const NOW = Date.parse('2026-10-05T10:00:00Z');

  beforeEach(async () => {
    resetD1SchemaCache();
    db = sqliteD1();
    env = { DB: db };
    pages = {};
    await saveNewsChannels(env, ['@chan_one', 'chan_two']);
  });

  const at = (min) => new Date(Date.parse('2026-10-05T08:00:00Z') + min * 60000).toISOString();

  it('on first read takes the latest posts, asks the model once per batch and publishes what it keeps', async () => {
    const many = Array.from({ length: 14 }, (_, i) => post('chan_one', i + 1, `خبر شماره ${i + 1}: قیمت دلار و طلا ${i + 1}٬ نرخ ارز بانک مرکزی ${'کلمه' + i}`, at(i)));
    pages.chan_one = page('chan_one', many, 'کانال یک');
    pages.chan_two = page('chan_two', [post('chan_two', 7, 'تیم ملی برد', at(1))]);
    const run = vi.fn(async (model, { messages }) => {
      const count = (messages[1].content.match(/^#\d+$/gm) || []).length;
      return { response: JSON.stringify(Array.from({ length: count }, (_, i) => (i % 2 === 0
        ? { i: i + 1, k: 1, c: 'currency', p: 2, t: `تیتر ${i + 1}`, s: 'خلاصه' }
        : { i: i + 1, k: 0 }))) };
    });
    env.AI = { run };

    const result = await runNewsPolling(env, { now: NOW, fetchPage });
    expect(result.checked).toBe(NEWS_LIMITS.firstReadPosts + 1); // chan_two's one post too
    expect(run).toHaveBeenCalled();
    expect(run.mock.calls[0][0]).toBe('@cf/zai-org/glm-5.3-flash');
    const { items } = await dbListNews(env);
    expect(items.length).toBe(result.published);
    expect(items[0]).toMatchObject({ channel: 'chan_one', channelTitle: 'کانال یک', category: 'currency', importance: 2, ai: true });
    expect(items[0].url).toMatch(/^https:\/\/t\.me\/chan_one\/\d+$/);

    // The next minute: nothing new, no model call
    run.mockClear();
    const again = await runNewsPolling(env, { now: NOW + 60000, fetchPage });
    expect(again.checked).toBe(0);
    expect(run).not.toHaveBeenCalled();

    const status = await getNewsStatus(env);
    expect(status.channels.chan_one).toMatchObject({ ok: true, lastPostId: 14, title: 'کانال یک' });
    expect(status.channels.chan_two.ok).toBe(true);
  });

  it('only posts after the last one seen; a repost of published news is not sent to the model', async () => {
    pages.chan_one = page('chan_one', [post('chan_one', 1, 'بانک مرکزی اعلام کرد نرخ تورم نقطه به نقطه در شهریور به ۴۵ درصد رسید', at(0))]);
    env.AI = { run: vi.fn(async () => ({ response: '[{"i":1,"k":1,"c":"economy","p":3,"t":"تورم ۴۵ درصد شد","s":"تورم نقطه به نقطه شهریور ۴۵ درصد اعلام شد."}]' })) };
    await runNewsPolling(env, { now: NOW, fetchPage });
    expect((await dbListNews(env)).items).toHaveLength(1);

    pages.chan_two = page('chan_two', [post('chan_two', 50, '🔴 فوری | بانک مرکزی: نرخ تورم نقطه به نقطه شهریور به ۴۵ درصد رسید', at(2))]);
    env.AI.run.mockClear();
    await runNewsPolling(env, { now: NOW + 60000, fetchPage });
    expect(env.AI.run).not.toHaveBeenCalled();
    expect((await dbListNews(env)).items).toHaveLength(1);
  });

  it('without the model nothing is published (no keyword-only publishing), and it is logged', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    pages.chan_one = page('chan_one', [
      post('chan_one', 1, 'افزایش قیمت دلار', at(0)),
      post('chan_one', 2, 'دلار و طلا و سکه بعد از تصمیم بانک مرکزی و فدرال رزرو جهش کرد\nجزئیات', at(1)),
    ]);
    await runNewsPolling(env, { now: NOW, fetchPage });
    expect((await dbListNews(env)).items).toHaveLength(0);
    expect((await getNewsStatus(env)).aiError).toMatch(/AI binding/);
    expect(error.mock.calls.flat().join(' ')).toMatch(/no model/);
    error.mockRestore();
  });

  it('the model fails: no other model, nothing published, the posts wait for the next run; logged and shown', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    pages.chan_one = page('chan_one', [post('chan_one', 1, 'دلار و طلا و سکه بعد از تصمیم بانک مرکزی و فدرال رزرو جهش کرد', at(0))]);
    env.AI = { run: vi.fn(async () => { throw new Error('3040: capacity'); }) };
    await runNewsPolling(env, { now: NOW, fetchPage });
    expect(env.AI.run).toHaveBeenCalledTimes(1); // GLM 5.3 Flash only: no other model
    expect(NEWS_AI_MODELS.map((m) => m.id)).toEqual(['@cf/zai-org/glm-5.3-flash']);
    expect((await dbListNews(env)).items).toHaveLength(0);
    const status = await getNewsStatus(env);
    expect(status).toMatchObject({ aiModel: 'GLM 5.3 Flash', aiError: expect.stringMatching(/capacity/) });
    expect(status.channels.chan_two).toMatchObject({ ok: false, error: 'HTTP 404' });
    expect(error.mock.calls.flat().join(' ')).toMatch(/model failed/);

    // The model is back: the same post is read again and published
    env.AI.run = vi.fn(async () => ({ response: '[{"i":1,"k":1,"c":"currency","p":2,"t":"جهش دلار و طلا","s":"خلاصه"}]' }));
    await runNewsPolling(env, { now: NOW + 60000, fetchPage });
    expect((await dbListNews(env)).items.map((n) => n.postId)).toEqual([1]);
    expect((await getNewsStatus(env)).aiError).toBe('');
    error.mockRestore();
  });

  it('an answer with no verdict is a failure the panel shows', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    pages.chan_one = page('chan_one', [post('chan_one', 1, 'دلار و طلا و سکه بعد از تصمیم بانک مرکزی و فدرال رزرو جهش کرد', at(0))]);
    env.AI = { run: vi.fn(async () => ({ response: 'Sorry, I cannot help.' })) };
    await runNewsPolling(env, { now: NOW, fetchPage });
    expect(env.AI.run).toHaveBeenCalledTimes(1);
    expect((await dbListNews(env)).items).toHaveLength(0);
    expect((await getNewsStatus(env)).aiError).toMatch(/unreadable answer/);
    error.mockRestore();
  });

  it("posts beyond the run's model budget wait for the next minute", async () => {
    const words = ['تورم', 'تحریم', 'نفت', 'سکه', 'نقره', 'یورو', 'بودجه', 'مالیات', 'اوپک', 'برجام'];
    const texts = Array.from({ length: 40 }, (_, i) => `دلار ${words[i % 10]} ${'الف'.repeat(1)} رویداد${i} موضوع${i * 7} بخش${i * 13} شهر${i * 3}`);
    pages.chan_one = page('chan_one', texts.slice(0, 20).map((t, i) => post('chan_one', i + 1, t, at(i))));
    pages.chan_two = page('chan_two', texts.slice(20).map((t, i) => post('chan_two', i + 1, t, at(i + 20))));
    await saveNewsChannels(env, ['chan_one', 'chan_two']);
    // Every channel read for the first time gives its last 10: 20 posts, more than the run's budget
    env.AI = { run: vi.fn(async (m, { messages }) => ({ response: JSON.stringify((messages[1].content.match(/^#\d+$/gm) || []).map((_, i) => ({ i: i + 1, k: 0 }))) })) };
    const budget = { ...NEWS_LIMITS };
    try {
      NEWS_LIMITS.aiCallsPerRun = 1;
      NEWS_LIMITS.aiBatchSize = 4;
      const first = await runNewsPolling(env, { now: NOW, fetchPage });
      expect(env.AI.run).toHaveBeenCalledTimes(1);
      const second = await runNewsPolling(env, { now: NOW + 60000, fetchPage });
      expect(second.checked).toBeGreaterThan(0);
      expect(second.checked).toBeLessThan(first.checked);
    } finally {
      Object.assign(NEWS_LIMITS, budget);
    }
  });

  it('skips a run while another holds the lock', async () => {
    await env.DB.prepare("INSERT INTO app_state (key, value, expires_at, updated_at) VALUES ('news:lock', '1', ?, 0)").bind(Date.now() + 30000).run();
    expect((await runNewsPolling(env, { now: NOW, fetchPage })).skipped).toBe(true);
  });
});

describe('channels and the list', () => {
  beforeEach(() => resetD1SchemaCache());

  it('defaults to the configured channels; saving normalizes and drops repeats', async () => {
    const env = { DB: sqliteD1() };
    expect((await getNewsChannels(env)).map((c) => c.username)).toEqual(DEFAULT_NEWS_CHANNELS);
    const saved = await saveNewsChannels(env, ['@Khabari', 'khabari', { username: 't.me/bourse24ir', enabled: false }, '!!']);
    expect(saved).toEqual([{ username: 'khabari', enabled: true }, { username: 'bourse24ir', enabled: false }]);
    expect(await getNewsChannels(env)).toEqual(saved);
  });

  it('lists newest first by page and category; hidden and old items are left out', async () => {
    const env = { DB: sqliteD1() };
    const { dbInsertNews } = await import('../../src/repositories/news.repository.js');
    const item = (id, publishedAt, category = 'gold') => ({ id: `c/${id}`, channel: 'c', postId: id, url: `https://t.me/c/${id}`, title: `t${id}`, summary: '', text: '', category, importance: 1, publishedAt });
    await dbInsertNews(env, [item(1, 1000), item(2, 2000, 'currency'), item(3, 3000), item(4, 4000)]);
    const first = await dbListNews(env, { limit: 2 });
    expect(first.items.map((i) => i.postId)).toEqual([4, 3]);
    expect(first.hasMore).toBe(true);
    expect(first.total).toBe(4);
    const second = await dbListNews(env, { limit: 3, page: 2 });
    expect(second).toMatchObject({ total: 4, hasMore: false });
    expect(second.items.map((i) => i.postId)).toEqual([1]);
    expect((await dbListNews(env, { limit: 2, before: 3000 })).items.map((i) => i.postId)).toEqual([2, 1]);
    expect((await dbListNews(env, { category: 'currency' })).items.map((i) => i.postId)).toEqual([2]);
    expect(await dbSetNewsHidden(env, 'c/4', true)).toBe(true);
    await dbPurgeOldNews(env, 1500);
    expect((await dbListNews(env)).items.map((i) => i.postId)).toEqual([3, 2]);
  });
});
