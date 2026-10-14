/**
 * PasswordSettingsSection.jsx — Sign in with email + password (account settings)
 *
 * A Google account can add a password here (no current password needed: the Google sign-in
 * already proves the account); an account with a password changes it with the current one.
 * Either way every other session is signed out.
 */

import { t } from '../../../utils/i18n.js';
import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { AlertBanner, Button } from '../../../shared/ui/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { setPassword } from '../api/authApi.js';
import PasswordInput from './PasswordInput.jsx';
import { PASSWORD_HINT, checkNewPassword } from './passwordRules.js';

export default function PasswordSettingsSection() {
  const { user, updateUser } = useAuth();
  const hasPassword = Boolean(user?.hasPassword);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const error = touched ? checkNewPassword(next, confirm) : '';

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setTouched(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (checkNewPassword(next, confirm)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await setPassword({ currentPassword: hasPassword ? current : undefined, newPassword: next });
      updateUser({ hasPassword: true });
      setMsg({ type: 'success', text: res.message || t('رمز عبور ذخیره شد.') });
      reset();
      setOpen(false);
    } catch (err) {
      setMsg({ type: 'error', text: err.message || t('ذخیره رمز عبور ناموفق بود.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="vault-settings" aria-labelledby="password-settings-title">
      <div className="section-title">
        <span id="password-settings-title">
          <KeyRound size={18} className="vault-settings-title-icon" />
          {t('ورود با ایمیل و رمز عبور')}
        </span>
        <span className={`vault-status-pill ${hasPassword ? 'is-on' : ''}`}>{hasPassword ? t('فعال') : t('تعیین نشده')}</span>
      </div>

      <p className="vault-settings-text">
        {hasPassword
          ? <>{t('می‌توانید با ایمیل')} <bdi dir="ltr">{user?.email}</bdi> {t('و رمز عبور، یا با گوگل وارد شوید.')}</>
          : <>{t('حساب شما با گوگل ساخته شده است. با تعیین رمز عبور، بدون گوگل هم با ایمیل')} <bdi dir="ltr">{user?.email}</bdi> {t('وارد می‌شوید.')}</>}
        {' '}{t('این رمز با رمز «رمزنگاری سرتاسری» جداست.')}
      </p>

      {msg && <AlertBanner type={msg.type} message={msg.text} onClose={() => setMsg(null)} />}

      {open ? (
        <form className="auth-form" onSubmit={submit} noValidate>
          {hasPassword && (
            <PasswordInput id="settings-current-password" label={t('رمز عبور فعلی')} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          )}
          <PasswordInput id="settings-new-password" label={t('رمز عبور جدید')} hint={PASSWORD_HINT} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          <PasswordInput id="settings-confirm-password" label={t('تکرار رمز عبور جدید')} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" error={error} />
          <p className="auth-muted">{t('با ذخیره، از همه دستگاه‌های دیگر خارج می‌شوید.')}</p>
          <div className="vault-settings-actions">
            <Button type="submit" loading={busy} disabled={!next || !confirm || (hasPassword && !current)}>
              {hasPassword ? t('تغییر رمز عبور') : t('تعیین رمز عبور')}
            </Button>
            <Button variant="secondary" onClick={() => { reset(); setOpen(false); }} disabled={busy}>{t('انصراف')}</Button>
          </div>
        </form>
      ) : (
        <div className="vault-settings-actions">
          <Button variant="secondary" icon={<KeyRound size={15} />} onClick={() => { setMsg(null); setOpen(true); }}>
            {hasPassword ? t('تغییر رمز عبور') : t('تعیین رمز عبور')}
          </Button>
        </div>
      )}
    </section>
  );
}
