// @vitest-environment happy-dom
/**
 * alerts.test.jsx — one alert system: the shape, the rules (loans, cheques, portfolio), the store
 * (dismissal by fingerprint), the email selection, and the banners / alert center
 */
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  createAlert, compareAlerts, alertFingerprint, selectForEmail, buildEmailDigest, summarizeAlerts,
} from '../../src/domain/alerts.js';
import { loanAlerts, chequeAlerts, portfolioAlerts } from '../../../web/src/shared/alerts/alertRules.js';
import { setSourceAlerts, dismissAlert, getAlerts, clearAlerts } from '../../../web/src/shared/alerts/alertStore.js';
import AlertStack from '../../../web/src/shared/alerts/AlertStack.jsx';
import AlertCenterButton from '../../../web/src/shared/alerts/AlertCenter.jsx';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigate }));

beforeEach(() => {
  localStorage.clear();
  clearAlerts();
  navigate.mockClear();
});
afterEach(cleanup);

const TODAY = '2026-10-02';
const loans = [
  { id: 'l1', title: 'وام مسکن', nextDueInstallment: { dueDate: '2026-09-28', installmentNumber: 3, totalAmount: 5_000_000 } },
  { id: 'l2', title: 'وام خودرو', nextDueInstallment: { dueDate: '2026-10-05', installmentNumber: 7, totalAmount: 2_000_000 } },
  { id: 'l3', title: 'وام دور', nextDueInstallment: { dueDate: '2026-11-20', installmentNumber: 1, totalAmount: 1 } },
];
const cheques = [
  { id: 'c1', direction: 'issued', counterparty: 'علی', amount: 10_000_000, dueDate: '2026-09-30', status: 'pending' },
  { id: 'c2', direction: 'received', counterparty: 'شرکت', amount: 3_000_000, dueDate: '2026-10-04', status: 'pending' },
  { id: 'c3', direction: 'issued', counterparty: 'پاس‌شده', amount: 1, dueDate: '2026-09-01', status: 'cleared' },
];

describe('the alert shape', () => {
  it('drops what is not an alert; sums the items; orders by severity then due date', () => {
    expect(createAlert({ id: 'x', source: 'nope', title: 't' })).toBeNull();
    expect(createAlert({ id: '', source: 'loan', title: 't' })).toBeNull();
    const a = createAlert({ id: 'a', source: 'loan', severity: 'warning', title: 'A', items: [{ key: 1, title: 'i', amount: 2 }, { key: 2, title: 'j', amount: 3 }], dueDate: '2026-10-05' });
    expect(a).toMatchObject({ amount: 5, severity: 'warning' });
    const b = createAlert({ id: 'b', source: 'cheque', severity: 'critical', title: 'B' });
    const c = createAlert({ id: 'c', source: 'loan', severity: 'warning', title: 'C', dueDate: '2026-10-03' });
    expect([a, b, c].sort(compareAlerts).map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(summarizeAlerts([a, b, c])).toMatchObject({ critical: 1, warning: 2, total: 3 });
  });
});

describe('rules', () => {
  it('loans: overdue is critical, within a week a warning, later nothing', () => {
    const [overdue, upcoming, ...rest] = loanAlerts(loans, TODAY);
    expect(rest).toEqual([]);
    expect(overdue).toMatchObject({ id: 'loan:overdue', severity: 'critical', amount: 5_000_000, dueDate: '2026-09-28' });
    expect(overdue.items[0].detail).toMatch(/۴ روز گذشته/);
    expect(overdue.action.path).toMatch(/\/loans\/l1$/);
    expect(upcoming).toMatchObject({ id: 'loan:upcoming', severity: 'warning', amount: 2_000_000 });
    expect(upcoming.items[0].detail).toMatch(/۳ روز دیگر/);
  });

  it('cheques: only open ones; past due is critical', () => {
    const [overdue, upcoming] = chequeAlerts(cheques, TODAY);
    expect(overdue).toMatchObject({ severity: 'critical', amount: 10_000_000 });
    expect(overdue.items.map((i) => i.key)).toEqual(['c1']);
    expect(overdue.items[0].detail).toMatch(/صادره/);
    expect(upcoming.items.map((i) => i.key)).toEqual(['c2']);
  });

  it('portfolio: drift and more sold than held, scoped to the portfolio', () => {
    const alerts = portfolioAlerts(
      { id: 'pf_1', name: 'اصلی' },
      { drifted: [{ targetKey: 'g_gold', name: 'طلا', currentPct: 40, targetPct: 30, diff: 10 }] },
      [{ assetId: 'usd', assetName: 'دلار', unit: 'دلار', deficit: 5, message: 'منفی' }],
    );
    expect(alerts.map((a) => a.id)).toEqual(['portfolio:drift:pf_1', 'portfolio:deficit:pf_1']);
    expect(alerts.every((a) => a.scope === 'pf_1' && a.severity === 'warning')).toBe(true);
    expect(alerts[0].items[0].detail).toMatch(/اکنون ۴۰٪، هدف ۳۰٪/);
  });
});

describe('the store', () => {
  it('a dismissed alert comes back when something new joins it', () => {
    const [, upcoming] = loanAlerts(loans, TODAY);
    setSourceAlerts('loan', [upcoming]);
    dismissAlert(getAlerts()[0]);
    expect(getAlerts()[0].dismissed).toBe(true);
    setSourceAlerts('loan', loanAlerts([...loans, { id: 'l4', title: 'تازه', nextDueInstallment: { dueDate: '2026-10-03', installmentNumber: 1, totalAmount: 1 } }], TODAY).slice(1));
    expect(getAlerts()[0].dismissed).toBe(false);
  });

  it('a dismissed critical alert is hidden for today only', () => {
    const [overdue] = loanAlerts(loans, TODAY);
    setSourceAlerts('loan', [overdue]);
    dismissAlert(overdue, new Date('2026-10-02T10:00:00'));
    const stored = JSON.parse(localStorage.getItem('realrate_alert_dismissals'));
    expect(stored[alertFingerprint(overdue)]).toBe('2026-10-02');
  });
});

describe('email (ready, not yet sent)', () => {
  const all = [...loanAlerts(loans, TODAY), ...chequeAlerts(cheques, TODAY), ...portfolioAlerts({ id: 'p' }, { drifted: [{ targetKey: 'g', name: 'x', currentPct: 1, targetPct: 9, diff: -8 }] })];

  it('only critical alerts of the chosen sources, once each, and only when turned on', () => {
    expect(selectForEmail(all, { enabled: false, sources: ['loan', 'cheque'] })).toEqual([]);
    const chosen = selectForEmail(all, { enabled: true, sources: ['loan', 'cheque', 'portfolio'] });
    expect(chosen.map((a) => a.id)).toEqual(['loan:overdue', 'cheque:overdue']);
    expect(selectForEmail(all, { enabled: true, sources: ['loan', 'cheque'] }, [alertFingerprint(chosen[0])]).map((a) => a.id)).toEqual(['cheque:overdue']);
  });

  it('the digest carries amounts only when allowed', () => {
    const due = selectForEmail(all, { enabled: true, sources: ['loan', 'cheque'] });
    const plain = buildEmailDigest(due, { appUrl: 'https://realrate.example' });
    expect(plain.subject).toBe('RealRate: ۲ هشدار مهم');
    expect(plain.text).toMatch(/قسط معوق/);
    expect(plain.text).not.toMatch(/تومان/);
    expect(plain.text).toMatch(/https:\/\/realrate\.example\/.*loans/);
    expect(buildEmailDigest(due, { includeAmounts: true }).text).toMatch(/۵٬۰۰۰٬۰۰۰ تومان/);
  });
});

describe('one UI for every alert', () => {
  it('banners: a list alert opens to its items; «×» dismisses; the action navigates', () => {
    setSourceAlerts('loan', loanAlerts(loans, TODAY));
    render(<MemoryRouter><AlertStack sources={['loan']} /></MemoryRouter>);
    expect(screen.getByText('۱ قسط معوق')).toBeTruthy();
    expect(screen.getByText('۱ قسط تا ۷ روز آینده')).toBeTruthy();
    fireEvent.click(screen.getByText('مشاهده و تسویه').closest('button'));
    expect(navigate.mock.calls[0][0]).toMatch(/\/loans\/l1$/);
    act(() => fireEvent.click(screen.getAllByLabelText('بستن پیام')[0]));
    expect(screen.queryByText('۱ قسط معوق')).toBeNull();
  });

  it('the bell counts what is not dismissed and lists everything', () => {
    setSourceAlerts('loan', loanAlerts(loans, TODAY));
    setSourceAlerts('cheque', chequeAlerts(cheques, TODAY));
    render(<MemoryRouter><AlertCenterButton /></MemoryRouter>);
    expect(screen.getByLabelText('هشدارها (۴)')).toBeTruthy();
    expect(document.querySelector('.alert-center-badge.is-critical')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('هشدارها (۴)'));
    expect(document.querySelectorAll('.alert-center-item')).toHaveLength(4);
    act(() => fireEvent.click(screen.getAllByText('پنهان کردن')[0].closest('button')));
    expect(screen.getByLabelText('هشدارها (۳)')).toBeTruthy();
    expect(document.querySelectorAll('.alert-center-item.is-dismissed')).toHaveLength(1);
  });
});
