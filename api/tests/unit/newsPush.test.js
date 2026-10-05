/**
 * newsPush.test.js — important news reaches the browsers that asked for it: one notification for
 * the run's fresh important news, at most every few minutes, expired subscriptions dropped; the
 * per-browser switch; and which price a news item is about
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const sendWebPush = vi.fn();
vi.mock('../../src/lib/webPush.js', () => ({
  isWebPushConfigured: (env) => Boolean(env.VAPID_PUBLIC_KEY),
  sendWebPush: (...args) => sendWebPush(...args),
}));

import { notifyImportantNews, newsPushPayload } from '../../src/services/news/newsPush.service.js';
import { dbSavePushSubscription, dbGetNewsAlerts, dbSetNewsAlerts, dbGetNewsAlertSubscriptions } from '../../src/repositories/push.repository.js';
import { resetD1SchemaCache } from '../../src/repositories/d1Schema.js';
import { NEWS_PUSH } from '../../src/config/news.config.js';
import { sqliteD1 } from '../helpers/sqliteD1.js';

const NOW = Date.parse('2026-10-05T10:00:00Z');
const news = (id, importance, minutesAgo, title = `خبر ${id}`) => ({ id: `c/${id}`, title, summary: 'خلاصه', importance, publishedAt: NOW - minutesAgo * 60000 });
const subscription = (n) => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: 'p'.repeat(20), auth: 'a'.repeat(16) } });

describe('newsPushPayload', () => {
  it('only fresh important news; several make one notification', () => {
    expect(newsPushPayload([news(1, 2, 1), news(2, 3, NEWS_PUSH.freshMinutes + 5)], NOW)).toBeNull();
    const one = newsPushPayload([news(1, 3, 2, 'دلار جهش کرد')], NOW);
    expect(one).toMatchObject({ plain: 1, title: 'خبر مهم', path: '/news?open=c%2F1', tag: 'news' });
    expect(one.body).toBe('دلار جهش کرد\nخلاصه');
    const two = newsPushPayload([news(1, 3, 5), news(2, 3, 1)], NOW);
    expect(two.title).toBe('۲ خبر مهم');
    expect(two.path).toBe('/news?open=c%2F2');
  });
});

describe('notifyImportantNews', () => {
  let env;
  beforeEach(async () => {
    resetD1SchemaCache();
    sendWebPush.mockReset();
    env = { DB: sqliteD1(), VAPID_PUBLIC_KEY: 'k' };
    for (const n of [1, 2, 3]) await dbSavePushSubscription(env, `u${n}`, { deviceId: `device_${n}xx`, subscription: subscription(n) });
    await dbSetNewsAlerts(env, 'u1', 'device_1xx', true);
    await dbSetNewsAlerts(env, 'u2', 'device_2xx', true);
  });

  it('the switch is per browser and its owner', async () => {
    expect(await dbGetNewsAlerts(env, 'u1', 'device_1xx')).toEqual({ subscribed: true, enabled: true });
    expect(await dbGetNewsAlerts(env, 'u3', 'device_3xx')).toEqual({ subscribed: true, enabled: false });
    expect(await dbSetNewsAlerts(env, 'u1', 'device_3xx', true)).toBe(false);
    expect((await dbGetNewsAlertSubscriptions(env)).map((r) => r.device_id).sort()).toEqual(['device_1xx', 'device_2xx']);
  });

  it('sends to those who asked, drops an expired one, and waits before the next', async () => {
    sendWebPush.mockImplementation(async (_env, { subscription: sub }) => (String(sub).includes('/2') ? { success: false, expired: true } : { success: true }));
    expect(await notifyImportantNews(env, [news(1, 3, 1)], { now: NOW })).toEqual({ sent: 1, expired: 1 });
    expect(JSON.parse(sendWebPush.mock.calls[0][1].data)).toMatchObject({ plain: 1, title: 'خبر مهم' });
    expect(await dbGetNewsAlerts(env, 'u2', 'device_2xx')).toEqual({ subscribed: false, enabled: false });

    expect((await notifyImportantNews(env, [news(2, 3, 1)], { now: NOW + 60000 })).skipped).toBe('too-soon');
    expect((await notifyImportantNews(env, [news(3, 3, 0)], { now: NOW + NEWS_PUSH.minIntervalMinutes * 60000 })).sent).toBe(1);
  });

  it('nothing without important news or without VAPID keys', async () => {
    expect((await notifyImportantNews(env, [news(1, 2, 1)], { now: NOW })).skipped).toBe('none');
    expect((await notifyImportantNews({ ...env, VAPID_PUBLIC_KEY: '' }, [news(1, 3, 1)], { now: NOW })).skipped).toBe('not-configured');
    expect(sendWebPush).not.toHaveBeenCalled();
  });
});
