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

  it('marks a goal on its target day, finished once it is reached', () => {
    const goals = [{ id: 'g1', name: 'Car', targetDate: '2026-03-15' }, { id: 'g2', name: 'Trip', targetDate: '2026-03-15' }];
    const events = calendarEvents({ ...window, goals, reachedGoal: (g) => g.id === 'g2' });
    expect(events.get('2026-03-15').map((e) => [e.title, e.state])).toEqual([['Car', 'upcoming'], ['Trip', 'done']]);
  });

  it('lists a day\'s events by kind', () => {
    const goals = [{ id: 'g1', name: 'Car', targetDate: '2026-03-10' }];
    const kinds = calendarEvents({ ...window, goals, cheques: [cheque()] }).get('2026-03-10').map((e) => e.kind);
    expect(kinds).toEqual(['cheque', 'goal']);
    expect(CALENDAR_EVENT_KINDS).toEqual(['loan', 'cheque', 'subscription', 'goal']);
  });

  it('carries what each event costs and which way a cheque goes', () => {
    const subscriptions = [{ id: 's1', name: 'Music', amount: 9, currency: 'USD', cycleMonths: 1, startDate: '2026-01-10', autoRenew: true }];
    const events = calendarEvents({ ...window, subscriptions, cheques: [cheque({ amount: 500, direction: 'received' })] });
    expect(events.get('2026-03-10').find((e) => e.kind === 'cheque')).toMatchObject({ amount: 500, currency: 'IRT', direction: 'received' });
    expect(events.get('2026-03-11').find((e) => e.kind === 'subscription')).toMatchObject({ amount: 9, currency: 'USD', direction: '' });
  });

  it('gives a loan installment the amount of its own schedule', () => {
    const installments = [
      { isPaid: true, dueDate: '2026-02-10', totalAmount: 100 },
      { isPaid: false, dueDate: '2026-03-10', totalAmount: 120 },
      { isPaid: false, dueDate: '2026-04-08', totalAmount: 130 },
    ];
    const loans = [{ id: 'l1', title: 'Car loan', intervalMonths: 1, installments, nextDueInstallment: installments[1], totalCount: 3, paidCount: 1 }];
    const events = calendarEvents({ ...window, to: '2026-04-30', loans });
    expect(events.get('2026-03-10')[0]).toMatchObject({ kind: 'loan', amount: 120 });
    expect(events.get('2026-04-08')[0]).toMatchObject({ kind: 'loan', amount: 130 });
  });

  it('shows what is behind: paid installments, closed cheques and renewals that went through', () => {
    const now = { today: '2026-03-20', from: '2026-03-01', to: '2026-03-31' };
    const installments = [{ isPaid: true, dueDate: '2026-03-08', totalAmount: 100, paidAmount: 100 }, { isPaid: false, dueDate: '2026-04-08', totalAmount: 120 }];
    const loans = [{ id: 'l1', title: 'Car loan', intervalMonths: 1, installments, nextDueInstallment: installments[1], totalCount: 2, paidCount: 1 }];
    const subscriptions = [{ id: 's1', name: 'Music', amount: 9, currency: 'USD', cycleMonths: 1, startDate: '2026-01-10', autoRenew: true }];
    const events = calendarEvents({ ...now, loans, subscriptions, cheques: [cheque({ status: 'cleared', dueDate: '2026-03-05' })] });
    expect(events.get('2026-03-08')[0]).toMatchObject({ kind: 'loan', state: 'done', amount: 100 });
    expect(events.get('2026-03-05')[0]).toMatchObject({ kind: 'cheque', state: 'done', direction: 'issued' });
    expect(events.get('2026-03-11')[0]).toMatchObject({ kind: 'subscription', state: 'done' });
  });

  it('keeps what is owed past its day as overdue, and lists open things before finished ones', () => {
    const now = { today: '2026-03-20', from: '2026-03-01', to: '2026-03-31' };
    const events = calendarEvents({ ...now, cheques: [cheque({ dueDate: '2026-03-05' }), cheque({ id: 'c2', status: 'cleared', dueDate: '2026-03-05' })] });
    expect(events.get('2026-03-05').map((e) => [e.recordId, e.state])).toEqual([['c1', 'overdue'], ['c2', 'done']]);
  });

  it('is empty without records', () => {
    expect(calendarEvents(window).size).toBe(0);
  });
});
