/**
 * dueNotifications.js — Android local notifications for due loans, cheques and subscription renewals
 *
 * Uses @capacitor/local-notifications with inexact scheduling (no SCHEDULE_EXACT_ALARM needed).
 * All decrypted data (titles, amounts, counterparties) stays entirely on the device.
 */

import { reminderOf, occurrencesBetween, reminderCanBeOverdue } from '../../utils/reminders.js';
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
function buildNotificationText({ kind, title, counterparty, direction, amount, currency, autoRenew, reason, leadDays, showAmount }) {
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
  } else if (kind === 'subscription') {
    // Renewed by itself it is charged; by hand it runs out
    const verb = autoRenew ? 'تمدید می‌شود' : 'تمام می‌شود';
    if (reason === 'overdue') headline = 'اشتراک تمدید نشده و تمام شده است';
    else if (reason === 'due' || leadDays === 0) headline = `اشتراک امروز ${verb}`;
    else if (leadDays === 1) headline = `اشتراک فردا ${verb}`;
    else headline = `اشتراک ${faNum(leadDays)} روز دیگر ${verb}`;
  }

  const namePart = (counterparty || title || '').trim();
  let body = namePart;
  if (showAmount && amount > 0) {
    const amountStr = currency === 'USD' ? `${faNum(amount)} دلار` : `${faNum(amount)} تومان`;
    body = namePart ? `${namePart} — ${amountStr}` : amountStr;
  }

  return { title: headline, body };
}

/**
 * One record's notifications: the morning after a missed date (when it can be overdue), and for
 * each occurrence within the window its lead days and the morning after
 * @param {{ kind: string, record: object, reminder: object, text: object, path: string }} item
 *   text: buildNotificationText's fields other than reason / leadDays
 */
function planRecord({ kind, record, reminder, text, path }, { today, maxDate, leadDays, showAmount, now }) {
  const out = [];
  const overdueAllowed = reminderCanBeOverdue(reminder);
  const push = (dueDate, reason, d, fireAt) => {
    const t = buildNotificationText({ kind, ...text, reason, leadDays: d, showAmount });
    out.push({
      id: notificationId(kind, record.id, dueDate, reason === 'overdue' ? 'overdue' : `${reason}_${d}`),
      kind,
      recordId: record.id,
      dueDate,
      reason,
      leadDays: d,
      fireAt,
      title: t.title,
      body: t.body,
      extra: { kind: 'due', path, recordId: record.id, dueDate, reason },
    });
  };
  // The morning after `day`, when it is still ahead and within the window
  const overdueAfter = (day) => {
    if (!overdueAllowed) return;
    const morning = addDaysIso(day, 1);
    const fireAt = new Date(`${morning}T09:00:00`);
    if (fireAt.getTime() > now.getTime() && morning <= maxDate) push(day, 'overdue', 0, fireAt);
  };

  if (reminder.dueDate < today) overdueAfter(reminder.dueDate);
  for (const occ of occurrencesBetween(reminder, today, maxDate)) {
    for (const d of leadDays) {
      const fireAt = new Date(`${addDaysIso(occ, -d)}T09:00:00`);
      if (fireAt.getTime() > now.getTime()) push(occ, d === 0 ? 'due' : 'lead', d, fireAt);
    }
    overdueAfter(occ);
  }
  return out;
}

/** A loan's next installment amount and its title */
function loanFigures(loan) {
  let title = (loan.title || '').trim();
  if (loan.nextDueInstallment) return { title, amount: Number(loan.nextDueInstallment.totalAmount || 0) };
  try {
    const view = loan.installments
      ? loan
      : buildLoanView(loan.loan ? loan : { loan, states: loan.states || [] });
    const nextInst = view?.installments?.find((i) => !i.isPaid);
    if (!title && view?.title) title = view.title;
    return { title, amount: Number(nextInst?.totalAmount || 0) };
  } catch {
    return { title, amount: 0 };
  }
}

/**
 * Pure planning function for upcoming local notifications.
 * @param {object} params
 * @param {object[]} [params.loans]
 * @param {object[]} [params.cheques]
 * @param {object[]} [params.subscriptions]
 * @param {string} params.today - YYYY-MM-DD
 * @param {object} [params.settings]
 * @param {boolean} [params.hideAmounts]
 * @param {Date} [params.now]
 * @returns {object[]} Planned notifications sorted by fireAt ascending, capped at 64
 */
export function planDueNotifications({
  loans = [],
  cheques = [],
  subscriptions = [],
  today,
  settings = {},
  hideAmounts = false,
  now = new Date(),
} = {}) {
  const currentSettings = { ...DEFAULT_DUE_NOTIFICATION_SETTINGS, ...settings };
  if (!currentSettings.enabled) return [];

  const effectiveHideAmounts = hideAmounts || !currentSettings.showAmount;
  const span = {
    today,
    maxDate: addDaysIso(today, MAX_PLANNING_DAYS),
    leadDays: currentSettings.leadDays || [1, 0],
    showAmount: !effectiveHideAmounts,
    now,
  };

  const items = [];
  for (const loan of loans) {
    const reminder = reminderOf('loan', loan);
    if (!reminder || reminder.muted) continue;
    items.push({ kind: 'loan', record: loan, reminder, text: loanFigures(loan), path: `/loans/${reminder.recordId || loan.id}` });
  }
  for (const cheque of cheques) {
    const reminder = reminderOf('cheque', cheque, { includeDirection: true });
    if (!reminder || reminder.muted) continue;
    items.push({
      kind: 'cheque',
      record: cheque,
      reminder,
      text: { counterparty: (cheque.counterparty || '').trim(), direction: cheque.direction || '', amount: Number(cheque.amount || 0) },
      path: '/cheques',
    });
  }
  for (const sub of subscriptions) {
    const reminder = reminderOf('subscription', sub, { today });
    if (!reminder || reminder.muted) continue;
    items.push({
      kind: 'subscription',
      record: sub,
      reminder,
      text: { title: (sub.name || '').trim(), amount: Number(sub.amount || 0), currency: sub.currency, autoRenew: sub.autoRenew !== false },
      path: '/subscriptions',
    });
  }

  // Deduplicate by ID and sort chronologically
  const uniqueMap = new Map();
  for (const item of items.flatMap((i) => planRecord(i, span))) {
    if (!uniqueMap.has(item.id)) uniqueMap.set(item.id, item);
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
  subscriptions = [],
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
    subscriptions,
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
