/**
 * AppSetupPrompt.jsx — Right after the Android app is installed (the first time a user's records
 * are open in it), a sheet offers what makes the app worth having: reading bank SMS and opening
 * with the fingerprint. «فعال کن» sends the requests one after the other — Android's SMS (and
 * notification) permission, then the fingerprint prompt; «بعداً» closes it. Shown once per user
 * on this phone; both stay in «تنظیمات اپ».
 *
 * Only what is missing is offered: SMS for users of the expenses section whose permission or
 * automatic reading isn't on yet, the fingerprint where the phone has one and it isn't set up.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Fingerprint, MessageSquareText, Check } from 'lucide-react';
import AppSheet from './AppSheet.jsx';
import { Button } from '../ui/index.js';
import { useFeedback } from '../ui/FeedbackProvider.jsx';
import { useAuth } from '../../features/auth/index.js';
import { useFeature } from '../features/useFeature.js';
import { useVault } from '../vault/useVault.js';
import { isNativeApp } from '../native/nativeApp.js';
import { smsPermission, enableSmsReading, getSmsSettings } from '../native/smsInbox.js';
import { isBiometricAvailable, isBiometricEnabled, enableBiometric } from '../native/biometricUnlock.js';

const doneKey = (userId) => `realrate_app_setup_done:${userId}`;

function isDone(userId) {
  try {
    return localStorage.getItem(doneKey(userId)) === '1';
  } catch {
    return true;
  }
}

function markDone(userId) {
  try {
    localStorage.setItem(doneKey(userId), '1');
  } catch {
    // Storage unavailable: it may show again, nothing worse
  }
}

/** What is missing on this phone: { sms, fingerprint } (booleans) */
async function missingSetup({ userId, hasExpenses }) {
  const [permission, bioAvailable, bioEnabled] = await Promise.all([
    hasExpenses ? smsPermission() : Promise.resolve('unavailable'),
    isBiometricAvailable(),
    isBiometricEnabled(userId),
  ]);
  return {
    sms: hasExpenses && permission !== 'unavailable' && (permission !== 'granted' || !getSmsSettings().auto),
    fingerprint: bioAvailable && !bioEnabled,
  };
}

/** One thing to turn on, with a tick once it is */
function SetupItem({ on, Icon, title, text }) {
  return (
    <div className={`app-setup-item${on ? ' is-done' : ''}`}>
      <span className="app-setup-icon" aria-hidden="true">{on ? <Check size={18} /> : <Icon size={18} />}</span>
      <span className="app-setup-text">
        <strong>{title}</strong>
        <small>{text}</small>
      </span>
    </div>
  );
}

export default function AppSetupPrompt() {
  const { user } = useAuth();
  const vault = useVault();
  const hasExpenses = useFeature('expenses');
  const { toast } = useFeedback();
  const [needs, setNeeds] = useState(null); // null: not shown; { sms, fingerprint }
  const [done, setDone] = useState({ sms: false, fingerprint: false });
  const [busy, setBusy] = useState(false);

  const userId = user?.id || user?.userId || '';
  // The fingerprint keeps the key of the open records: offered once they are open
  const ready = isNativeApp() && Boolean(userId) && !user?.demo && vault.status === 'unlocked';

  useEffect(() => {
    if (!ready || isDone(userId)) return undefined;
    let alive = true;
    missingSetup({ userId, hasExpenses }).then((missing) => {
      if (!alive) return;
      if (missing.sms || missing.fingerprint) setNeeds(missing);
      else markDone(userId);
    });
    return () => {
      alive = false;
    };
  }, [ready, userId, hasExpenses]);

  const close = useCallback(() => {
    markDone(userId);
    setNeeds(null);
  }, [userId]);

  const enableAll = async () => {
    setBusy(true);
    const result = { ...done };
    if (needs.sms && !result.sms) {
      const { permission } = await enableSmsReading();
      result.sms = permission === 'granted';
      if (!result.sms) toast.error('اجازه‌ی خواندن پیامک داده نشد؛ بعداً از «تنظیمات اپ» یا تنظیمات گوشی قابل فعال شدن است.', { duration: 7000 });
    }
    if (needs.fingerprint && !result.fingerprint) {
      try {
        await enableBiometric();
        result.fingerprint = true;
      } catch (err) {
        if (err?.code !== 'CANCELED') toast.error(err?.message || 'فعال کردن اثر انگشت ممکن نشد.');
      }
    }
    setDone(result);
    setBusy(false);
    const all = (!needs.sms || result.sms) && (!needs.fingerprint || result.fingerprint);
    if (all) {
      const parts = [needs.sms && 'پیامک‌های بانک خوانده می‌شوند', needs.fingerprint && 'اپ با اثر انگشت باز می‌شود'].filter(Boolean);
      toast.success(`آماده است: ${parts.join(' و ')}.`);
      close();
    }
  };

  if (!needs) return null;

  return (
    <AppSheet open onClose={close} title="راه‌اندازی اپ" className="app-setup-sheet">
      <p className="app-setup-intro">دو کار کوچک تا اپ کامل کار کند:</p>
      {needs.sms && (
        <SetupItem
          on={done.sms}
          Icon={MessageSquareText}
          title="خواندن پیامک‌های بانک"
          text="برداشت و واریز از پیامک بانک خوانده می‌شود تا فقط دسته‌اش را بزنید. متن پیامک‌ها روی گوشی می‌ماند."
        />
      )}
      {needs.fingerprint && (
        <SetupItem
          on={done.fingerprint}
          Icon={Fingerprint}
          title="باز کردن با اثر انگشت"
          text="اطلاعات رمزنگاری‌شده بدون تایپ رمز عبور باز می‌شود."
        />
      )}
      <div className="app-setup-actions">
        <Button onClick={enableAll} loading={busy}>فعال کن</Button>
        <Button variant="ghost" onClick={close} disabled={busy}>بعداً</Button>
      </div>
      <p className="app-setup-note">هر دو بعداً هم از «تنظیمات اپ» قابل تغییرند.</p>
    </AppSheet>
  );
}
