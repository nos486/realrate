/**
 * calendarEvents.js — The dated things the calendar widget marks: loan installments, open cheques,
 * subscription renewals and the target dates of unfinished goals
 *
 * Pure: the decrypted records in, the events of a day window out. Loans, cheques and subscriptions
 * use the same schedule as their reminders (utils/reminders.js), so the calendar and the alerts
 * never disagree about a due day.
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
 * @returns {Map<string, Array<{ key: string, kind: string, title: string, recordId: string }>>}
 *   events by day, each day's in CALENDAR_EVENT_KINDS order
 */
export function calendarEvents({ loans = [], cheques = [], subscriptions = [], goals = [], reachedGoal = () => false, today, from, to }) {
  const byDay = new Map();
  const add = (day, kind, recordId, title) => {
    if (!isDay(day)) return;
    const list = byDay.get(day) || [];
    list.push({ key: `${kind}:${recordId}:${day}`, kind, title: String(title || '').trim(), recordId });
    byDay.set(day, list);
  };
  const scheduled = (kind, records, titleOf) => {
    for (const record of records || []) {
      const reminder = reminderOf(kind, record, { today });
      if (!reminder) continue;
      for (const day of occurrencesBetween(reminder, from, to)) add(day, kind, reminder.recordId || record.id, titleOf(record));
    }
  };
  scheduled('loan', loans, (loan) => loan.title);
  scheduled('cheque', cheques, (cheque) => cheque.counterparty);
  scheduled('subscription', subscriptions, (sub) => sub.name);
  for (const goal of goals || []) {
    const day = String(goal?.targetDate || '');
    if (day >= from && day <= to && !reachedGoal(goal)) add(day, 'goal', goal.id, goal.name);
  }
  const rank = (e) => CALENDAR_EVENT_KINDS.indexOf(e.kind);
  for (const list of byDay.values()) list.sort((a, b) => rank(a) - rank(b));
  return byDay;
}
