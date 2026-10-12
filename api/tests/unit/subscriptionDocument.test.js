/**
 * subscriptionDocument.test.js — Subscriptions: validation, renewals on the Shamsi day of the
 * month, where one stands today, how far through its current period it is, the monthly totals (tomans and dollars), renewing by hand, and
 * the reminder row each one gives (reminders.js)
 */

import { describe, it, expect } from 'vitest';
import {
  validateSubscription, renewalAt, renewalsBetween, renewalOnOrAfter, renewedAfter,
  subscriptionView, subscriptionTotals, compareSubscriptions, subscriptionPeriod, duePayments,
} from '../../src/domain/subscriptionDocument.js';
import { reminderOf, reminderCanBeOverdue, occurrencesBetween, REMINDER_KINDS } from '../../src/domain/reminders.js';

const base = { name: 'Netflix', amount: 10, currency: 'USD', cycleMonths: 1, startDate: '2026-01-12', autoRenew: true };
const sub = (over = {}) => ({ id: 'sub_1', ...validateSubscription({ ...base, ...over }).value });

describe('validateSubscription', () => {
  it('normalizes a subscription', () => {
    const { value } = validateSubscription({ ...base, amount: '9.991', category: 'nope', accountId: 'acc_1' });
    expect(value).toMatchObject({ name: 'Netflix', amount: 9.99, currency: 'USD', cycleMonths: 1, category: 'other', autoRenew: true, renewOn: '', status: 'active', accountId: 'acc_1' });
  });

  it('a subscription renewed by hand runs to its first renewal unless told', () => {
    expect(validateSubscription({ ...base, autoRenew: false }).value.renewOn).toBe(renewalAt('2026-01-12', 1, 1));
    expect(validateSubscription({ ...base, autoRenew: false, renewOn: '2026-03-01' }).value.renewOn).toBe('2026-03-01');
  });

  it('rejects what is not a subscription', () => {
    expect(validateSubscription({ ...base, name: ' ' }).error).toBeTruthy();
    expect(validateSubscription({ ...base, amount: 0 }).error).toBeTruthy();
    expect(validateSubscription({ ...base, cycleMonths: 2 }).error).toBeTruthy();
    expect(validateSubscription({ ...base, startDate: '2026-02-30' }).error).toBeTruthy();
    expect(validateSubscription({ ...base, endDate: '2026-01-01' }).error).toBeTruthy();
    expect(validateSubscription({ ...base, url: 'javascript:alert(1)' }).error).toBeTruthy();
  });

  it('keeps the day it was cancelled only when cancelled', () => {
    expect(validateSubscription({ ...base, status: 'cancelled', cancelledOn: '2026-05-01' }).value.cancelledOn).toBe('2026-05-01');
    expect(validateSubscription({ ...base, status: 'active', cancelledOn: '2026-05-01' }).value.cancelledOn).toBe('');
  });
});

describe('renewals', () => {
  it('fall on the start\'s Shamsi day of the month, every cycle', () => {
    // 2026-01-12 is 22 Dey 1404: the 22nd of each Shamsi month
    expect(renewalsBetween(sub(), '2026-01-12', '2026-04-30')).toEqual(['2026-01-12', '2026-02-11', '2026-03-13', '2026-04-11']);
    expect(renewalsBetween(sub({ cycleMonths: 3 }), '2026-01-01', '2026-12-31')).toHaveLength(4);
  });

  it('stop before its end day', () => {
    const s = sub({ endDate: '2026-03-13' });
    expect(renewalsBetween(s, '2026-01-01', '2026-12-31')).toEqual(['2026-01-12', '2026-02-11']);
    expect(renewalOnOrAfter(s, '2026-02-12')).toBe('');
  });

  it('a payment moves one renewed by hand a cycle on', () => {
    const s = sub({ autoRenew: false, renewOn: '2026-02-11' });
    expect(renewedAfter(s, '2026-02-10')).toEqual({ renewOn: '2026-03-13', lastPaidOn: '2026-02-10' });
    expect(renewedAfter(sub(), '2026-02-10')).toEqual({ renewOn: '', lastPaidOn: '2026-02-10' });
  });

  it('paid after it ran out, the new period starts on the payment day', () => {
    // 2026-02-20 is 1 Esfand: a month later is 1 Farvardin (2026-03-21)
    const s = sub({ autoRenew: false, renewOn: '2026-02-11' });
    expect(renewedAfter(s, '2026-02-20')).toEqual({ renewOn: '2026-03-21', lastPaidOn: '2026-02-20' });
  });
});

describe('subscriptionView', () => {
  it('renewing by itself: the next renewal on or after today', () => {
    expect(subscriptionView(sub(), '2026-02-05')).toMatchObject({ state: 'due', nextRenewal: '2026-02-11', daysLeft: 6, running: true, monthly: 10 });
    expect(subscriptionView(sub(), '2026-02-12')).toMatchObject({ state: 'active', nextRenewal: '2026-03-13' });
  });

  it('renewed by hand: past its day it has run out, and no longer counts', () => {
    const view = subscriptionView(sub({ autoRenew: false, renewOn: '2026-02-11' }), '2026-02-14');
    expect(view).toMatchObject({ state: 'expired', daysLeft: -3, running: false });
  });

  it('paused, ended and cancelled ones have no renewal', () => {
    expect(subscriptionView(sub({ status: 'paused' }), '2026-02-05')).toMatchObject({ state: 'paused', nextRenewal: '', running: false });
    expect(subscriptionView(sub({ endDate: '2026-02-01' }), '2026-02-05')).toMatchObject({ state: 'ended', running: false });
    expect(subscriptionView(sub({ status: 'cancelled' }), '2026-02-05')).toMatchObject({ state: 'cancelled', running: false });
  });

  it('says when it ends soon', () => {
    expect(subscriptionView(sub({ endDate: '2026-02-09' }), '2026-02-05').endsSoon).toBe(true);
    expect(subscriptionView(sub({ endDate: '2026-06-01' }), '2026-02-05').endsSoon).toBe(false);
  });
});

describe('subscriptionTotals', () => {
  const subs = [
    { ...sub(), id: 'a' }, // $10 a month
    { ...sub({ amount: 1_200_000, currency: 'IRT', cycleMonths: 12, category: 'internet' }), id: 'b' }, // 100,000 a month
    { ...sub({ amount: 300_000, currency: 'IRT', status: 'paused' }), id: 'c' }, // not counted
  ];

  it('counts what is running as a monthly equivalent, dollars at the rate', () => {
    const t = subscriptionTotals(subs, { today: '2026-02-05', usdToman: 100_000 });
    expect(t.count).toBe(2);
    expect(t.monthly).toEqual({ IRT: 100_000, USD: 10, EUR: 0, TRY: 0, AED: 0, toman: 1_100_000 });
    expect(t.yearly.toman).toBe(13_200_000);
    expect(t.byCategory.map((c) => c.category)).toEqual(['other', 'internet']);
  });

  it('sums the renewals of a month', () => {
    // Bahman 1404: 2026-01-21 .. 2026-02-19 — the dollar one renews on 2026-02-11
    const t = subscriptionTotals(subs, { today: '2026-02-05', usdToman: 100_000, monthFrom: '2026-01-21', monthTo: '2026-02-19' });
    expect(t.month).toMatchObject({ count: 1, IRT: 0, USD: 10, toman: 1_000_000 });
  });

  it('lists the soonest renewal first, then those without one', () => {
    const order = [...subs].sort(compareSubscriptions('2026-02-05')).map((s) => s.id);
    expect(order).toEqual(['a', 'b', 'c']);
  });
});

describe('the reminder row of a subscription', () => {
  it('is a reminder kind', () => {
    expect(REMINDER_KINDS).toContain('subscription');
  });

  it('renewing by itself: repeats every cycle, never overdue', () => {
    const rem = reminderOf('subscription', sub(), { today: '2026-02-05' });
    expect(rem).toMatchObject({ kind: 'subscription', recordId: 'sub_1', dueDate: '2026-02-11', intervalMonths: 1, remaining: null });
    expect(reminderCanBeOverdue(rem)).toBe(false);
    expect(occurrencesBetween(rem, '2026-02-05', '2026-03-31')).toEqual(['2026-02-11', '2026-03-13']);
  });

  it('with an end day: only the renewals before it', () => {
    const rem = reminderOf('subscription', sub({ endDate: '2026-04-01' }), { today: '2026-02-05' });
    expect(rem.remaining).toBe(2);
  });

  it('renewed by hand: the day it runs out, overdue past it', () => {
    const rem = reminderOf('subscription', sub({ autoRenew: false, renewOn: '2026-02-11' }), { today: '2026-02-14' });
    expect(rem).toMatchObject({ dueDate: '2026-02-11', intervalMonths: 0, remaining: 1 });
    expect(reminderCanBeOverdue(rem)).toBe(true);
  });

  it('none for one that is paused, ended or cancelled; muted when its reminders are off', () => {
    expect(reminderOf('subscription', sub({ status: 'paused' }), { today: '2026-02-05' })).toBeNull();
    expect(reminderOf('subscription', sub({ status: 'cancelled' }), { today: '2026-02-05' })).toBeNull();
    expect(reminderOf('subscription', sub({ endDate: '2026-02-01' }), { today: '2026-02-05' })).toBeNull();
    expect(reminderOf('subscription', sub({ remindersMuted: true }), { today: '2026-02-05' }).muted).toBe(true);
  });
});

describe('subscriptionPeriod', () => {
  it('runs from the last renewal to the next one', () => {
    // Renewals on the 22nd of each Shamsi month: 2026-01-12, then 2026-02-11
    expect(subscriptionPeriod(sub(), '2026-02-05')).toEqual({
      from: '2026-01-12', to: '2026-02-11', until: 'renewal', daysLeft: 6, totalDays: 30, progress: 0.8,
    });
  });

  it('runs to the end date when the subscription ends before its next renewal', () => {
    const period = subscriptionPeriod(sub({ endDate: '2026-02-08' }), '2026-02-05');
    expect(period).toMatchObject({ from: '2026-01-12', to: '2026-02-08', until: 'end', daysLeft: 3 });
  });

  it('is gone by once a hand renewal has run out', () => {
    const period = subscriptionPeriod(sub({ autoRenew: false, renewOn: '2026-02-03', cycleMonths: 3, startDate: '2025-11-11' }), '2026-02-05');
    expect(period).toMatchObject({ to: '2026-02-03', until: 'renewal', daysLeft: -2, progress: 1 });
  });

  it('has not begun before the start, and is none when paused, cancelled or ended', () => {
    expect(subscriptionPeriod(sub({ startDate: '2026-03-01' }), '2026-02-05')).toMatchObject({ to: '2026-03-01', progress: 0 });
    expect(subscriptionPeriod(sub({ status: 'paused' }), '2026-02-05')).toBeNull();
    expect(subscriptionPeriod(sub({ status: 'cancelled' }), '2026-02-05')).toBeNull();
    expect(subscriptionPeriod(sub({ endDate: '2026-02-01' }), '2026-02-05')).toBeNull();
  });
});

describe('duePayments', () => {
  const auto = sub();
  it('a new one: only the payment of its current period, never a backlog', () => {
    expect(duePayments(auto, '2026-01-12')).toEqual(['2026-01-12']);
    expect(duePayments(auto, '2026-04-01')).toEqual(['2026-03-13']);
    expect(duePayments(sub({ autoRenew: false, renewOn: '2026-02-11' }), '2026-01-20')).toEqual(['2026-01-12']);
  });

  it('one that renews by itself: every renewal after the last recorded, through today', () => {
    expect(duePayments({ ...auto, lastPaidOn: '2026-01-12' }, '2026-04-01')).toEqual(['2026-02-11', '2026-03-13']);
    expect(duePayments({ ...auto, lastPaidOn: '2026-03-13' }, '2026-04-01')).toEqual([]);
    // Renewed by hand: later payments are the user's
    expect(duePayments(sub({ autoRenew: false, lastPaidOn: '2026-01-12' }), '2026-04-01')).toEqual([]);
  });

  it('nothing before its start, on or after its end, or while paused or cancelled', () => {
    expect(duePayments(sub({ startDate: '2026-05-01' }), '2026-04-01')).toEqual([]);
    expect(duePayments(sub({ endDate: '2026-02-11' }), '2026-04-01')).toEqual(['2026-01-12']);
    expect(duePayments(sub({ status: 'paused' }), '2026-04-01')).toEqual([]);
    expect(duePayments(sub({ status: 'cancelled' }), '2026-04-01')).toEqual([]);
  });
});
