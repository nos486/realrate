/**
 * calendarEvents.js — The dated things the calendar widget marks: loan installments, open cheques,
 * subscription renewals and goal target dates
 *
 * Pure: the decrypted records in, the events of a day window out. One adapter per kind (EVENT_SOURCES)
 * reads that feature's records, so the calendar has a single place that knows what is dated; the
 * ones ahead follow the reminders' schedule (utils/reminders.js) where a record repeats, so the
 * calendar and the alerts do not disagree about a due day. An event also carries what it costs (an installment's amount, a
 * cheque's, a subscription's renewal in its own currency) so a day can say what is due, and its
 * `state`: still ahead («upcoming»), past and still owed («overdue») or finished («done»: a paid
 * installment, a closed cheque, a renewal that went through, a reached goal).
 */

import { reminderOf, occurrencesBetween } from '../../utils/reminders.js';
import { isChequeOpen } from '../../utils/chequeDocument.js';
import { renewalsBetween } from '../../utils/subscriptionDocument.js';

/** The kinds of events, in the order a day lists them */
export const CALENDAR_EVENT_KINDS = ['loan', 'cheque', 'subscription', 'goal'];

const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const dayOf = (v) => String(v || '').slice(0, 10);
const directionOf = (cheque) => (cheque.direction === 'received' ? 'received' : 'issued');

/**
 * The event sources: one adapter per kind, turning that feature's records into plain events
 * `{ day, recordId, title, amount?, currency?, direction?, done }` inside the window. A feature
 * with dated things adds its adapter here and a kind to CALENDAR_EVENT_KINDS; the calendar itself
 * knows nothing else about it. `ctx` is `{ today, from, to, reachedGoal }`.
 */
const EVENT_SOURCES = {
  // Every installment of the schedule, paid or not (the list of loans carries it), so the past
  // ones show as finished and each one has its own amount
  loan: (loans, { from, to }) => (loans || []).flatMap((loan) => (loan.installments || []).flatMap((installment) => {
    const day = dayOf(installment.dueDate);
    if (day < from || day > to) return [];
    const done = Boolean(installment.isPaid);
    return [{ day, recordId: loan.id, title: loan.title, amount: done ? installment.paidAmount || installment.totalAmount : installment.totalAmount, done }];
  })),
  // A cheque sits on its due day; a closed one is finished
  cheque: (cheques, { from, to }) => (cheques || []).flatMap((cheque) => {
    const day = dayOf(cheque.dueDate);
    if (day < from || day > to) return [];
    return [{ day, recordId: cheque.id, title: cheque.counterparty, amount: cheque.amount, direction: directionOf(cheque), done: !isChequeOpen(cheque) }];
  }),
  // The renewals ahead follow the reminders' schedule; the ones behind went through when the
  // subscription renews by itself or was paid up to that day
  subscription: (subscriptions, { today, from, to }) => (subscriptions || []).flatMap((sub) => {
    const events = [];
    const detail = { recordId: sub.id, title: sub.name, amount: sub.amount, currency: sub.currency || 'IRT' };
    const reminder = reminderOf('subscription', sub, { today });
    if (reminder) for (const day of occurrencesBetween(reminder, from, to)) events.push({ ...detail, day, recordId: reminder.recordId || sub.id, done: false });
    if (sub.status !== 'cancelled' && sub.status !== 'paused') {
      for (const day of renewalsBetween(sub, from, to < today ? to : today)) {
        if (day < today) events.push({ ...detail, day, done: Boolean(sub.autoRenew || (sub.lastPaidOn && day <= sub.lastPaidOn)) });
      }
    }
    return events;
  }),
  // A goal's target day, finished once it is reached
  goal: (goals, { from, to, reachedGoal }) => (goals || []).flatMap((goal) => {
    const day = dayOf(goal?.targetDate);
    return day >= from && day <= to ? [{ day, recordId: goal.id, title: goal.name, done: reachedGoal(goal) }] : [];
  }),
};

/** The input key each kind's records come in under */
const INPUT_OF = { loan: 'loans', cheque: 'cheques', subscription: 'subscriptions', goal: 'goals' };

/**
 * @param {{ loans?: object[], cheques?: object[], subscriptions?: object[], goals?: object[],
 *   reachedGoal?: (goal: object) => boolean, today: string, from: string, to: string }} input
 *   from/to: the window's first and last day (Gregorian YYYY-MM-DD); reachedGoal: whether a goal
 *   has reached its target (such a goal has no date to meet)
 * @returns {Map<string, Array<{ key: string, kind: string, title: string, recordId: string,
 *   amount: number|null, currency: string, direction: string, state: 'upcoming'|'overdue'|'done' }>>}
 *   events by day, each day's in CALENDAR_EVENT_KINDS order; `direction` is a cheque's («issued» is
 *   paid by the user, «received» comes to them), else empty
 */
export function calendarEvents({ reachedGoal = () => false, today, from, to, ...records }) {
  const byDay = new Map();
  const ctx = { today, from, to, reachedGoal };
  for (const kind of CALENDAR_EVENT_KINDS) {
    for (const { day, recordId, title, amount = null, currency = 'IRT', direction = '', done = false } of EVENT_SOURCES[kind](records[INPUT_OF[kind]], ctx)) {
      if (!isDay(day)) continue;
      const key = `${kind}:${recordId}:${day}`;
      const list = byDay.get(day) || [];
      if (list.some((e) => e.key === key)) continue;
      const value = Number(amount);
      list.push({
        key, kind, title: String(title || '').trim(), recordId,
        amount: Number.isFinite(value) && value > 0 ? value : null, currency, direction,
        state: done ? 'done' : day < today ? 'overdue' : 'upcoming',
      });
      byDay.set(day, list);
    }
  }
  // Open things first, finished ones after, each in the order of the kinds
  const rank = (e) => (e.state === 'done' ? CALENDAR_EVENT_KINDS.length : 0) + CALENDAR_EVENT_KINDS.indexOf(e.kind);
  for (const list of byDay.values()) list.sort((a, b) => rank(a) - rank(b));
  return byDay;
}
