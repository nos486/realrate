/**
 * VaultResetSection.jsx — Forgotten E2EE passphrase: start over (account settings)
 *
 * Nobody — not even us — can read the encrypted data without the passphrase, so the only way back
 * is to delete it all: every portfolio, loan, income, cheque, expense and account, on the server
 * and on this device. The account then sets up encryption again with a new passphrase.
 *
 * Guarded three ways: a clear list of what goes, typing the confirmation phrase, and the account
 * password when the account has one (the server checks it too). The unlock card links here
 * ("/settings?vault-reset=1" opens and scrolls to it).
 */

import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Trash2, TriangleAlert } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import AlertBanner from '../ui/AlertBanner.jsx';
import { useFeedback } from '../ui/FeedbackProvider.jsx';
import { useAuth } from '../../features/auth/context/AuthContext.jsx';
import PasswordInput from '../../features/auth/components/PasswordInput.jsx';
import { isNativeApp } from '../native/nativeApp.js';
import { resetAccountVault } from './vaultStore.js';

/** What the user types to confirm */
export const VAULT_RESET_PHRASE = 'حذف همه اطلاعات';
export const VAULT_RESET_QUERY = 'vault-reset';

const normalize = (text) => String(text || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim();

export default function VaultResetSection() {
  const { user } = useAuth();
  const { toast } = useFeedback();
  const location = useLocation();
  const ref = useRef(null);
  const hasPassword = Boolean(user?.hasPassword);

  // Came from "forgot the passphrase?" on an unlock card: opened, and scrolled to
  const fromUnlock = new URLSearchParams(location.search).has(VAULT_RESET_QUERY);
  const [open, setOpen] = useState(fromUnlock);
  const [phrase, setPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (fromUnlock) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [fromUnlock]);

  const confirmed = normalize(phrase) === VAULT_RESET_PHRASE && (!hasPassword || password.length > 0);

  const close = () => {
    setOpen(false);
    setPhrase('');
    setPassword('');
    setError('');
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (!confirmed || busy) return;
    setBusy(true);
    setError('');
    try {
      await resetAccountVault({ password: hasPassword ? password : undefined });
      // The fingerprint unlock held the old key
      if (isNativeApp()) import('../native/biometricUnlock.js').then((m) => m.disableBiometric()).catch(() => {});
      toast.success('همه اطلاعات حذف شد. حالا رمزنگاری را با رمز جدید راه‌اندازی کنید.');
      // Screens may still hold the old data in memory: start the app over, on the setup screen
      setTimeout(() => window.location.replace('/'), 1500);
    } catch (err) {
      setError(err.message || 'بازنشانی انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className="vault-settings-block vault-reset" id="vault-reset">
      <h5 className="vault-settings-subtitle">رمز رمزنگاری را فراموش کرده‌اید؟</h5>
      <p className="vault-settings-text">
        رمز رمزنگاری جایی ذخیره نمی‌شود و بدون آن هیچ‌کس — حتی ما — نمی‌تواند اطلاعات شما را باز کند. اگر آن را فراموش
        کرده‌اید، تنها راه این است که همه اطلاعات حذف شود و با رمز جدید از نو شروع کنید.
      </p>

      {!open ? (
        <div className="vault-settings-actions">
          <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => setOpen(true)}>
            بازنشانی و حذف همه اطلاعات
          </Button>
        </div>
      ) : (
        <form className="vault-reset-form" onSubmit={handleReset}>
          <div className="vault-reset-warning" role="alert">
            <TriangleAlert size={18} aria-hidden="true" />
            <div>
              <strong>این کار برگشت‌پذیر نیست. این‌ها برای همیشه حذف می‌شوند:</strong>
              <ul>
                <li>همه پورتفوها با دارایی‌ها و تراکنش‌هایشان</li>
                <li>وام‌ها، درآمدها و درآمدهای ثابت، چک‌ها</li>
                <li>هزینه‌ها، بودجه‌ها و حساب‌های بانکی</li>
                <li>نسخه‌ی ذخیره‌شده روی این دستگاه و ورود با اثر انگشت</li>
              </ul>
              <span>حساب کاربری، ایمیل و ورود شما باقی می‌ماند.</span>
            </div>
          </div>

          {error && <AlertBanner type="error" message={error} onClose={() => setError('')} />}

          <Input
            id="vault-reset-phrase"
            label={`برای تأیید، عبارت «${VAULT_RESET_PHRASE}» را بنویسید`}
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            autoComplete="off"
            disabled={busy}
          />
          {hasPassword && (
            <PasswordInput
              id="vault-reset-password"
              label="رمز عبور ورود به حساب"
              hint="همان رمزی که با آن وارد حساب می‌شوید (نه رمز رمزنگاری)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={busy}
            />
          )}

          <div className="vault-settings-actions">
            <Button type="submit" variant="danger" size="sm" icon={<Trash2 size={14} />} loading={busy} disabled={!confirmed}>
              حذف همه اطلاعات
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={close} disabled={busy}>
              انصراف
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
