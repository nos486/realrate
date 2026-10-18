/**
 * calendarEvents.js — The dated things the calendar widget marks: loan installments, open cheques,
 * subscription renewals and the target dates of unfinished goals
 *
 * Pure: the decrypted records in, the events of a day window out. Loans, cheques and subscriptions
 * use the same schedule as their reminders (utils/reminders.js), so the calendar and the alerts
 * never disagree about a due day. An event also carries what it costs (an installment's amount, a
 * cheque's, a subscription's renewal in its own currency) so a day can say what is due.
 */

import { reminderOf, occurrencesBetween } from '../../utils/reminders.js';

/** The kinds of events, in the order a day lists them */
export const CALENDAR_EVENT_KINDS = ['loan', 'cheque', 'subscription', 'goal'];

const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

/**
 * @param {{ loans?: object[], cheques?: object[], subscriptions?: object[], goals?: object[],
 *   reachedGoal?: (goal: object) => boolean, today: string, from: string, to: string }} input
 *   from/to: the window's first and last day (Gregorian YYYY-MM-DD); reachedGoal: whether a goal
 *   has reached its target (such a goal has no date to meet)
 * @returns {Map<string, Array<{ key: string, kind: string, title: string, recordId: string,
 *   amount: number|null, currency: string, direction: string }>>}
 *   events by day, each day's in CALENDAR_EVENT_KINDS order; `direction` is a cheque's («issued» is
 *   paid by the user, «received» comes to them), else empty
 */
export function calendarEvents({ loans = [], cheques = [], subscriptions = [], goals = [], reachedGoal = () => false, today, from, to }) {
  const byDay = new Map();
  const add = (day, kind, recordId, title, { amount = null, currency = 'IRT', direction = '' } = {}) => {
    if (!isDay(day)) return;
    const list = byDay.get(day) || [];
    const value = Number(amount);
    list.push({
      key: `${kind}:${recordId}:${day}`, kind, title: String(title || '').trim(), recordId,
      amount: Number.isFinite(value) && value > 0 ? value : null, currency, direction,
    });
    byDay.set(day, list);
  };
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
    if (day >= from && day <= to && !reachedGoal(goal)) add(day, 'goal', goal.id, goal.name);
  }
  const rank = (e) => CALENDAR_EVENT_KINDS.indexOf(e.kind);
  for (const list of byDay.values()) list.sort((a, b) => rank(a) - rank(b));
  return byDay;
}
