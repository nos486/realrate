/**
 * AppAlertSources.jsx — Publishes the app-wide alerts to the alert store (renders nothing)
 *
 * Mounted once inside the signed-in app (MainPage, under the loans and cheques providers):
 *   - loan installments overdue / due within a week (alertRules.js: loanAlerts)
 *   - cheques past due / due soon (chequeAlerts)
 *   - a newer Android app version (the update prompt)
 *   - the site announcement
 * Page-held data publishes its own alerts where it is loaded (a portfolio's drift: HoldingsView).
 * Then the delivery channels run over everything (alertChannels.js).
 */

import { useEffect, useMemo } from 'react';
import { useLoansContext } from '../../features/loans/context/LoansContext.jsx';
import { useChequesContext } from '../../features/cheques/context/ChequesContext.jsx';
import { useAppUpdate } from '../native/useAppUpdate.js';
import { hasUpdate } from '../native/appUpdate.js';
import { isNativeApp } from '../native/nativeApp.js';
import { scheduleDueNotifications } from '../native/dueNotifications.js';
import { syncSealedReminders } from '../push/webPushClient.js';
import { useVault } from '../vault/useVault.js';
import { usePrivacyMode } from '../../hooks/usePrivacyMode.js';
import { todayIso } from '../utils/dates.js';
import { loanAlerts, chequeAlerts } from './alertRules.js';
import { alertFingerprint } from '../../utils/alerts.js';
import { useAlertSource, useAlerts, getAlerts } from './alertStore.js';
import { deliverAlerts } from './alertChannels.js';

const faVersion = (v) => String(v || '').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

export default function AppAlertSources({ announcement = '' }) {
  const { loans } = useLoansContext();
  const { cheques } = useChequesContext();
  const update = useAppUpdate();
  const vault = useVault();
  const hideAmounts = usePrivacyMode();
  const today = todayIso();
  useAlertSource('loan', useMemo(() => loanAlerts(loans, today), [loans, today]));
  useAlertSource('cheque', useMemo(() => chequeAlerts(cheques, today), [cheques, today]));
  useAlertSource('app', hasUpdate(update) ? [{
    id: `app:update:${update.release.version}`,
    source: 'app',
    severity: 'info',
    title: `نسخه‌ی ${faVersion(update.release.version)} برنامه آماده است`,
    action: { label: 'به‌روزرسانی', path: '#app-update' },
  }] : []);
  useAlertSource('system', announcement ? [{
    id: `system:announcement:${announcement.length}:${announcement.slice(0, 24)}`,
    source: 'system',
    severity: 'info',
    title: 'اطلاعیه',
    message: announcement,
  }] : []);

  // Delivery beyond the app (email, once it is available)
  const deliveryKey = useAlerts({ includeDismissed: true }).map(alertFingerprint).join(';');
  useEffect(() => {
    if (!deliveryKey) return;
    deliverAlerts(getAlerts(), { appUrl: window.location.origin }).catch((err) => console.warn('Delivering alerts failed:', err));
  }, [deliveryKey]);

  // Local notifications on Android (everything decrypted on device)
  useEffect(() => {
    if (!isNativeApp() || vault?.status !== 'unlocked') return;
    scheduleDueNotifications({
      loans,
      cheques,
      isVaultUnlocked: true,
      today,
      hideAmounts,
    }).catch((err) => console.warn('Scheduling due notifications failed:', err));
  }, [loans, cheques, vault?.status, today, hideAmounts]);

  // Sealed Web Push reminders for website / PWA (desktop & iPhone users without Android app)
  useEffect(() => {
    if (isNativeApp() || vault?.status !== 'unlocked') return;
    syncSealedReminders({
      loans,
      cheques,
      isVaultUnlocked: true,
      today,
      hideAmounts,
    }).catch((err) => console.warn('Syncing sealed push reminders failed:', err));
  }, [loans, cheques, vault?.status, today, hideAmounts]);

  return null;
}
