/**
 * rubikaBot.test.js — The Rubika bot: settings, the channel's news, the admin's chat (link code,
 * commands, buttons, a forwarded channel post), the webhook's secret and the admin checks
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sqliteD1 } from '../helpers/sqliteD1.js';
import { resetD1SchemaCache } from '../../src/repositories/d1Schema.js';

let adminUser = { role: 'admin' };
vi.mock('../../src/lib/auth.js', async (orig) => ({ ...(await orig()), getAuthenticatedUser: async () => adminUser }));

const { normalizeRubikaChannel, getRubikaConfig, publicRubikaConfig, saveRubikaConfig, newRubikaLinkCode, getRubikaStatus } = await import('../../src/services/bot/rubika/rubikaConfig.service.js');
const { callRubikaApi, richText, toKeypad, isRubikaToken } = await import('../../src/services/bot/rubika/rubikaApi.js');
const { formatRubikaNews, enqueueRubikaNews } = await import('../../src/services/bot/rubika/rubikaChannel.service.js');
const { runRubikaBot, syncRubikaWebhook, rubikaWebhookSecret } = await import('../../src/services/bot/rubika/rubikaBot.service.js');
const { handleRubikaUpdate, notifyRubikaAdmin } = await import('../../src/services/bot/rubika/rubikaChat.service.js');
const { handleRubikaWebhook, handleAdminTestRubika, RUBIKA_WEBHOOK_ROUTE } = await import('../../src/handlers/rubikaRoutes.js');
const { enqueueChannelNews, notifyAdmins } = await import('../../src/services/bot/messengers.js');
const { saveBotConfig } = await import('../../src/services/bot/botConfig.service.js');
const repo = await import('../../src/repositories/userGroups.repository.js');

const TOKEN = 'BCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123';
const CHANNEL = 'c0AbCdEfGhIjKlMnOpQrStUv';
const ADMIN = { chatId: 'b0AdminChat000000001', senderId: 'u0AdminUser000000001' };
const NOW = Date.parse('2026-10-15T12:00:00Z');

const article = (n, extra = {}) => ({
  source: 'world', channel: 'bbc', channelTitle: 'BBC', postId: n,
  url: `https://example.com/a/${n}?utm=1`, title: `تیتر ${n}`, summary: `خلاصه ${n}`,
  publishedAt: NOW - (100 - n) * 1000, ...extra,
});

/** A fake Rubika Bot API: records the calls, answers by method */
function fakeApi(answers = {}) {
  const calls = [];
  const fetchFn = vi.fn(async (url, init) => {
    const method = url.split('/').pop();
    const params = JSON.parse(init.body);
    calls.push({ url, method, params });
    const answer = typeof answers[method] === 'function' ? answers[method](params) : answers[method] ?? { status: 'OK', data: {} };
    return { status: 200, json: async () => answer };
  });
  return { fetchFn, calls };
}

const message = (text, extra = {}) => ({
  update: { type: 'NewMessage', chat_id: ADMIN.chatId, new_message: { message_id: '1', text, sender_type: 'User', sender_id: ADMIN.senderId, ...extra } },
});
const press = (buttonId, senderId = ADMIN.senderId) => ({
  inline_message: { sender_id: senderId, chat_id: ADMIN.chatId, message_id: '42', text: 'btn', aux_data: { button_id: buttonId } },
});

let env;
beforeEach(() => {
  adminUser = { role: 'admin' };
  resetD1SchemaCache();
  repo.forgetUserGroupKeys();
  env = { DB: sqliteD1() };
});

async function linkAdmin() {
  const { code } = await newRubikaLinkCode(env);
  await handleRubikaUpdate(env, message(`/start ${code}`), { fetchFn: fakeApi().fetchFn });
}

describe('settings', () => {
  it('normalizes a channel id, an @name or a rubika.ir link', () => {
    expect(normalizeRubikaChannel(CHANNEL)).toBe(CHANNEL);
    expect(normalizeRubikaChannel('@realrate_news')).toBe('@realrate_news');
    expect(normalizeRubikaChannel('https://rubika.ir/realrate_news')).toBe('@realrate_news');
    expect(normalizeRubikaChannel('bad name')).toBe('');
  });

  it('keeps the token out of what the admin reads, checks its shape, and needs a token and a channel to switch on', async () => {
    await expect(saveRubikaConfig(env, { token: 'short' })).rejects.toThrow();
    await expect(saveRubikaConfig(env, { enabled: true })).rejects.toThrow();
    const config = await saveRubikaConfig(env, { token: TOKEN, channel: CHANNEL, enabled: true });
    expect(config).toMatchObject({ enabled: true, channel: CHANNEL, tokenSource: 'admin' });
    const shown = publicRubikaConfig(config);
    expect(shown).toMatchObject({ tokenSet: true, adminLinked: false });
    expect(JSON.stringify(shown)).not.toContain(TOKEN);
    expect(isRubikaToken(TOKEN)).toBe(true);
  });

  it('prefers the RUBIKA_BOT_TOKEN secret', async () => {
    env.RUBIKA_BOT_TOKEN = TOKEN;
    await saveRubikaConfig(env, { channel: CHANNEL, enabled: true });
    expect(await getRubikaConfig(env)).toMatchObject({ token: TOKEN, tokenSource: 'env' });
  });
});

describe('the API client', () => {
  it('reads Rubika\'s answer and never lets the token into an error', async () => {
    const ok = await callRubikaApi(TOKEN, 'getMe', {}, { fetchFn: fakeApi({ getMe: { status: 'OK', data: { bot: { username: 'rr_bot' } } } }).fetchFn });
    expect(ok).toEqual({ ok: true, result: { bot: { username: 'rr_bot' } } });
    const bad = await callRubikaApi(TOKEN, 'getMe', {}, { fetchFn: async () => { throw new Error(`failed for ${TOKEN}`); } });
    expect(bad.ok).toBe(false);
    expect(bad.error).not.toContain(TOKEN);
    const limited = await callRubikaApi(TOKEN, 'sendMessage', {}, { fetchFn: fakeApi({ sendMessage: { status: 'TOO_REQUESTS' } }).fetchFn });
    expect(limited).toMatchObject({ ok: false, retryAfter: 60 });
  });

  it('builds bold and link metadata over UTF-16 offsets, and turns a Telegram keyboard into a keypad', () => {
    const { text, metadata } = richText([{ text: '📊 تیتر', bold: true }, '\n', { text: 'منبع', link: 'https://x.y' }]);
    expect(text).toBe('📊 تیتر\nمنبع');
    expect(metadata.meta_data_parts[0]).toMatchObject({ type: 'Bold', from_index: 0, length: '📊 تیتر'.length });
    expect(metadata.meta_data_parts[1]).toMatchObject({ type: 'Link', from_index: '📊 تیتر\n'.length, link_url: 'https://x.y' });
    expect(toKeypad({ inline_keyboard: [[{ text: 'A', callback_data: 'a:1' }]] })).toEqual({ rows: [{ buttons: [{ id: 'a:1', type: 'Simple', button_text: 'A' }] }] });
  });
});

describe('the channel', () => {
  it('the message is a bold headline, the summary and the source linking to the article', () => {
    const { text, metadata } = formatRubikaNews({ title: 'تیتر', summary: 'خلاصه', url: 'https://e.com/a', sourceTitle: 'BBC' });
    expect(text).toBe('تیتر\n\nخلاصه\n\nمنبع: BBC');
    expect(metadata.meta_data_parts.map((p) => p.type)).toEqual(['Bold', 'Link']);
  });

  it('queues for Rubika alongside Telegram, posts once, and keeps a status', async () => {
    await saveRubikaConfig(env, { token: TOKEN, channel: CHANNEL, enabled: true });
    expect(await enqueueChannelNews(env, [article(1), article(2)], NOW)).toBe(2); // Telegram is off
    expect(await enqueueRubikaNews(env, [article(1)], NOW)).toBe(0);
    const { fetchFn, calls } = fakeApi();
    expect(await runRubikaBot(env, { now: NOW, fetchFn })).toMatchObject({ sent: 2, waiting: 0 });
    expect(calls.map((c) => c.method)).toEqual(['sendMessage', 'sendMessage']);
    expect(calls[0].params).toMatchObject({ chat_id: CHANNEL, text: expect.stringContaining('تیتر 1') });
    expect(calls[0].url).toContain(`/v3/${TOKEN}/sendMessage`);
    expect(await getRubikaStatus(env)).toMatchObject({ sentTotal: 2, waiting: 0 });
    expect(await runRubikaBot(env, { now: NOW, fetchFn })).toMatchObject({ sent: 0 });
  });

  it('a Telegram failure never holds Rubika\'s queue', async () => {
    await saveBotConfig(env, { token: '123456789:AAFakeTokenFakeTokenFakeTokenFake_12', channel: '@realrate_news', enabled: true });
    await saveRubikaConfig(env, { token: TOKEN, channel: CHANNEL, enabled: true });
    expect(await enqueueChannelNews(env, [article(1)], NOW)).toBe(2);
  });

  it('does nothing while off', async () => {
    expect(await runRubikaBot(env)).toMatchObject({ skipped: true });
    expect(await enqueueRubikaNews(env, [article(1)], NOW)).toBe(0);
  });
});

describe('the admin chat', () => {
  beforeEach(async () => {
    const now = new Date().toISOString();
    await repo.dbListGroups(env);
    await env.DB.prepare('INSERT INTO users (id, email, name, created_at, last_login) VALUES (?, ?, ?, ?, ?)').bind('u1', 'u1@example.com', 'U1', now, now).run();
    await saveRubikaConfig(env, { token: TOKEN, channel: CHANNEL, enabled: true });
  });

  it('links the account that sends the code, once; a wrong code or a stranger links nothing', async () => {
    const { code } = await newRubikaLinkCode(env);
    expect(publicRubikaConfig(await getRubikaConfig(env))).toMatchObject({ linkCode: code, adminLinked: false });
    const { fetchFn, calls } = fakeApi();
    await handleRubikaUpdate(env, message('000000' === code ? '111111' : '000000'), { fetchFn });
    expect(calls).toHaveLength(0);
    await handleRubikaUpdate(env, message(code), { fetchFn });
    expect(await getRubikaConfig(env)).toMatchObject({ adminChatId: ADMIN.chatId, adminUserId: ADMIN.senderId, linkCode: '' });
    expect(calls[0]).toMatchObject({ method: 'sendMessage', params: { chat_id: ADMIN.chatId } });
    // The code is used up
    await handleRubikaUpdate(env, { update: { ...message(code).update, new_message: { ...message(code).update.new_message, sender_id: 'u0Stranger' } } }, { fetchFn });
    expect(await getRubikaConfig(env)).toMatchObject({ adminUserId: ADMIN.senderId });
  });

  it('never links from a group', async () => {
    const { code } = await newRubikaLinkCode(env);
    await handleRubikaUpdate(env, { update: { ...message(code).update, chat_id: 'g0SomeGroup1234567890' } }, { fetchFn: fakeApi().fetchFn });
    expect((await getRubikaConfig(env)).adminUserId).toBe('');
  });

  it('voids the code after a few wrong guesses', async () => {
    const { code } = await newRubikaLinkCode(env);
    const wrong = code === '000000' ? '111111' : '000000';
    const stranger = (text) => ({ update: { ...message(text).update, new_message: { ...message(text).update.new_message, sender_id: 'u0Stranger' } } });
    for (let i = 0; i < 5; i++) await handleRubikaUpdate(env, stranger(wrong), { fetchFn: fakeApi().fetchFn });
    expect((await getRubikaConfig(env)).linkCode).toBe('');
    await handleRubikaUpdate(env, message(code), { fetchFn: fakeApi().fetchFn });
    expect((await getRubikaConfig(env)).adminUserId).toBe('');
  });

  it('ignores a forwarded post whose channel id is not one', async () => {
    await linkAdmin();
    const { fetchFn, calls } = fakeApi();
    await handleRubikaUpdate(env, message('', { forwarded_from: { type_from: 'Channel', from_chat_id: 'bad id' } }), { fetchFn });
    expect((await getRubikaConfig(env)).channel).toBe(CHANNEL);
    expect(calls[0].params.text).toContain('شناخته نشد');
  });

  it('answers the linked admin\'s commands with keypads, and ignores anyone else', async () => {
    await linkAdmin();
    const { fetchFn, calls } = fakeApi();
    await handleRubikaUpdate(env, message('/users'), { fetchFn });
    expect(calls[0].params.text).toContain('کاربر');
    expect(calls[0].params.inline_keypad.rows[0].buttons[0]).toMatchObject({ id: 'uv:u1', type: 'Simple' });
    const stranger = fakeApi();
    await handleRubikaUpdate(env, { update: { ...message('/report').update, new_message: { ...message('/report').update.new_message, sender_id: 'u0Stranger' } } }, { fetchFn: stranger.fetchFn });
    expect(stranger.calls).toHaveLength(0);
  });

  it('runs a user button and edits the card', async () => {
    await linkAdmin();
    const { fetchFn, calls } = fakeApi();
    await handleRubikaUpdate(env, press('ub:u1'), { fetchFn });
    expect(calls.map((c) => c.method)).toEqual(['editMessageText', 'editMessageKeypad']);
    expect(calls[0].params.text).toContain('مسدود شد');
    const asUpdate = fakeApi();
    await handleRubikaUpdate(env, { update: { type: 'InlineMessage', ...press('uu:u1').inline_message } }, { fetchFn: asUpdate.fetchFn });
    expect(asUpdate.calls[0].params.text).toContain('دوباره فعال شد');
    const other = fakeApi();
    await handleRubikaUpdate(env, press('uu:u1', 'u0Stranger'), { fetchFn: other.fetchFn });
    expect(other.calls).toHaveLength(0);
  });

  it('sends a request with ✅ / ❌ and applies the press once', async () => {
    await linkAdmin();
    const group = (await repo.dbListGroups(env))[0];
    const { fetchFn, calls } = fakeApi();
    const sent = await notifyRubikaAdmin(env, { text: 'درخواست', action: { type: 'group-request', groupId: group.id, userId: 'u1' } }, { fetchFn });
    expect(sent).toBe(true);
    const approve = calls[0].params.inline_keypad.rows[0].buttons[0].id;
    expect(approve).toMatch(/^a:/);
    const press1 = fakeApi();
    await handleRubikaUpdate(env, press(approve), { fetchFn: press1.fetchFn });
    expect(press1.calls.map((c) => c.method)).toEqual(['editMessageKeypad', 'sendMessage']);
    const press2 = fakeApi();
    await handleRubikaUpdate(env, press(approve), { fetchFn: press2.fetchFn });
    expect(press2.calls[1].params.text).toContain('منقضی');
  });

  it('reaches the admin through notifyAdmins when only Rubika is linked', async () => {
    await linkAdmin();
    const group = (await repo.dbListGroups(env))[0];
    vi.stubGlobal('fetch', fakeApi().fetchFn);
    expect(await notifyAdmins(env, { text: 'x', action: { type: 'group-request', groupId: group.id, userId: 'u1' } })).toBe(true);
    vi.unstubAllGlobals();
  });

  it('saves the channel of a post the admin forwards', async () => {
    await linkAdmin();
    const { fetchFn } = fakeApi();
    await handleRubikaUpdate(env, message('', { forwarded_from: { type_from: 'Channel', from_chat_id: 'c0NewChannel1234567890' } }), { fetchFn });
    expect((await getRubikaConfig(env)).channel).toBe('c0NewChannel1234567890');
  });
});

describe('the webhook', () => {
  it('registers both endpoints with the secret in the path, and refuses a wrong secret', async () => {
    const config = await saveRubikaConfig(env, { token: TOKEN, channel: CHANNEL, enabled: true });
    const { fetchFn, calls } = fakeApi();
    expect(await syncRubikaWebhook(config, { fetchFn })).toEqual({ ok: true });
    const secret = await rubikaWebhookSecret(TOKEN);
    expect(calls.map((c) => c.params.type)).toEqual(['ReceiveUpdate', 'ReceiveInlineMessage']);
    expect(calls[0].params.url).toMatch(new RegExp(`/api/bot/rubika/webhook/${secret}$`));
    expect(`/api/bot/rubika/webhook/${secret}/receiveUpdate`).toMatch(RUBIKA_WEBHOOK_ROUTE);

    const post = (s) => handleRubikaWebhook(new Request('https://x/api', { method: 'POST', body: JSON.stringify(message('/help')) }), env, { secret: s, fetchFn });
    await expect(post('0'.repeat(64))).rejects.toThrow();
    const res = await post(secret);
    expect(res.status).toBe(200);
  });
});

describe('the admin check', () => {
  const run = (fetchFn) => handleAdminTestRubika(new Request('https://x/api/admin/rubika/test', { method: 'POST' }), env, { fetchFn });

  it('says when the id is not a channel, and posts a test message when it is', async () => {
    await saveRubikaConfig(env, { token: TOKEN, channel: CHANNEL });
    const notChannel = await (await run(fakeApi({ getChat: { status: 'OK', data: { chat: { chat_type: 'User' } } } }).fetchFn)).json();
    expect(notChannel).toMatchObject({ ok: false, step: 'channel' });
    const { fetchFn, calls } = fakeApi({
      getMe: { status: 'OK', data: { bot: { username: 'rr_bot', bot_title: 'RealRate' } } },
      getChat: { status: 'OK', data: { chat: { chat_type: 'Channel', title: 'RealRate News' } } },
    });
    const ok = await (await run(fetchFn)).json();
    expect(ok).toMatchObject({ ok: true, bot: { username: 'rr_bot' }, chat: { title: 'RealRate News' } });
    expect(calls.at(-1)).toMatchObject({ method: 'sendMessage', params: { chat_id: CHANNEL } });
  });

  it('refuses a non-admin', async () => {
    adminUser = { role: 'user' };
    await expect(run(fakeApi().fetchFn)).rejects.toThrow();
  });
});
