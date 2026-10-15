/**
 * VaultEnableForm.jsx — Set up end-to-end encryption: choose the passphrase; the account vault is
 * created and the first portfolio with it (defaultPortfolio.js). Used by the first-run setup
 * screen (and account settings, for an account still without it).
 */

import { intlLocale, t } from '../../utils/i18n.js';
import React, { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import AlertBanner from '../ui/AlertBanner.jsx';
import { createVault, VAULT_MIN_PASSPHRASE_LENGTH } from './vaultStore.js';
import { ensureDefaultPortfolio } from './defaultPortfolio.js';

const faNum = (n) => Number(n || 0).toLocaleString(intlLocale());

export function PassphraseInput({ show, onToggle, ...props }) {
  return (
    <div className="vault-settings-pass">
      <Input type={show ? 'text' : 'password'} dir="ltr" autoComplete="new-password" {...props} />
      <button type="button" className="vault-settings-eye" onClick={onToggle} tabIndex={-1} aria-label={show ? t('مخفی کردن رمز') : t('نمایش رمز')}>
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

export function ProgressBar({ progress }) {
  if (!progress) return null;
  const pct = progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;
  return (
    <div className="vault-progress" role="status" aria-live="polite">
      <div className="vault-progress-top">
        <span>{progress.label || t('در حال پردازش…')}</span>
        <span>{t('{done} از {total}', { done: faNum(progress.done), total: faNum(progress.total) })}</span>
      </div>
      <div className="vault-progress-track">
        <div className="vault-progress-bar" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {() => void} [props.onDone] called once the vault is on
 * @param {string} [props.submitLabel]
 */
export default function VaultEnableForm({ onDone, submitLabel = t('فعال‌سازی رمزنگاری') }) {
  const [pass, setPass] = useState('');
  const [passConfirm, setPassConfirm] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleEnable = async (e) => {
    e.preventDefault();
    setError('');
    if (pass.length < VAULT_MIN_PASSPHRASE_LENGTH) {
      setError(t('رمز عبور باید حداقل {n} کاراکتر باشد.', { n: faNum(VAULT_MIN_PASSPHRASE_LENGTH) }));
      return;
    }
    if (pass !== passConfirm) {
      setError(t('تکرار رمز عبور با رمز وارد شده یکسان نیست.'));
      return;
    }
    if (!acknowledged) {
      setError(t('لطفاً تأیید کنید که در صورت فراموشی رمز، داده‌ها قابل بازیابی نیستند.'));
      return;
    }
    setBusy(true);
    try {
      await createVault(pass);
      await ensureDefaultPortfolio();
      setPass('');
      setPassConfirm('');
      setAcknowledged(false);
      onDone?.();
    } catch (err) {
      setError(err.message || t('خطا در فعال‌سازی رمزنگاری'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="vault-settings-block" onSubmit={handleEnable}>
      {error && <AlertBanner type="error" message={error} onClose={() => setError('')} />}
      <AlertBanner
        type="warning"
        message={t('رمز عبور رمزنگاری هیچ‌جا ذخیره نمی‌شود و قابل بازیابی نیست. اگر آن را فراموش کنید، داده‌های رمزنگاری‌شده برای همیشه از دست می‌روند.')}
      />
      <PassphraseInput
        show={showPass}
        onToggle={() => setShowPass((v) => !v)}
        label={t('رمز عبور رمزنگاری')}
        id="vault-new-pass"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
        disabled={busy}
        hint={t('حداقل {n} کاراکتر؛ آن را با رمز ورود به حساب یکی نکنید.', { n: faNum(VAULT_MIN_PASSPHRASE_LENGTH) })}
      />
      <PassphraseInput
        show={showPass}
        onToggle={() => setShowPass((v) => !v)}
        label={t('تکرار رمز عبور')}
        id="vault-new-pass-confirm"
        value={passConfirm}
        onChange={(e) => setPassConfirm(e.target.value)}
        disabled={busy}
      />
      <label className="vault-settings-check">
        <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} disabled={busy} />
        <span>{t('متوجه هستم که در صورت فراموشی رمز، اطلاعاتم قابل بازیابی نیست.')}</span>
      </label>
      <Button type="submit" variant="primary" loading={busy} icon={<Lock size={16} />} block>
        {submitLabel}
      </Button>
    </form>
  );
}
