// @vitest-environment happy-dom
/**
 * subscriptionReminders.test.jsx — A subscription's renewal reminders on the device: the Android
 * notifications (and the sealed web push, the same plan: dueNotifications.js) and the alert
 * center's alerts (alertRules.js subscriptionAlerts)
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../web/src/shared/native/nativeApp.js', () => ({ isNativeApp: () => true }));

const { planDueNotifications } = await import('../../../web/src/shared/native/dueNotifications.js');
const { subscriptionAlerts } = await import('../../../web/src/shared/alerts/alertRules.js');

// 2026-01-12 is 22 Dey 1404: renewals on the 22nd of each Shamsi month (2026-02-11, 2026-03-13, …)
const auto = { id: 'sub_auto', name: 'ChatGPT', amount: 20, currency: 'USD', cycleMonths: 1, startDate: '2026-01-12', autoRenew: true, status: 'active' };
const manual = { id: 'sub_manual', name: 'فیلیمو', amount: 149_000, currency: 'IRT', cycleMonths: 3, startDate: '2025-11-11', autoRenew: false, renewOn: '2026-02-11', status: 'active' };
const plan = (subscriptions, today, now) => planDueNotifications({
  subscriptions, today, now: new Date(`${now}T08:00:00`), settings: { enabled: true, leadDays: [1, 0], showAmount: true },
});

describe('subscription notifications', () => {
  it('renewing by itself: the day before and the day of each renewal, never «overdue»', () => {
    const planned = plan([auto], '2026-02-05', '2026-02-05');
    expect(planned.every((n) => n.kind === 'subscription' && n.extra.path === '/subscriptions')).toBe(true);
    expect(planned.some((n) => n.reason === 'overdue')).toBe(false);
    const first = planned.filter((n) => n.dueDate === '2026-02-11');
    expect(first.map((n) => n.reason).sort()).toEqual(['due', 'lead']);
    expect(first.find((n) => n.reason === 'lead')).toMatchObject({ title: 'اشتراک فردا تمدید می‌شود', body: 'ChatGPT — ۲۰ دلار' });
    // Planned 30 days ahead: the next one (2026-03-13) comes with a later plan
    expect(planned.some((n) => n.dueDate === '2026-03-13')).toBe(false);
    expect(plan([auto], '2026-02-20', '2026-02-20').some((n) => n.dueDate === '2026-03-13')).toBe(true);
  });

  it('renewed by hand: it runs out, and the morning after it is overdue', () => {
    const planned = plan([manual], '2026-02-05', '2026-02-05');
    expect(planned.find((n) => n.reason === 'due')).toMatchObject({ title: 'اشتراک امروز تمام می‌شود', body: 'فیلیمو — ۱۴۹٬۰۰۰ تومان' });
    expect(planned.find((n) => n.reason === 'overdue')).toMatchObject({ dueDate: '2026-02-11', title: 'اشتراک تمدید نشده و تمام شده است' });
  });

  it('none for a paused one or one with its reminders off', () => {
    expect(plan([{ ...auto, status: 'paused' }, { ...manual, remindersMuted: true }], '2026-02-05', '2026-02-05')).toEqual([]);
  });
});

describe('subscription alerts', () => {
  it('renewals within a week, and those run out, each a group', () => {
    const alerts = subscriptionAlerts([auto, { ...manual, renewOn: '2026-02-03' }], '2026-02-05', { usdToman: 100_000 });
    const expired = alerts.find((a) => a.id === 'subscription:expired');
    const upcoming = alerts.find((a) => a.id === 'subscription:upcoming');
    expect(expired).toMatchObject({ source: 'subscription', severity: 'critical' });
    expect(expired.items.map((i) => i.title)).toEqual(['فیلیمو']);
    expect(upcoming).toMatchObject({ severity: 'warning', dueDate: '2026-02-11' });
    // A dollar subscription counts in tomans at the rate, its dollars in the detail
    expect(upcoming.items[0]).toMatchObject({ title: 'ChatGPT', amount: 2_000_000 });
    expect(upcoming.items[0].detail).toContain('۲۰ دلار');
  });

  it('nothing further off than a week, nor for muted, paused or cancelled ones', () => {
    expect(subscriptionAlerts([auto], '2026-02-12')).toEqual([]);
    expect(subscriptionAlerts([{ ...auto, remindersMuted: true }, { ...auto, id: 'x', status: 'paused' }, { ...auto, id: 'y', status: 'cancelled' }], '2026-02-05')).toEqual([]);
  });
});
