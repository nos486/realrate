/**
 * i18nAlerts.test.js — Alerts and due notifications read in English (and unchanged in Persian)
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { registerMessages, setActiveLocale } from '../../src/domain/i18n.js';
import alertsEn from '../../../web/src/i18n/en/alerts.js';
import commonEn from '../../../web/src/i18n/en/common.js';
import { loanAlerts } from '../../../web/src/shared/alerts/alertRules.js';
import { planDueNotifications } from '../../../web/src/shared/native/dueNotifications.js';

const loans = [{ id: 'l1', title: 'Car', nextDueInstallment: { dueDate: '2025-01-05', installmentNumber: 3, totalAmount: 1000 } }];

describe('alerts in English', () => {
  beforeEach(() => {
    registerMessages('en', { ...commonEn, ...alertsEn });
  });
  afterEach(() => setActiveLocale('fa'));

  it('keeps the Persian wording in Persian', () => {
    const [alert] = loanAlerts(loans, '2025-01-10');
    expect(alert.title).toBe('۱ قسط معوق');
    expect(alert.action.label).toBe('مشاهده و تسویه');
  });

  it('words an overdue installment alert in English, singular and plural', () => {
    setActiveLocale('en');
    const [alert] = loanAlerts(loans, '2025-01-10');
    expect(alert.title).toBe('1 overdue installment');
    expect(alert.action.label).toBe('View and settle');
    expect(alert.items[0].detail).toContain('Installment 3');
    expect(alert.items[0].detail).toContain('5 days ago');
    const two = loanAlerts([...loans, { ...loans[0], id: 'l2' }], '2025-01-10')[0];
    expect(two.title).toBe('2 overdue installments');
  });

  it('writes local notifications in English', () => {
    setActiveLocale('en');
    const soon = [{ id: 'ln', title: 'Car', nextDueInstallment: { id: 'i1', installmentNumber: 1, dueDate: '2025-01-11', totalAmount: 1000, isPaid: false }, totalCount: 12, paidCount: 0, intervalMonths: 1 }];
    const plan = planDueNotifications({ loans: soon, today: '2025-01-10', now: new Date('2025-01-10T05:00:00'), settings: { leadDays: [1, 0] } });
    expect(plan.map((n) => n.title)).toContain('A loan installment is due tomorrow');
    setActiveLocale('fa');
    const fa = planDueNotifications({ loans: soon, today: '2025-01-10', now: new Date('2025-01-10T05:00:00'), settings: { leadDays: [1, 0] } });
    expect(fa.map((n) => n.title)).toContain('قسط وام فردا سررسید می‌شود');
  });
});
