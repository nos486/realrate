/**
 * botAdminChat.test.js — The admin and the Telegram bot: the admin links by sending /start, a
 * user's request to join a group reaches them with buttons, only they can press them, and the
 * webhook accepts only Telegram's secret — on real SQLite (D1) with a fake Bot API
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sqliteD1 } from '../helpers/sqliteD1.js';
import { resetD1SchemaCache } from '../../src/repositories/d1Schema.js';

vi.mock('../../src/lib/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
  isUserAdmin: (email) => email === 'admin@example.com',
}));
const { getAuthenticatedUser } = await import('../../src/lib/auth.js');
const { saveBotConfig, getBotConfig, publicBotConfig, normalizeUsername } = await import('../../src/services/bot/botConfig.service.js');
const { notifyAdmin, handleBotUpdate } = await import('../../src/services/bot/adminChat.service.js');
const { webhookSecret } = await import('../../src/services/bot/webhook.js');
const { handleBotWebhook, handleAdminSaveBot } = await import('../../src/handlers/botRoutes.js');
const { handleRequestGroup, handleAdminAnswerRequest } = await import('../../src/handlers/groupRoutes.js');
const repo = await import('../../src/repositories/userGroups.repository.js');

const TOKEN = '123456789:AAFakeTokenFakeTokenFakeTokenFake_12';
const ADMIN_TG = { id: 777, username: 'Sina_Admin' };

/** A fake Bot API recording every call */
function fakeApi() {
  const calls = [];
  const fetchFn = vi.fn(async (url, init) => {
    const method = url.split('/').pop();
    calls.push({ method, params: JSON.parse(init.body) });
    return { status: 200, json: async () => ({ ok: true, result: {} }) };
  });
  return { fetchFn, calls };
}

let env;
beforeEach(async () => {
  resetD1SchemaCache();
  repo.forgetUserGroupKeys();
  env = { DB: sqliteD1() };
  const now = new Date().toISOString();
  await repo.dbListGroups(env);
  await env.DB.prepare('INSERT INTO users (id, email, name, created_at, last_login) VALUES (?, ?, ?, ?, ?)').bind('u1', 'u1@example.com', 'U1', now, now).run();
  await saveBotConfig(env, { token: TOKEN, channel: '@realrate_news', enabled: true, adminUsername: '@sina_admin' });
});
afterEach(() => vi.unstubAllGlobals());

const start = (from = ADMIN_TG, chat = { id: 555, type: 'private' }) => ({ message: { chat, from, text: '/start' } });

describe('the admin link', () => {
  it('normalizes a username', () => {
    expect(normalizeUsername('@Sina_Admin')).toBe('Sina_Admin');
    expect(normalizeUsername('https://t.me/Sina_Admin')).toBe('Sina_Admin');
    expect(normalizeUsername('ab')).toBe('');
  });

  it('links the user whose username matches (any case) when they send /start, and tells them', async () => {
    const { fetchFn, calls } = fakeApi();
    expect(publicBotConfig(await getBotConfig(env)).adminLinked).toBe(false);
    await handleBotUpdate(env, start(), { fetchFn });
    expect(await getBotConfig(env)).toMatchObject({ adminChatId: '555', adminUserId: '777' });
    expect(publicBotConfig(await getBotConfig(env))).toMatchObject({ adminLinked: true });
    expect(JSON.stringify(publicBotConfig(await getBotConfig(env)))).not.toContain('555');
    expect(calls.find((c) => c.method === 'sendMessage')).toMatchObject({ params: { chat_id: 555 } });
  });

  it('ignores /start from anyone else, and from a group', async () => {
    const { fetchFn, calls } = fakeApi();
    await handleBotUpdate(env, start({ id: 1, username: 'stranger' }), { fetchFn });
    await handleBotUpdate(env, start(ADMIN_TG, { id: -9, type: 'group' }), { fetchFn });
    expect(await getBotConfig(env)).toMatchObject({ adminChatId: '' });
    expect(calls).toHaveLength(0);
  });

  it('once linked, another account taking the username over cannot link in the admin\'s place', async () => {
    await handleBotUpdate(env, start(), { fetchFn: fakeApi().fetchFn });
    const { fetchFn, calls } = fakeApi();
    await handleBotUpdate(env, start({ id: 999, username: 'sina_admin' }, { id: 998, type: 'private' }), { fetchFn });
    expect(await getBotConfig(env)).toMatchObject({ adminChatId: '555', adminUserId: '777' });
    expect(calls).toHaveLength(0);
  });

  it('a different username unlinks the previous admin', async () => {
    await handleBotUpdate(env, start(), { fetchFn: fakeApi().fetchFn });
    await saveBotConfig(env, { adminUsername: 'someone_else' });
    expect(await getBotConfig(env)).toMatchObject({ adminUsername: 'someone_else', adminChatId: '', adminUserId: '' });
    // The same one again (another case) keeps the link
    await handleBotUpdate(env, start({ id: 5, username: 'someone_else' }, { id: 6, type: 'private' }), { fetchFn: fakeApi().fetchFn });
    await saveBotConfig(env, { adminUsername: 'Someone_Else' });
    expect((await getBotConfig(env)).adminChatId).toBe('6');
  });
});

describe('a request to join a group', () => {
  const asUser = () => getAuthenticatedUser.mockImplementation(async () => ({ userId: 'u1', email: 'u1@example.com', name: 'U1', role: 'user' }));
  const req = (method, path, body) => new Request(`https://api.realrate.ir${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const press = (verb, id, from = ADMIN_TG) => ({
    callback_query: { id: 'cb1', from, data: `${verb}:${id}`, message: { chat: { id: 555 }, message_id: 42, text: 'درخواست' } },
  });

  /** The user asks; returns the button token the admin was sent */
  async function ask(api) {
    await handleBotUpdate(env, start(), { fetchFn: api.fetchFn });
    api.calls.length = 0;
    vi.stubGlobal('fetch', api.fetchFn);
    asUser();
    await routesRequest();
    const sent = api.calls.find((c) => c.method === 'sendMessage');
    return sent;
  }
  const routesRequest = () => handleRequestGroup(req('POST', '/api/groups/pro/request', { note: 'لطفاً' }), env, { key: 'pro' });

  it('reaches the admin with buttons; approving adds the user to the group', async () => {
    const api = fakeApi();
    const sent = await ask(api);
    expect(String(sent.params.chat_id)).toBe('555');
    expect(sent.params.text).toContain('u1@example.com');
    expect(sent.params.text).toContain('لطفاً');
    const [approve, reject] = sent.params.reply_markup.inline_keyboard[0];
    expect(approve.callback_data.length).toBeLessThanOrEqual(64);
    expect(reject.callback_data).toMatch(/^r:/);

    await handleBotUpdate(env, press('a', approve.callback_data.slice(2)), { fetchFn: api.fetchFn });
    expect(await repo.dbGetUserGroupKeys(env, 'u1')).toEqual(['pro']);
    expect(await repo.dbListGroupRequests(env)).toEqual([]);
    const edit = api.calls.find((c) => c.method === 'editMessageText');
    expect(edit.params.text).toContain('u1@example.com به «');
    // A second press finds the action used up
    api.calls.length = 0;
    await handleBotUpdate(env, press('a', approve.callback_data.slice(2)), { fetchFn: api.fetchFn });
    expect(api.calls.find((c) => c.method === 'answerCallbackQuery').params.text).toContain('منقضی');
  });

  it('rejecting removes the request and adds nobody', async () => {
    const api = fakeApi();
    const sent = await ask(api);
    const id = sent.params.reply_markup.inline_keyboard[0][1].callback_data.slice(2);
    await handleBotUpdate(env, press('r', id), { fetchFn: api.fetchFn });
    expect(await repo.dbGetUserGroupKeys(env, 'u1')).toEqual([]);
    expect(await repo.dbListGroupRequests(env)).toEqual([]);
  });

  it('only the linked admin can press; someone else is refused and nothing changes', async () => {
    const api = fakeApi();
    const sent = await ask(api);
    const id = sent.params.reply_markup.inline_keyboard[0][0].callback_data.slice(2);
    api.calls.length = 0;
    await handleBotUpdate(env, press('a', id, { id: 999, username: 'Sina_Admin' }), { fetchFn: api.fetchFn });
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0].params.text).toContain('دسترسی ندارید');
    expect(await repo.dbGetUserGroupKeys(env, 'u1')).toEqual([]);
  });

  it('a request the admin already answered in the panel is not applied again', async () => {
    const api = fakeApi();
    const sent = await ask(api);
    const id = sent.params.reply_markup.inline_keyboard[0][1].callback_data.slice(2);
    getAuthenticatedUser.mockImplementation(async () => ({ userId: 'adm', email: 'admin@example.com', role: 'admin' }));
    await handleAdminAnswerRequest(req('POST', '/x', { approve: false }), env, { groupId: 'grp_pro', userId: 'u1' });
    api.calls.length = 0;
    await handleBotUpdate(env, press('a', id), { fetchFn: api.fetchFn });
    expect(await repo.dbGetUserGroupKeys(env, 'u1')).toEqual([]);
    expect(api.calls.find((c) => c.method === 'editMessageText').params.text).toContain('قبلاً پاسخ');
  });

  it('sends nothing while the bot is off or the admin has not started it', async () => {
    const api = fakeApi();
    vi.stubGlobal('fetch', api.fetchFn);
    asUser();
    await routesRequest(); // not started yet
    expect(api.calls).toHaveLength(0);
    expect(await repo.dbListGroupRequests(env)).toHaveLength(1);
    expect(await notifyAdmin(env, { text: 'x', action: { type: 'group-request' } })).toBe(false);
  });
});

describe('the webhook', () => {
  const post = (secret, body = start()) => new Request('https://api.realrate.ir/api/bot/telegram/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(secret ? { 'X-Telegram-Bot-Api-Secret-Token': secret } : {}) },
    body: JSON.stringify(body),
  });

  it('accepts only Telegram\'s secret', async () => {
    await expect(handleBotWebhook(post(''), env)).rejects.toMatchObject({ statusCode: 403 });
    await expect(handleBotWebhook(post('wrong'), env)).rejects.toMatchObject({ statusCode: 403 });
    const { fetchFn } = fakeApi();
    const res = await handleBotWebhook(post(await webhookSecret(TOKEN)), env, { fetchFn });
    expect(res.status).toBe(200);
    expect(await getBotConfig(env)).toMatchObject({ adminUserId: '777' });
  });

  it('saving the settings points Telegram at the webhook with that secret', async () => {
    getAuthenticatedUser.mockImplementation(async () => ({ userId: 'adm', email: 'admin@example.com', role: 'admin' }));
    const { fetchFn, calls } = fakeApi();
    const res = await handleAdminSaveBot(new Request('https://api.realrate.ir/api/admin/bot', { method: 'PUT', body: JSON.stringify({ adminUsername: 'sina_admin' }) }), env, { fetchFn });
    const body = await res.json();
    expect(body.webhook).toMatchObject({ ok: true });
    expect(calls[0]).toMatchObject({ method: 'setWebhook', params: { url: expect.stringContaining('/api/bot/telegram/webhook'), secret_token: await webhookSecret(TOKEN) } });
    expect(JSON.stringify(body)).not.toContain(TOKEN);
  });
});
