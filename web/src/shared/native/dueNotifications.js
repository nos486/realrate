/**
 * dueNotifications.js — Android local notifications for due loans and cheques
 *
 * Uses @capacitor/local-notifications with inexact scheduling (no SCHEDULE_EXACT_ALARM needed).
 * All decrypted data (titles, amounts, counterparties) stays entirely on the device.
 */

import { reminderOf, occurrencesBetween } from '../../utils/reminders.js';
import { isNativeApp } from './nativeApp.js';
import { isPrivacyMode } from '../../hooks/usePrivacyMode.js';
import { buildLoanView } from '../../utils/loanDocument.js';

export const DUE_NOTIF_SETTINGS_KEY = 'realrate_due_notifications_settings';

export const DEFAULT_DUE_NOTIFICATION_SETTINGS = {
  enabled: true,
  leadDays: [1, 0],
  showAmount: false,
};

const MAX_NOTIFICATIONS = 64;
const MAX_PLANNING_DAYS = 30;

const faNum = (n) => Number(n || 0).toLocaleString('fa-IR');

export function getDueNotificationSettings() {
  try {
    const raw = localStorage.getItem(DUE_NOTIF_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_DUE_NOTIFICATION_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      enabled: parsed.enabled !== undefined ? Boolean(parsed.enabled) : DEFAULT_DUE_NOTIFICATION_SETTINGS.enabled,
      leadDays: Array.isArray(parsed.leadDays) ? parsed.leadDays : DEFAULT_DUE_NOTIFICATION_SETTINGS.leadDays,
      showAmount: Boolean(parsed.showAmount),
    };
  } catch {
    return { ...DEFAULT_DUE_NOTIFICATION_SETTINGS };
  }
}

export function setDueNotificationSettings(patch) {
  const current = getDueNotificationSettings();
  const next = { ...current, ...patch };
  try {
    localStorage.setItem(DUE_NOTIF_SETTINGS_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

/**
 * Generate a deterministic positive 31-bit integer ID for Capacitor LocalNotifications.
 * @param {string} kind
 * @param {string} recordId
 * @param {string} dueDate
 * @param {string} reason
 * @returns {number}
 */
export function notificationId(kind, recordId, dueDate, reason) {
  const str = `${kind}|${recordId}|${dueDate}|${reason}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return (hash & 0x7fffffff) || 1;
}

export function addDaysIso(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yStr = dt.getUTCFullYear();
  const mStr = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dStr = String(dt.getUTCDate()).padStart(2, '0');
  return `${yStr}-${mStr}-${dStr}`;
}

/**
 * Build notification title and body text in Persian.
 */
function buildNotificationText({ kind, title, counterparty, direction, amount, reason, leadDays, showAmount }) {
  let headline = '';
  if (kind === 'loan') {
    if (reason === 'overdue') headline = 'قسط وام سررسیدش گذشته است';
    else if (reason === 'due' || leadDays === 0) headline = 'قسط وام امروز سررسید است';
    else if (leadDays === 1) headline = 'قسط وام فردا سررسید می‌شود';
    else headline = `قسط وام در ${faNum(leadDays)} روز آینده سررسید می‌شود`;
  } else if (kind === 'cheque') {
    const dirLabel = direction === 'issued' ? 'چک صادره' : direction === 'received' ? 'چک دریافتی' : 'چک';
    if (reason === 'overdue') headline = `${dirLabel} سررسیدش گذشته است`;
    else if (reason === 'due' || leadDays === 0) headline = `${dirLabel} امروز سررسید است`;
    else if (leadDays === 1) headline = `${dirLabel} فردا سررسید می‌شود`;
    else headline = `${dirLabel} در ${faNum(leadDays)} روز آینده سررسید می‌شود`;
  }

  const namePart = (counterparty || title || '').trim();
  let body = namePart;
  if (showAmount && amount > 0) {
    const amountStr = `${faNum(amount)} تومان`;
    body = namePart ? `${namePart} — ${amountStr}` : amountStr;
  }

  return { title: headline, body };
}

/**
 * Pure planning function for upcoming local notifications.
 * @param {object} params
 * @param {object[]} [params.loans]
 * @param {object[]} [params.cheques]
 * @param {string} params.today - YYYY-MM-DD
 * @param {object} [params.settings]
 * @param {boolean} [params.hideAmounts]
 * @param {Date} [params.now]
 * @returns {object[]} Planned notifications sorted by fireAt ascending, capped at 64
 */
export function planDueNotifications({
  loans = [],
  cheques = [],
  today,
  settings = {},
  hideAmounts = false,
  now = new Date(),
} = {}) {
  const currentSettings = { ...DEFAULT_DUE_NOTIFICATION_SETTINGS, ...settings };
  if (!currentSettings.enabled) return [];

  const effectiveHideAmounts = hideAmounts || !currentSettings.showAmount;
  const leadDays = currentSettings.leadDays || [1, 0];
  const maxDate = addDaysIso(today, MAX_PLANNING_DAYS);

  const planned = [];

  // 1. Loans
  for (const loan of loans) {
    const reminder = reminderOf('loan', loan);
    if (!reminder || reminder.muted) continue;

    let amount = 0;
    let title = (loan.title || '').trim();
    if (loan.nextDueInstallment) {
      amount = Number(loan.nextDueInstallment.totalAmount || 0);
    } else {
      try {
        const view = loan.installments
          ? loan
          : buildLoanView(loan.loan ? loan : { loan, states: loan.states || [] });
        const nextInst = view?.installments?.find((i) => !i.isPaid);
        amount = Number(nextInst?.totalAmount || 0);
        if (!title && view?.title) title = view.title;
      } catch {
        amount = 0;
      }
    }
    const deepLinkPath = `/loans/${reminder.recordId || loan.id}`;

    // Overdue check
    if (reminder.dueDate < today) {
      // Overdue notification scheduled for the morning after due date
      const overdueDate = addDaysIso(reminder.dueDate, 1);
      const fireAt = new Date(`${overdueDate}T09:00:00`);
      if (fireAt.getTime() > now.getTime() && overdueDate <= maxDate) {
        const text = buildNotificationText({
          kind: 'loan',
          title,
          amount,
          reason: 'overdue',
          leadDays: 0,
          showAmount: !effectiveHideAmounts,
        });
        planned.push({
          id: notificationId('loan', loan.id, reminder.dueDate, 'overdue'),
          kind: 'loan',
          recordId: loan.id,
          dueDate: reminder.dueDate,
          reason: 'overdue',
          leadDays: 0,
          fireAt,
          title: text.title,
          body: text.body,
          extra: { kind: 'due', path: deepLinkPath, recordId: loan.id, dueDate: reminder.dueDate, reason: 'overdue' },
        });
      }
    }

    // Upcoming occurrences
    const occurrences = occurrencesBetween(reminder, today, maxDate);
    for (const occ of occurrences) {
      for (const d of leadDays) {
        const reason = d === 0 ? 'due' : 'lead';
        const triggerDay = addDaysIso(occ, -d);
        const fireAt = new Date(`${triggerDay}T09:00:00`);
        if (fireAt.getTime() > now.getTime()) {
          const text = buildNotificationText({
            kind: 'loan',
            title,
            amount,
            reason,
            leadDays: d,
            showAmount: !effectiveHideAmounts,
          });
          planned.push({
            id: notificationId('loan', loan.id, occ, `${reason}_${d}`),
            kind: 'loan',
            recordId: loan.id,
            dueDate: occ,
            reason,
            leadDays: d,
            fireAt,
            title: text.title,
            body: text.body,
            extra: { kind: 'due', path: deepLinkPath, recordId: loan.id, dueDate: occ, reason },
          });
        }
      }

      // Next morning overdue reminder for upcoming occurrence
      const nextMorning = addDaysIso(occ, 1);
      const overdueFireAt = new Date(`${nextMorning}T09:00:00`);
      if (overdueFireAt.getTime() > now.getTime() && nextMorning <= maxDate) {
        const text = buildNotificationText({
          kind: 'loan',
          title,
          amount,
          reason: 'overdue',
          leadDays: 0,
          showAmount: !effectiveHideAmounts,
        });
        planned.push({
          id: notificationId('loan', loan.id, occ, 'overdue'),
          kind: 'loan',
          recordId: loan.id,
          dueDate: occ,
          reason: 'overdue',
          leadDays: 0,
          fireAt: overdueFireAt,
          title: text.title,
          body: text.body,
          extra: { kind: 'due', path: deepLinkPath, recordId: loan.id, dueDate: occ, reason: 'overdue' },
        });
      }
    }
  }

  // 2. Cheques
  for (const cheque of cheques) {
    const reminder = reminderOf('cheque', cheque, { includeDirection: true });
    if (!reminder || reminder.muted) continue;

    const amount = Number(cheque.amount || 0);
    const counterparty = (cheque.counterparty || '').trim();
    const direction = cheque.direction || '';
    const deepLinkPath = '/cheques';

    // Overdue check
    if (reminder.dueDate < today) {
      const overdueDate = addDaysIso(reminder.dueDate, 1);
      const fireAt = new Date(`${overdueDate}T09:00:00`);
      if (fireAt.getTime() > now.getTime() && overdueDate <= maxDate) {
        const text = buildNotificationText({
          kind: 'cheque',
          counterparty,
          direction,
          amount,
          reason: 'overdue',
          leadDays: 0,
          showAmount: !effectiveHideAmounts,
        });
        planned.push({
          id: notificationId('cheque', cheque.id, reminder.dueDate, 'overdue'),
          kind: 'cheque',
          recordId: cheque.id,
          dueDate: reminder.dueDate,
          reason: 'overdue',
          leadDays: 0,
          fireAt,
          title: text.title,
          body: text.body,
          extra: { kind: 'due', path: deepLinkPath, recordId: cheque.id, dueDate: reminder.dueDate, reason: 'overdue' },
        });
      }
    }

    const occurrences = occurrencesBetween(reminder, today, maxDate);
    for (const occ of occurrences) {
      for (const d of leadDays) {
        const reason = d === 0 ? 'due' : 'lead';
        const triggerDay = addDaysIso(occ, -d);
        const fireAt = new Date(`${triggerDay}T09:00:00`);
        if (fireAt.getTime() > now.getTime()) {
          const text = buildNotificationText({
            kind: 'cheque',
            counterparty,
            direction,
            amount,
            reason,
            leadDays: d,
            showAmount: !effectiveHideAmounts,
          });
          planned.push({
            id: notificationId('cheque', cheque.id, occ, `${reason}_${d}`),
            kind: 'cheque',
            recordId: cheque.id,
            dueDate: occ,
            reason,
            leadDays: d,
            fireAt,
            title: text.title,
            body: text.body,
            extra: { kind: 'due', path: deepLinkPath, recordId: cheque.id, dueDate: occ, reason },
          });
        }
      }

      // Next morning overdue
      const nextMorning = addDaysIso(occ, 1);
      const overdueFireAt = new Date(`${nextMorning}T09:00:00`);
      if (overdueFireAt.getTime() > now.getTime() && nextMorning <= maxDate) {
        const text = buildNotificationText({
          kind: 'cheque',
          counterparty,
          direction,
          amount,
          reason: 'overdue',
          leadDays: 0,
          showAmount: !effectiveHideAmounts,
        });
        planned.push({
          id: notificationId('cheque', cheque.id, occ, 'overdue'),
          kind: 'cheque',
          recordId: cheque.id,
          dueDate: occ,
          reason: 'overdue',
          leadDays: 0,
          fireAt: overdueFireAt,
          title: text.title,
          body: text.body,
          extra: { kind: 'due', path: deepLinkPath, recordId: cheque.id, dueDate: occ, reason: 'overdue' },
        });
      }
    }
  }

  // Deduplicate by ID and sort chronologically
  const uniqueMap = new Map();
  for (const item of planned) {
    if (!uniqueMap.has(item.id)) {
      uniqueMap.set(item.id, item);
    }
  }

  const sorted = [...uniqueMap.values()].sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
  return sorted.slice(0, MAX_NOTIFICATIONS);
}

/**
 * Schedule due notifications on device using @capacitor/local-notifications.
 * Cancels prior due notifications before scheduling new ones.
 */
export async function scheduleDueNotifications({
  loans = [],
  cheques = [],
  isVaultUnlocked = false,
  today,
  settings,
  hideAmounts,
  now = new Date(),
} = {}) {
  if (!isNativeApp() || !isVaultUnlocked) return [];

  const privacyActive = hideAmounts ?? isPrivacyMode();
  const currentSettings = settings || getDueNotificationSettings();

  const planned = planDueNotifications({
    loans,
    cheques,
    today,
    settings: currentSettings,
    hideAmounts: privacyActive,
    now,
  });

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');

    // Cancel previously scheduled due notifications
    const pending = await LocalNotifications.getPending().catch(() => ({ notifications: [] }));
    const toCancel = (pending?.notifications || [])
      .filter((n) => n.extra?.kind === 'due')
      .map((n) => ({ id: n.id }));

    if (toCancel.length > 0) {
      await LocalNotifications.cancel({ notifications: toCancel });
    }

    if (currentSettings.enabled && planned.length > 0) {
      const formattedNotifications = planned.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        schedule: {
          at: item.fireAt,
          allowWhileIdle: true,
        },
        extra: item.extra,
      }));

      await LocalNotifications.schedule({ notifications: formattedNotifications });
    }
    return planned;
  } catch (err) {
    console.warn('[DueNotifications] failed to schedule:', err);
    return [];
  }
}

/**
 * Cancel every scheduled due notification on the device (logout: the next person to use the
 * phone must not get the previous account's reminders). Best-effort.
 */
export async function cancelDueNotifications() {
  if (!isNativeApp()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const pending = await LocalNotifications.getPending().catch(() => ({ notifications: [] }));
    const toCancel = (pending?.notifications || [])
      .filter((n) => n.extra?.kind === 'due')
      .map((n) => ({ id: n.id }));
    if (toCancel.length > 0) await LocalNotifications.cancel({ notifications: toCancel });
  } catch {
    // Nothing scheduled, or the plugin is unavailable
  }
}

/**
 * Check local notification permission status.
 */
export async function checkNotificationPermission() {
  if (!isNativeApp()) return 'granted';
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const status = await LocalNotifications.checkPermissions();
    return status.display;
  } catch {
    return 'prompt';
  }
}

/**
 * Request notification permissions from Android.
 */
export async function requestNotificationPermission() {
  if (!isNativeApp()) return 'granted';
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const res = await LocalNotifications.requestPermissions();
    return res.display;
  } catch {
    return 'denied';
  }
}

/**
 * Listen for notification clicks to handle deep linking into /loans/:id, /cheques or /incomes.
 */
export function initDueNotificationClicks(onNavigate) {
  if (!isNativeApp()) return () => {};
  let handle = null;
  import('@capacitor/local-notifications').then(({ LocalNotifications }) => {
    LocalNotifications.addListener('localNotificationActionPerformed', (notificationAction) => {
      const extra = notificationAction.notification?.extra;
      // A due date, or an important news item (features/news/newsAlerts.js)
      if ((extra?.kind === 'due' || extra?.kind === 'news') && extra?.path) {
        onNavigate?.(extra.path);
      }
    }).then((h) => {
      handle = h;
    }).catch(() => {});
  }).catch(() => {});

  return () => {
    handle?.remove?.();
  };
}
