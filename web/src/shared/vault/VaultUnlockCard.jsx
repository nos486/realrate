import React, { useEffect, useRef, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { Link } from 'react-router-dom';
import VaultLockCard from '../../features/portfolio/components/VaultLockCard.jsx';
import { unlockVault } from './vaultStore.js';
import { biometricLabel, isBiometricEnabled, unlockWithBiometric } from '../native/biometricUnlock.js';
import { isNativeApp } from '../native/nativeApp.js';
import { useFeedback } from '../ui/FeedbackProvider.jsx';
import { t } from '../../utils/i18n.js';

/*
 * The fingerprint/passkey prompt opens by itself once per stay in the foreground: on the site once
 * per page load, in the Android app again each time the app comes back from the background while
 * locked (the auto-lock usually locked it meanwhile). Closing the prompt does not reopen it until
 * the app has been in the background again; the button stays for a second try.
 */
let promptedThisForeground = false;
/** When the last automatic or manual prompt closed (ms) */
let lastPromptEnd = 0;
/**
 * The system fingerprint dialog itself can hide and show the page on some phones: a return this
 * soon after a prompt closed is that dialog, not the user coming back
 */
const PROMPT_ECHO_MS = 1500;

const pageVisible = () => typeof document === 'undefined' || !document.hidden;

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isNativeApp()) promptedThisForeground = false;
  });
}

/** Test hook: forget the prompts of this page */
export function resetBiometricAutoPrompt() {
  promptedThisForeground = false;
  lastPromptEnd = 0;
}

/**
 * Unlock prompt for the account-wide vault (loans, incomes, account-protected portfolios).
 * One passphrase opens everything for this tab. With fingerprint unlock set up (app settings in
 * the Android app) or a passkey (encryption settings on the website), a button opens it too.
 * "Forgot the passphrase?" leads to the reset in account settings (VaultResetSection), or
 * `onForgot` when a screen shows the reset itself (VaultLockGate).
 */
export default function VaultUnlockCard({ title = t('اطلاعات رمزنگاری شده است'), description, className = '', showForgot = true, onForgot }) {
  const { toast } = useFeedback();
  const [biometric, setBiometric] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleUnlock = async (passphrase) => {
    const ok = await unlockVault(passphrase);
    if (!ok) throw new Error(t('رمز عبور رمزنگاری حساب اشتباه است.'));
    return true;
  };

  const busyRef = useRef(false);
  const enabledRef = useRef(false);

  const handleBiometric = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await unlockWithBiometric();
    } catch (err) {
      enabledRef.current = false;
      setBiometric(false);
      toast.error(err.message);
    } finally {
      lastPromptEnd = Date.now();
      busyRef.current = false;
      setBusy(false);
    }
  };

  // Opens the prompt by itself when this stay in the foreground has not had one yet
  const autoPrompt = () => {
    if (!enabledRef.current || busyRef.current || promptedThisForeground || !pageVisible()) return;
    promptedThisForeground = true;
    if (Date.now() - lastPromptEnd < PROMPT_ECHO_MS) return;
    handleBiometric();
  };

  useEffect(() => {
    let cancelled = false;
    isBiometricEnabled().then((enabled) => {
      if (cancelled || !enabled) return;
      enabledRef.current = true;
      setBiometric(true);
      autoPrompt();
    });
    // Back from the background while still locked: ask again
    const onVisible = () => {
      if (!document.hidden) autoPrompt();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
    // Set up once when the card appears; the handlers read refs and module state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <VaultLockCard
      title={title}
      description={
        description ||
        t('رمزنگاری سرتاسری حساب شما فعال است. برای دیدن اطلاعات، رمز عبور رمزنگاری حساب را وارد کنید — با یک بار باز کردن، همه بخش‌ها باز می‌شوند.')
      }
      onUnlock={handleUnlock}
      className={className}
      extraAction={biometric && (
        <button type="button" className="btn-vault-biometric" onClick={handleBiometric} disabled={busy}>
          <Fingerprint size={16} />
          {biometricLabel()}
        </button>
      )}
      helpLink={showForgot && (
        onForgot ? (
          <button type="button" className="vault-lock-forgot" onClick={onForgot}>
            {t('رمز را فراموش کرده‌اید؟')}
          </button>
        ) : (
          <Link to="/settings?vault-reset=1" className="vault-lock-forgot">
            {t('رمز را فراموش کرده‌اید؟')}
          </Link>
        )
      )}
    />
  );
}
