/**
 * alertRules.js — The rules that raise alerts from the user's (decrypted) data
 *
 * Pure: data in, alerts out (utils/alerts.js shape). They run in the browser — the data is
 * end-to-end encrypted — and feed the alert store (alertStore.js) through AppAlertSources.jsx and
 * the pages that hold the data (the portfolio). Each rule is also what a future email reminder
 * would run, so it does not depend on React.
 */

import { intlLocale, t } from '../../utils/i18n.js';
import { createAlert } from '../../utils/alerts.js';
import { buildChequeReminders, getChequeDirection, CHEQUE_REMINDER_DAYS } from '../../utils/chequeDocument.js';
import { subscriptionView, SUBSCRIPTION_REMINDER_DAYS } from '../../utils/subscriptionDocument.js';
import { currencyRateToday, formatMoney, isForeignCurrency } from '../../utils/currencies.js';
import { formatShamsiDisplay } from '../../features/portfolio/components/ShamsiDatePicker.jsx';
import { appPath } from '../routes.js';

const DAY = 24 * 60 * 60 * 1000;
export const LOAN_REMINDER_DAYS = 7;

const faNum = (v) => Number(v || 0).toLocaleString(intlLocale());
const dayDiff = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);
const describeDays = (days) => {
  if (days === 0) return t('امروز');
  if (days === 1) return t('۱ روز دیگر');
  if (days === -1) return t('۱ روز گذشته');
  return days > 0 ? t('{n} روز دیگر', { n: faNum(days) }) : t('{n} روز گذشته', { n: faNum(-days) });
};
/** One key for a single item, one with the count for several (English plural); Persian reads the same */
const countTitle = (n, one, many) => (n === 1 ? one : many);

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
      detail: t('قسط {n}، سررسید {due}، {when}', { n: faNum(inst.installmentNumber), due: formatShamsiDisplay(due), when: describeDays(days) }),
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
      title: countTitle(overdue.length, t('۱ قسط معوق'), t('{n} قسط معوق', { n: faNum(overdue.length) })),
      items: overdue,
      dueDate: overdue[0].due,
      action: { label: t('مشاهده و تسویه'), path: pathOf(overdue) },
    }),
    upcoming.length && createAlert({
      id: 'loan:upcoming',
      source: 'loan',
      severity: 'warning',
      title: countTitle(upcoming.length, t('۱ قسط تا {days} روز آینده', { days: faNum(LOAN_REMINDER_DAYS) }), t('{n} قسط تا {days} روز آینده', { n: faNum(upcoming.length), days: faNum(LOAN_REMINDER_DAYS) })),
      items: upcoming,
      dueDate: upcoming[0].due,
      action: { label: t('مشاهده اقساط'), path: pathOf(upcoming) },
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
    detail: t('چک {direction}، سررسید {due}، {when}', { direction: getChequeDirection(c.direction).label, due: formatShamsiDisplay(`${c.dueDate}T00:00:00`), when: describeDays(c.days) }),
    amount: c.amount,
  });
  const action = (label) => ({ label, path: appPath('/cheques') });
  return [
    overdue.length && createAlert({
      id: 'cheque:overdue',
      source: 'cheque',
      severity: 'critical',
      title: countTitle(overdue.length, t('۱ چک سررسیدگذشته'), t('{n} چک سررسیدگذشته', { n: faNum(overdue.length) })),
      items: overdue.map(toItem),
      dueDate: overdue[0].dueDate,
      action: action(t('پیگیری چک‌ها')),
    }),
    upcoming.length && createAlert({
      id: 'cheque:upcoming',
      source: 'cheque',
      severity: 'warning',
      title: countTitle(upcoming.length, t('۱ چک تا {days} روز آینده', { days: faNum(CHEQUE_REMINDER_DAYS) }), t('{n} چک تا {days} روز آینده', { n: faNum(upcoming.length), days: faNum(CHEQUE_REMINDER_DAYS) })),
      items: upcoming.map(toItem),
      dueDate: upcoming[0].dueDate,
      action: action(t('مشاهده چک‌ها')),
    }),
  ].filter(Boolean);
}

/**
 * Subscriptions: run out without being renewed (critical — renewed by hand, past its day) and
 * renewing within SUBSCRIPTION_REMINDER_DAYS (warning). Active ones whose reminders are on only.
 * A foreign subscription's amount is in tomans at today's rate (`rates`: utils/currencies.js; its
 * own amount in the detail); without a rate it has none, so the totals stay in tomans.
 */
export function subscriptionAlerts(subscriptions = [], today, rates = {}) {
  const expired = [];
  const upcoming = [];
  for (const sub of subscriptions || []) {
    if (!sub?.id || sub.remindersMuted) continue;
    const view = subscriptionView(sub, today);
    if (view.state !== 'expired' && view.state !== 'due') continue;
    const foreign = isForeignCurrency(sub.currency);
    const money = foreign ? formatMoney(sub.amount, sub.currency) : null;
    const rate = currencyRateToday(sub.currency, rates);
    const when = { date: formatShamsiDisplay(`${view.nextRenewal}T00:00:00`), when: describeDays(view.daysLeft) };
    const item = {
      key: `${sub.id}_${view.nextRenewal}`,
      title: sub.name,
      detail: `${view.state === 'expired' ? t('اعتبار تا {date}، {when}', when) : t('تمدید {date}، {when}', when)}${money ? `${t('،')} ${money}` : ''}`,
      amount: !foreign ? sub.amount : rate > 0 ? Math.round(sub.amount * rate) : undefined,
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
      title: countTitle(expired.length, t('۱ اشتراک تمدید نشده'), t('{n} اشتراک تمدید نشده', { n: faNum(expired.length) })),
      items: expired,
      dueDate: expired[0].due,
      action: action(t('تمدید اشتراک‌ها')),
    }),
    upcoming.length && createAlert({
      id: 'subscription:upcoming',
      source: 'subscription',
      severity: 'warning',
      title: countTitle(upcoming.length, t('۱ تمدید اشتراک تا {days} روز آینده', { days: faNum(SUBSCRIPTION_REMINDER_DAYS) }), t('{n} تمدید اشتراک تا {days} روز آینده', { n: faNum(upcoming.length), days: faNum(SUBSCRIPTION_REMINDER_DAYS) })),
      items: upcoming,
      dueDate: upcoming[0].due,
      action: action(t('مشاهده اشتراک‌ها')),
    }),
  ].filter(Boolean);
}

const faPct = (n) => `${Math.abs(n).toLocaleString(intlLocale(), { maximumFractionDigits: 1 })}${t('٪')}`;

/**
 * A portfolio: categories drifted from their targets, and assets sold beyond what was held
 * @param {{ id: string, name?: string }} portfolio
 * @param {{ drifted?: object[], threshold?: number }} allocation buildAllocation's result
 * @param {object[]} [warnings] the ledger's (more sold than held)
 */
export function portfolioAlerts(portfolio, allocation, warnings = [], { threshold = 5 } = {}) {
  if (!portfolio?.id) return [];
  const path = appPath(`/portfolio/${portfolio.id}`);
  const name = portfolio.name || t('پورتفو');
  const drifted = allocation?.drifted || [];
  return [
    drifted.length && createAlert({
      id: `portfolio:drift:${portfolio.id}`,
      source: 'portfolio',
      severity: 'warning',
      scope: portfolio.id,
      title: t('ترکیب «{name}» بیش از {n}٪ از هدف فاصله گرفته', { name, n: faNum(threshold) }),
      items: drifted.map((r) => ({
        key: r.targetKey,
        title: r.name,
        detail: t('اکنون {current}، هدف {target} ({diff} {dir})', { current: faPct(r.currentPct), target: faPct(r.targetPct), diff: faPct(r.diff), dir: r.diff > 0 ? t('بیشتر') : t('کمتر') }),
      })),
      action: { label: t('مشاهده پورتفو'), path },
    }),
    warnings.length && createAlert({
      id: `portfolio:deficit:${portfolio.id}`,
      source: 'portfolio',
      severity: 'warning',
      scope: portfolio.id,
      title: t('فروش بیش از موجودی در «{name}»', { name }),
      message: warnings.map((w) => w.message).join(' '),
      items: warnings.map((w) => ({ key: w.assetId, title: w.assetName, detail: t('{n} {unit} بیش از موجودی', { n: faNum(w.deficit), unit: w.unit }) })),
      action: { label: t('بازبینی ثبت‌ها'), path },
    }),
  ].filter(Boolean);
}
