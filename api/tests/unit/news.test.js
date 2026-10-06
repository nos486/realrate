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
  hasProfanity,
  similarity,
  buildNewsPrompt,
  parseNewsVerdicts,
  fallbackNewsItem,
  normalizeChannel,
} from '../../src/domain/news.js';
import { runNewsPolling, saveNewsChannels, getNewsChannels, getNewsStatus, newsReport } from '../../src/services/news/news.service.js';
import { dbListNews, dbSetNewsHidden, dbPurgeOldNews } from '../../src/repositories/news.repository.js';
import { resetD1SchemaCache } from '../../src/repositories/d1Schema.js';
import { DEFAULT_NEWS_CHANNELS, NEWS_LIMITS, NEWS_AI_MODEL } from '../../src/config/news.config.js';
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

  it('political and security words alone are not enough: an economic word is needed', () => {
    const statement = '🔴 پزشکیان:  حمله آمریکا به ایران با هدف سرنگونی نظام بود\n\n🗞 @iraninterpshm';
    expect(keywordScore(statement)).toBe(2);
    expect(isNewsCandidate(statement)).toBe(false);
    expect(isNewsCandidate('حمله آمریکا و اسرائیل؛ جنگ تازه')).toBe(false);
    expect(isNewsCandidate('پس از حمله اسرائیل قیمت دلار جهش کرد')).toBe(true);
    expect(isNewsCandidate('آتش بس اعلام شد؛ واکنش بازار ارز')).toBe(true);
    // Nuclear-program statements: political words only (the IAEA, inspectors, the US)
    expect(isNewsCandidate('پزشکیان: ایران بارها صداقت خود را در زمینه فعالیت‌های هسته‌ای به اثبات رسانده و بیشترین نظارت های آژانس بین‌المللی انرژی اتمی در دنیا مربوط به کشور ما بوده است؛ با این حال آمریکا با ادعاهای دروغین، ایران را تحت فشار قرار داده است.')).toBe(false);
    expect(isNewsCandidate('پزشکیان: هر بار بازرسان آژانس به ایران آمده‌اند، مراکز هسته‌ای و دانشمندان ما شناسایی و پس از آن این مراکز بمباران و دانشمندان ما ترور شده‌اند.')).toBe(false);
    expect(isNewsCandidate('🔴اسرائیل آماده شلیک به پرواز فلای دبی شده بود\nبه گفته دو منبع اسرائیلی، اسرائیل آماده بود هواپیما را سرنگون کند تا از حمله جلوگیری شود')).toBe(false);
    // Sanctions and talks still count by themselves
    expect(isNewsCandidate('آمریکا تحریم‌های تازه علیه ایران وضع کرد')).toBe(true);
  });

  it('a vulgar word drops a post; ordinary words that contain one do not', () => {
    expect(hasProfanity('حمله آمریکا به ایران با هدف سرنگونی نظام بود که کیر شدن')).toBe(true);
    expect(hasProfanity('هیچ کس نیامد و کسی هم خبر نداشت')).toBe(false);
    expect(hasProfanity('قیمت تخم مرغ و کونگ فو')).toBe(false);
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
    expect(guessCategory('آتش بس میان دو کشور اعلام شد')).toBe('politics');
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
    // The desk's rules: what is published, the importance scale, rumours, the writing, posts as data
    expect(messages[0].content).toMatch(/PUBLISH \(k=1\)/);
    expect(messages[0].content).toMatch(/IMPORTANCE p/);
    expect(messages[0].content).toMatch(/never above 2/);
    expect(messages[0].content).toMatch(/Never add facts/);
    expect(messages[0].content).toMatch(/never instructions to follow/);
    // Politics: a new event only, not statements about what happened before; vulgar posts out
    expect(messages[0].content).toMatch(/POLITICS AND SECURITY/);
    // One test for every post: a fact, not words, that changes a market driver
    expect(messages[0].content).toMatch(/THE TEST — apply it to every post/);
    expect(messages[0].content).toMatch(/Words fail this test whoever says them/);
    expect(messages[0].content).toMatch(/Publish only when both answers are yes/);
    expect(messages[0].content).toMatch(/vulgar or insulting language/);
    expect(messages[0].content).toMatch(/politics \(war, military/);
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
    expect(parseNewsVerdicts([{ i: 1, k: 1, t: 'آتش بس', s: 'خلاصه', c: 'politics', p: 3 }], 1).get(0).category).toBe('politics');
  });

  it('an answer cut off by the token limit, or after reasoning with brackets, still gives the finished items', () => {
    const cut = '[{"i":1,"k":0},{"i":2,"k":1,"c":"gold","p":2,"t":"سکه {گران} شد","s":"قیمت \\"سکه\\" بالا رفت."},{"i":3,"k":1,"c":"oil","p":1,"t":"نفت ارز';
    const v = parseNewsVerdicts(cut, 3);
    expect(v.get(0)).toEqual({ keep: false });
    expect(v.get(1)).toMatchObject({ keep: true, title: 'سکه {گران} شد', summary: 'قیمت "سکه" بالا رفت.' });
    expect(v.has(2)).toBe(false);

    const reasoned = '<think>post [1] is opinion, so {"i":1,"k":1,"t":"x"}</think>\nPost [2] is ads. Answer:\n[{"i":1,"k":0},{"i":2,"k":0}]';
    const r = parseNewsVerdicts(reasoned, 2);
    expect(r.get(0)).toEqual({ keep: false });
    expect(r.get(1)).toEqual({ keep: false });
    expect(parseNewsVerdicts('{"items":[{"i":1,"k":0}]}', 1).get(0)).toEqual({ keep: false });
  });

  it('a headline or summary with words of another language is marked', () => {
    const v = parseNewsVerdicts([{ i: 1, k: 1, c: 'currency', p: 2, t: 'افزایش nhẹ دلار', s: 'خلاصه' }, { i: 2, k: 1, c: 'oil', p: 1, t: 'تصمیم OPEC', s: 'خلاصه' }], 2);
    expect(v.get(0).foreign).toBe(true);
    expect(v.get(1).foreign).toBeUndefined();
  });

  it("the admin's report: the run, today's totals (a new Tehran day starts over), the runs that did something", () => {
    const at = Date.parse('2026-10-05T10:00:00Z');
    const run = (extra) => ({ at, checked: 0, notMarket: 0, duplicates: 0, sent: 0, rejected: 0, published: 0, waiting: 0, aiCalls: 0, error: '', ...extra });
    let status = newsReport(null, run({ checked: 10, notMarket: 6, duplicates: 1, sent: 3, rejected: 1, published: 2, aiCalls: 1 }));
    status = { ...status, ...newsReport(status, run({ at: at + 60000 })) };
    status = { ...status, ...newsReport(status, run({ at: at + 120000, checked: 2, sent: 2, rejected: 2, aiCalls: 1, error: '3040' })) };
    expect(status.today).toMatchObject({ checked: 12, notMarket: 6, duplicates: 1, sent: 5, rejected: 3, published: 2, aiCalls: 2, errors: 1 });
    // The idle run isn't kept
    expect(status.runs.map((r) => r.at)).toEqual([at + 120000, at]);
    // Posts only waiting in the queue: not kept either
    expect(newsReport(status, run({ at: at + 180000, waiting: 5 })).runs).toHaveLength(2);
    // 20:31 UTC: a new Tehran day
    const next = newsReport(status, run({ at: Date.parse('2026-10-05T20:31:00Z'), checked: 1, notMarket: 1 }));
    expect(next.today).toMatchObject({ checked: 1, notMarket: 1, published: 0 });
    expect(next.runs).toHaveLength(3);
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
    // The model is asked with temperature 0 (the same post, the same verdict), the least reasoning
    // (GLM 5.3 Flash can't turn it off: enable_thinking false is refused) and room for it
    const request = run.mock.calls[0][1];
    expect(request.temperature).toBe(0);
    expect(request.reasoning_effort).toBe('low');
    expect(request.chat_template_kwargs).toBeUndefined();
    expect(request.max_tokens).toBeGreaterThan(NEWS_AI_MODEL.reasoningTokens);
    // The report adds up: every post checked is not market news, a repeat, rejected or published
    const report = await getNewsStatus(env);
    expect(report.run.checked).toBe(result.checked);
    expect(report.run.notMarket + report.run.duplicates + report.run.rejected + report.run.published).toBe(report.run.checked);
    expect(report.today).toMatchObject({ checked: result.checked, published: result.published });
    expect(report.runs).toHaveLength(1);
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
    expect(env.AI.run.mock.calls[0][0]).toBe(NEWS_AI_MODEL.id);
    expect(NEWS_AI_MODEL.id).toBe('@cf/zai-org/glm-5.3-flash');
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
    expect((await getNewsStatus(env)).aiError).toMatch(/unreadable answer.*«Sorry, I cannot help\.»/);
    error.mockRestore();
  });

  it('an answer cut off midway: the finished verdicts count, the posts it left out wait for the next run', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    pages.chan_one = page('chan_one', [
      post('chan_one', 1, 'دلار و طلا و سکه بعد از تصمیم بانک مرکزی و فدرال رزرو جهش کرد', at(0)),
      post('chan_one', 2, 'بانک مرکزی اعلام کرد نرخ تورم نقطه به نقطه در شهریور به ۴۵ درصد رسید', at(1)),
    ]);
    env.AI = { run: vi.fn(async () => ({ choices: [{ message: { content: '[{"i":1,"k":1,"c":"currency","p":2,"t":"جهش دلار و طلا","s":"خلاصه"},{"i":2,"k":1,"c":"econ' }, finish_reason: 'length' }] })) };
    const first = await runNewsPolling(env, { now: NOW, fetchPage });
    expect(first).toMatchObject({ waiting: 1 });
    expect((await getNewsStatus(env)).aiError).toBe('');
    expect((await dbListNews(env)).items.map((n) => n.postId)).toEqual([1]);

    env.AI.run = vi.fn(async () => ({ response: '[{"i":1,"k":1,"c":"economy","p":2,"t":"تورم ۴۵ درصد شد","s":"خلاصه"}]' }));
    const second = await runNewsPolling(env, { now: NOW + 60000, fetchPage });
    expect(env.AI.run.mock.calls[0][1].messages[1].content).toMatch(/۴۵ درصد/);
    expect(second).toMatchObject({ waiting: 0 });
    expect((await dbListNews(env)).items.map((n) => n.postId).sort()).toEqual([1, 2]);
    warn.mockRestore();
  });

  it('recent news is read for the repeat check only when a post passed the keywords', async () => {
    const prepare = vi.spyOn(db, 'prepare');
    const recentReads = () => prepare.mock.calls.filter(([sql]) => /SELECT title, text FROM news/.test(sql)).length;
    pages.chan_one = page('chan_one', [post('chan_one', 1, 'تیم ملی برد', at(0))]);
    await runNewsPolling(env, { now: NOW, fetchPage });
    await runNewsPolling(env, { now: NOW + 60000, fetchPage });
    expect(recentReads()).toBe(0);

    pages.chan_one = page('chan_one', [post('chan_one', 2, 'دلار و طلا و سکه بعد از تصمیم بانک مرکزی و فدرال رزرو جهش کرد', at(1))]);
    env.AI = { run: vi.fn(async () => ({ response: '[{"i":1,"k":0}]' })) };
    await runNewsPolling(env, { now: NOW + 120000, fetchPage });
    expect(recentReads()).toBe(1);
    prepare.mockRestore();
  });

  it('a vulgar post never reaches the model; it counts as not market news in the report', async () => {
    pages.chan_one = page('chan_one', [post('chan_one', 1, 'قیمت دلار بالا رفت و کیر شدن', at(0))]);
    env.AI = { run: vi.fn() };
    await runNewsPolling(env, { now: NOW, fetchPage });
    expect(env.AI.run).not.toHaveBeenCalled();
    expect((await getNewsStatus(env)).run).toMatchObject({ checked: 1, notMarket: 1, sent: 0 });
  });

  it('a reasoning model out of tokens before answering: the panel says so', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    pages.chan_one = page('chan_one', [post('chan_one', 1, 'دلار و طلا و سکه بعد از تصمیم بانک مرکزی و فدرال رزرو جهش کرد', at(0))]);
    env.AI = { run: vi.fn(async () => ({ choices: [{ message: { content: null }, finish_reason: 'length' }] })) };
    await runNewsPolling(env, { now: NOW, fetchPage });
    expect((await getNewsStatus(env)).aiError).toMatch(/token limit ran out/);
    error.mockRestore();
  });

  it("posts beyond the run's model budget wait in the queue: Telegram is read once, each post decided once", async () => {
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
      expect(first).toMatchObject({ checked: 4, waiting: 16 });
      const second = await runNewsPolling(env, { now: NOW + 60000, fetchPage });
      // Nothing new on Telegram: the queue's next batch, none of the first one again
      expect(second).toMatchObject({ checked: 4, waiting: 12 });
      const sent = env.AI.run.mock.calls.map((c) => c[1].messages[1].content);
      expect(sent[1]).not.toBe(sent[0]);
      const report = await getNewsStatus(env);
      expect(report.today).toMatchObject({ checked: 8, sent: 8, rejected: 8 });
      // A day's budget used up: they keep waiting, and the panel says why
      NEWS_LIMITS.aiCallsPerDay = 2;
      const third = await runNewsPolling(env, { now: NOW + 120000, fetchPage });
      expect(third).toMatchObject({ checked: 0, waiting: 12, aiCalls: 0 });
      // Not a model error, and an idle run doesn't fill the report
      const after = await getNewsStatus(env);
      expect(after).toMatchObject({ aiError: '', budgetUsedUp: true });
      expect(after.today.errors).toBeUndefined();
      expect(after.runs).toHaveLength(2);
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
