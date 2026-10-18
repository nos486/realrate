/**
 * calendarEvents.js — The dated things the calendar widget marks: loan installments, open cheques,
 * subscription renewals and goal target dates
 *
 * Pure: the decrypted records in, the events of a day window out. Loans, cheques and subscriptions
 * use the same schedule as their reminders (utils/reminders.js), so the calendar and the alerts
 * never disagree about a due day. An event also carries what it costs (an installment's amount, a
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
export function calendarEvents({ loans = [], cheques = [], subscriptions = [], goals = [], reachedGoal = () => false, today, from, to }) {
  const byDay = new Map();
  const add = (day, kind, recordId, title, { amount = null, currency = 'IRT', direction = '', done = false } = {}) => {
    if (!isDay(day)) return;
    const key = `${kind}:${recordId}:${day}`;
    const list = byDay.get(day) || [];
    if (list.some((e) => e.key === key)) return;
    const value = Number(amount);
    list.push({
      key, kind, title: String(title || '').trim(), recordId,
      amount: Number.isFinite(value) && value > 0 ? value : null, currency, direction,
      state: done ? 'done' : day < today ? 'overdue' : 'upcoming',
    });
    byDay.set(day, list);
  };
  const inWindow = (day) => isDay(day) && day >= from && day <= to;
  const scheduled = (kind, records, titleOf, detailOf) => {
    for (const record of records || []) {
      const reminder = reminderOf(kind, record, { today });
      if (!reminder) continue;
      for (const day of occurrencesBetween(reminder, from, to)) add(day, kind, reminder.recordId || record.id, titleOf(record), detailOf(record, day));
    }
  };
  // An installment's amount is its own when the schedule is there; the next one's on its own day
  const installmentAmount = (loan, day) => {
    const own = (loan.installments || []).find((i) => !i.isPaid && String(i.dueDate || '').slice(0, 10) === day);
    if (own) return own.totalAmount;
    const next = loan.nextDueInstallment;
    return next && String(next.dueDate || '').slice(0, 10) === day ? next.totalAmount ?? next.amount : null;
  };
  scheduled('loan', loans, (loan) => loan.title, (loan, day) => ({ amount: installmentAmount(loan, day) }));
  scheduled('cheque', cheques, (cheque) => cheque.counterparty, (cheque) => ({ amount: cheque.amount, direction: cheque.direction === 'received' ? 'received' : 'issued' }));
  scheduled('subscription', subscriptions, (sub) => sub.name, (sub) => ({ amount: sub.amount, currency: sub.currency || 'IRT' }));
  for (const goal of goals || []) {
    const day = String(goal?.targetDate || '');
    if (day >= from && day <= to) add(day, 'goal', goal.id, goal.name, { done: reachedGoal(goal) });
  }
  // What is already behind: paid installments, closed cheques and the renewals that went through
  for (const loan of loans || []) {
    for (const installment of loan.installments || []) {
      const day = String(installment.dueDate || '').slice(0, 10);
      if (installment.isPaid && inWindow(day)) add(day, 'loan', loan.id, loan.title, { amount: installment.paidAmount || installment.totalAmount, done: true });
    }
  }
  for (const cheque of cheques || []) {
    if (!isChequeOpen(cheque) && inWindow(String(cheque.dueDate || ''))) {
      add(cheque.dueDate, 'cheque', cheque.id, cheque.counterparty, { amount: cheque.amount, direction: cheque.direction === 'received' ? 'received' : 'issued', done: true });
    }
  }
  for (const sub of subscriptions || []) {
    if (sub.status === 'cancelled' || sub.status === 'paused') continue;
    for (const day of renewalsBetween(sub, from, to < today ? to : today)) {
      if (day >= today) continue;
      add(day, 'subscription', sub.id, sub.name, { amount: sub.amount, currency: sub.currency || 'IRT', done: Boolean(sub.autoRenew || (sub.lastPaidOn && day <= sub.lastPaidOn)) });
    }
  }
  // Open things first, finished ones after, each in the order of the kinds
  const rank = (e) => (e.state === 'done' ? CALENDAR_EVENT_KINDS.length : 0) + CALENDAR_EVENT_KINDS.indexOf(e.kind);
  for (const list of byDay.values()) list.sort((a, b) => rank(a) - rank(b));
  return byDay;
}
