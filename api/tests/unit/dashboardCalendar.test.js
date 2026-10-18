/**
 * dashboardCalendar.test.js — The dated events the calendar widget marks: they follow the same
 * schedule as the reminders, skip finished records and reached goals, and list by day
 */
import { describe, it, expect } from 'vitest';
import { calendarEvents, CALENDAR_EVENT_KINDS } from '../../../web/src/features/dashboard/calendarEvents.js';

const window = { today: '2026-03-01', from: '2026-03-01', to: '2026-03-31' };
const cheque = (over = {}) => ({ id: 'c1', counterparty: 'Ali', amount: 5, direction: 'issued', status: 'pending', dueDate: '2026-03-10', ...over });

describe('calendarEvents', () => {
  it('marks an open cheque on its due day and skips one outside the window', () => {
    const events = calendarEvents({ ...window, cheques: [cheque(), cheque({ id: 'c2', dueDate: '2026-04-20' })] });
    expect([...events.keys()]).toEqual(['2026-03-10']);
    expect(events.get('2026-03-10')[0]).toMatchObject({ kind: 'cheque', title: 'Ali', recordId: 'c1' });
  });

  it('marks a goal on its target day unless it is reached', () => {
    const goals = [{ id: 'g1', name: 'Car', targetDate: '2026-03-15' }, { id: 'g2', name: 'Trip', targetDate: '2026-03-15' }];
    const events = calendarEvents({ ...window, goals, reachedGoal: (g) => g.id === 'g2' });
    expect(events.get('2026-03-15').map((e) => e.title)).toEqual(['Car']);
  });

  it('lists a day\'s events by kind', () => {
    const goals = [{ id: 'g1', name: 'Car', targetDate: '2026-03-10' }];
    const kinds = calendarEvents({ ...window, goals, cheques: [cheque()] }).get('2026-03-10').map((e) => e.kind);
    expect(kinds).toEqual(['cheque', 'goal']);
    expect(CALENDAR_EVENT_KINDS).toEqual(['loan', 'cheque', 'subscription', 'goal']);
  });

  it('is empty without records', () => {
    expect(calendarEvents(window).size).toBe(0);
  });
});
