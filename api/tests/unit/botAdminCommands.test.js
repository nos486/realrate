/**
 * botAdminCommands.test.js — The admin's commands in the Telegram bot: report, finding users,
 * managing one with buttons, who may use them, and the daily report — on real SQLite with a fake Bot API
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sqliteD1 } from '../helpers/sqliteD1.js';
import { resetD1SchemaCache } from '../../src/repositories/d1Schema.js';

vi.mock('../../src/lib/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
  isUserAdmin: (email) => email === 'admin@example.com',
}));
const { saveBotConfig } = await import('../../src/services/bot/botConfig.service.js');
const { handleBotUpdate } = await import('../../src/services/bot/adminChat.service.js');
const { sendDailyReport } = await import('../../src/services/bot/dailyReport.service.js');
const { BOT_FEATURES } = await import('../../src/services/bot/bot.service.js');
const repo = await import('../../src/repositories/userGroups.repository.js');

const TOKEN = '123456789:AAFakeTokenFakeTokenFakeTokenFake_12';
const ADMIN = { id: 777, username: 'Sina_Admin' };

function fakeApi() {
  const calls = [];
  const fetchFn = vi.fn(async (url, init) => {
    calls.push({ method: url.split('/').pop(), params: JSON.parse(init.body) });
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
  for (const [id, email, name] of [['u1', 'ali@example.com', 'Ali'], ['u2', 'sara@example.com', 'Sara'], ['adm', 'admin@example.com', 'Boss']]) {
    await env.DB.prepare('INSERT INTO users (id, email, name, created_at, last_login) VALUES (?, ?, ?, ?, ?)').bind(id, email, name, now, now).run();
  }
  await saveBotConfig(env, { token: TOKEN, channel: '@realrate_news', enabled: true, adminUsername: 'sina_admin' });
  await handleBotUpdate(env, { message: { chat: { id: 555, type: 'private' }, from: ADMIN, text: '/start' } }, { fetchFn: fakeApi().fetchFn });
});

const say = async (text, from = ADMIN) => {
  const api = fakeApi();
  await handleBotUpdate(env, { message: { chat: { id: 555, type: 'private' }, from, text } }, { fetchFn: api.fetchFn });
  return api.calls;
};
const press = async (data, from = ADMIN) => {
  const api = fakeApi();
  await handleBotUpdate(env, { callback_query: { id: 'cb', from, data, message: { chat: { id: 555 }, message_id: 9, text: 'x' } } }, { fetchFn: api.fetchFn });
  return api.calls;
};

describe('commands', () => {
  it('/start sets up the command menu for the admin', async () => {
    const api = fakeApi();
    await handleBotUpdate(env, { message: { chat: { id: 555, type: 'private' }, from: ADMIN, text: '/start' } }, { fetchFn: api.fetchFn });
    const menu = api.calls.find((c) => c.method === 'setMyCommands');
    expect(menu.params.scope).toEqual({ type: 'chat', chat_id: 555 });
    expect(menu.params.commands.map((c) => c.command)).toContain('report');
  });

  it('/report gives the counts and the last 7 days', async () => {
    const [sent] = await say('/report');
    expect(sent.method).toBe('sendMessage');
    expect(sent.params.text).toContain('کاربران');
    expect(sent.params.text).toContain('۳');
  });

  it('someone who is not the linked admin gets no answer', async () => {
    expect(await say('/report', { id: 1, username: 'Sina_Admin' })).toHaveLength(0);
    expect(await say('/users', { id: 2, username: 'stranger' })).toHaveLength(0);
  });

  it('/users lists and searches, with a button per user', async () => {
    const [all] = await say('/users');
    expect(all.params.reply_markup.inline_keyboard).toHaveLength(3);
    const [found] = await say('/users sara');
    expect(found.params.reply_markup.inline_keyboard).toHaveLength(1);
    expect(found.params.reply_markup.inline_keyboard[0][0]).toMatchObject({ callback_data: 'uv:u2' });
  });

  it('/user opens one user\'s card with block, sign-out and group buttons', async () => {
    const [card] = await say('/user ali@example.com');
    expect(card.params.text).toContain('ali@example.com');
    const data = card.params.reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
    expect(data).toEqual(expect.arrayContaining(['ub:u1', 'us:u1']));
    expect(data.some((d) => d.startsWith('ug:pro:'))).toBe(true);
    data.forEach((d) => expect(d.length).toBeLessThanOrEqual(64));
  });

  it('blocking ends the sessions and the card shows the new state; unblocking undoes it', async () => {
    await env.DB.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind('t1', 'u1', Date.now(), Date.now() + 1e9).run().catch(() => {});
    const calls = await press('ub:u1');
    expect(calls.find((c) => c.method === 'editMessageText').params.text).toContain('🚫 مسدود');
    const { dbGetUserDetail } = await import('../../src/repositories/admin.repository.js');
    expect((await dbGetUserDetail(env, 'u1')).disabled).toBe(true);
    await press('uu:u1');
    expect((await dbGetUserDetail(env, 'u1')).disabled).toBe(false);
  });

  it('an admin account cannot be blocked', async () => {
    await press('ub:adm');
    const { dbGetUserDetail } = await import('../../src/repositories/admin.repository.js');
    expect((await dbGetUserDetail(env, 'adm')).disabled).toBe(false);
  });

  it('the group button toggles membership', async () => {
    await press('ug:pro:u1');
    expect(await repo.dbGetUserGroupKeys(env, 'u1')).toEqual(['pro']);
    await press('ug:pro:u1');
    expect(await repo.dbGetUserGroupKeys(env, 'u1')).toEqual([]);
  });

  it('opening a card from a list sends a new message; a stranger\'s press does nothing', async () => {
    expect((await press('uv:u1')).some((c) => c.method === 'sendMessage')).toBe(true);
    const calls = await press('ub:u2', { id: 5, username: 'x' });
    expect(calls).toHaveLength(1);
    expect(calls[0].params.text).toContain('دسترسی ندارید');
  });

  it('/requests re-sends the pending requests with approve / reject buttons', async () => {
    await repo.dbCreateGroupRequest(env, 'grp_pro', 'u2', 'سلام');
    const calls = await say('/requests');
    const ask = calls.find((c) => c.params.reply_markup?.inline_keyboard[0][0].callback_data.startsWith('a:'));
    expect(ask.params.text).toContain('sara@example.com');
  });
});

describe('the daily report', () => {
  const at = (hourTehran) => Date.parse(`2026-10-16T${String(hourTehran - 4).padStart(2, '0')}:00:00Z`);

  it('is a bot feature', () => {
    expect(BOT_FEATURES.map((f) => f.id)).toContain('daily-report');
  });

  it('is sent once per Tehran day, after 21:00, only when switched on', async () => {
    const api = fakeApi();
    await sendDailyReport(env, { now: at(22), fetchFn: api.fetchFn });
    expect(api.calls).toHaveLength(0); // off
    await saveBotConfig(env, { dailyReport: true });
    await sendDailyReport(env, { now: at(20), fetchFn: api.fetchFn });
    expect(api.calls).toHaveLength(0); // too early
    await sendDailyReport(env, { now: at(22), fetchFn: api.fetchFn });
    await sendDailyReport(env, { now: at(23), fetchFn: api.fetchFn });
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0].params.chat_id).toBe('555');
  });
});
