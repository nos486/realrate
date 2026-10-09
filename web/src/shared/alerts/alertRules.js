/**
 * alertRules.js — The rules that raise alerts from the user's (decrypted) data
 *
 * Pure: data in, alerts out (utils/alerts.js shape). They run in the browser — the data is
 * end-to-end encrypted — and feed the alert store (alertStore.js) through AppAlertSources.jsx and
 * the pages that hold the data (the portfolio). Each rule is also what a future email reminder
 * would run, so it does not depend on React.
 */

import { createAlert } from '../../utils/alerts.js';
import { buildChequeReminders, getChequeDirection, CHEQUE_REMINDER_DAYS } from '../../utils/chequeDocument.js';
import { subscriptionView, SUBSCRIPTION_REMINDER_DAYS } from '../../utils/subscriptionDocument.js';
import { formatShamsiDisplay } from '../../features/portfolio/components/ShamsiDatePicker.jsx';
import { appPath } from '../routes.js';

const DAY = 24 * 60 * 60 * 1000;
export const LOAN_REMINDER_DAYS = 7;

const faNum = (v) => Number(v || 0).toLocaleString('fa-IR');
const dayDiff = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);
const describeDays = (days) => (days === 0 ? 'امروز' : days > 0 ? `${faNum(days)} روز دیگر` : `${faNum(-days)} روز گذشته`);

/**
 * Loan installments: overdue (critical) and due within LOAN_REMINDER_DAYS (warning)
 * @param {object[]} loans with `nextDueInstallment` (LoansContext)
 * @param {string} today YYYY-MM-DD
 */
export function loanAlerts(loans = [], today) {
  const overdue = [];
  const upcoming = [];
  for (const loan of loans || []) {
    const inst = loan?.nextDueInstallment;
    if (!inst?.dueDate) continue;
    const due = String(inst.dueDate).split('T')[0];
    if (!Number.isFinite(Date.parse(due))) continue;
    const days = dayDiff(today, due);
    const item = {
      key: `${loan.id}_${inst.installmentNumber}`,
      title: loan.title,
      detail: `قسط ${faNum(inst.installmentNumber)}، سررسید ${formatShamsiDisplay(due)}، ${describeDays(days)}`,
      amount: inst.totalAmount,
      due,
      loanId: loan.id,
    };
    if (days < 0) overdue.push(item);
    else if (days <= LOAN_REMINDER_DAYS) upcoming.push(item);
  }
  const byDue = (a, b) => a.due.localeCompare(b.due);
  overdue.sort(byDue);
  upcoming.sort(byDue);
  const pathOf = (list) => appPath(list.length === 1 ? `/loans/${list[0].loanId}` : '/loans');
  return [
    overdue.length && createAlert({
      id: 'loan:overdue',
      source: 'loan',
      severity: 'critical',
      title: `${faNum(overdue.length)} قسط معوق`,
      items: overdue,
      dueDate: overdue[0].due,
      action: { label: 'مشاهده و تسویه', path: pathOf(overdue) },
    }),
    upcoming.length && createAlert({
      id: 'loan:upcoming',
      source: 'loan',
      severity: 'warning',
      title: `${faNum(upcoming.length)} قسط تا ${faNum(LOAN_REMINDER_DAYS)} روز آینده`,
      items: upcoming,
      dueDate: upcoming[0].due,
      action: { label: 'مشاهده اقساط', path: pathOf(upcoming) },
    }),
  ].filter(Boolean);
}

/**
 * Cheques: past due (critical) and due within CHEQUE_REMINDER_DAYS (warning). Only open ones
 * (waiting or being collected)
 */
export function chequeAlerts(cheques = [], today) {
  const { overdue, upcoming } = buildChequeReminders(cheques, today);
  const toItem = (c) => ({
    key: c.id,
    title: c.counterparty,
    detail: `چک ${getChequeDirection(c.direction).label}، سررسید ${formatShamsiDisplay(`${c.dueDate}T00:00:00`)}، ${describeDays(c.days)}`,
    amount: c.amount,
  });
  const action = (label) => ({ label, path: appPath('/cheques') });
  return [
    overdue.length && createAlert({
      id: 'cheque:overdue',
      source: 'cheque',
      severity: 'critical',
      title: `${faNum(overdue.length)} چک سررسیدگذشته`,
      items: overdue.map(toItem),
      dueDate: overdue[0].dueDate,
      action: action('پیگیری چک‌ها'),
    }),
    upcoming.length && createAlert({
      id: 'cheque:upcoming',
      source: 'cheque',
      severity: 'warning',
      title: `${faNum(upcoming.length)} چک تا ${faNum(CHEQUE_REMINDER_DAYS)} روز آینده`,
      items: upcoming.map(toItem),
      dueDate: upcoming[0].dueDate,
      action: action('مشاهده چک‌ها'),
    }),
  ].filter(Boolean);
}

/**
 * Subscriptions: run out without being renewed (critical — renewed by hand, past its day) and
 * renewing within SUBSCRIPTION_REMINDER_DAYS (warning). Active ones whose reminders are on only.
 * A dollar subscription's amount is in tomans at `usdToman` (its dollars in the detail); without a
 * rate it has none, so the totals stay in tomans.
 */
export function subscriptionAlerts(subscriptions = [], today, { usdToman = 0 } = {}) {
  const expired = [];
  const upcoming = [];
  for (const sub of subscriptions || []) {
    if (!sub?.id || sub.remindersMuted) continue;
    const view = subscriptionView(sub, today);
    if (view.state !== 'expired' && view.state !== 'due') continue;
    const money = sub.currency === 'USD' ? `${faNum(sub.amount)} دلار` : null;
    const item = {
      key: `${sub.id}_${view.nextRenewal}`,
      title: sub.name,
      detail: `${view.state === 'expired' ? 'اعتبار تا' : 'تمدید'} ${formatShamsiDisplay(`${view.nextRenewal}T00:00:00`)}، ${describeDays(view.daysLeft)}${money ? `، ${money}` : ''}`,
      amount: sub.currency !== 'USD' ? sub.amount : usdToman > 0 ? Math.round(sub.amount * usdToman) : undefined,
      due: view.nextRenewal,
    };
    (view.state === 'expired' ? expired : upcoming).push(item);
  }
  const byDue = (a, b) => a.due.localeCompare(b.due);
  expired.sort(byDue);
  upcoming.sort(byDue);
  const action = (label) => ({ label, path: appPath('/subscriptions') });
  return [
    expired.length && createAlert({
      id: 'subscription:expired',
      source: 'subscription',
      severity: 'critical',
      title: `${faNum(expired.length)} اشتراک تمدید نشده`,
      items: expired,
      dueDate: expired[0].due,
      action: action('تمدید اشتراک‌ها'),
    }),
    upcoming.length && createAlert({
      id: 'subscription:upcoming',
      source: 'subscription',
      severity: 'warning',
      title: `${faNum(upcoming.length)} تمدید اشتراک تا ${faNum(SUBSCRIPTION_REMINDER_DAYS)} روز آینده`,
      items: upcoming,
      dueDate: upcoming[0].due,
      action: action('مشاهده اشتراک‌ها'),
    }),
  ].filter(Boolean);
}

const faPct = (n) => `${Math.abs(n).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪`;

/**
 * A portfolio: categories drifted from their targets, and assets sold beyond what was held
 * @param {{ id: string, name?: string }} portfolio
 * @param {{ drifted?: object[], threshold?: number }} allocation buildAllocation's result
 * @param {object[]} [warnings] the ledger's (more sold than held)
 */
export function portfolioAlerts(portfolio, allocation, warnings = [], { threshold = 5 } = {}) {
  if (!portfolio?.id) return [];
  const path = appPath(`/portfolio/${portfolio.id}`);
  const name = portfolio.name || 'پورتفو';
  const drifted = allocation?.drifted || [];
  return [
    drifted.length && createAlert({
      id: `portfolio:drift:${portfolio.id}`,
      source: 'portfolio',
      severity: 'warning',
      scope: portfolio.id,
      title: `ترکیب «${name}» بیش از ${faNum(threshold)}٪ از هدف فاصله گرفته`,
      items: drifted.map((r) => ({
        key: r.targetKey,
        title: r.name,
        detail: `اکنون ${faPct(r.currentPct)}، هدف ${faPct(r.targetPct)} (${faPct(r.diff)} ${r.diff > 0 ? 'بیشتر' : 'کمتر'})`,
      })),
      action: { label: 'مشاهده پورتفو', path },
    }),
    warnings.length && createAlert({
      id: `portfolio:deficit:${portfolio.id}`,
      source: 'portfolio',
      severity: 'warning',
      scope: portfolio.id,
      title: `فروش بیش از موجودی در «${name}»`,
      message: warnings.map((w) => w.message).join(' '),
      items: warnings.map((w) => ({ key: w.assetId, title: w.assetName, detail: `${faNum(w.deficit)} ${w.unit} بیش از موجودی` })),
      action: { label: 'بازبینی ثبت‌ها', path },
    }),
  ].filter(Boolean);
}
