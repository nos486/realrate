/**
 * VaultEnableForm.jsx — Set up end-to-end encryption: choose the passphrase, then encrypt every
 * existing record in the browser. Used by account settings and by the first-run setup screen.
 */

import React, { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import AlertBanner from '../ui/AlertBanner.jsx';
import { createVault, VAULT_MIN_PASSPHRASE_LENGTH } from './vaultStore.js';
import { encryptAccountData } from './vaultMigration.js';
import { useWarnBeforeUnload } from './useWarnBeforeUnload.js';

const faNum = (n) => Number(n || 0).toLocaleString('fa-IR');

export function PassphraseInput({ show, onToggle, ...props }) {
  return (
    <div className="vault-settings-pass">
      <Input type={show ? 'text' : 'password'} dir="ltr" autoComplete="new-password" {...props} />
      <button type="button" className="vault-settings-eye" onClick={onToggle} tabIndex={-1} aria-label={show ? 'مخفی کردن رمز' : 'نمایش رمز'}>
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
        <span>{progress.label || 'در حال پردازش…'}</span>
        <span>{faNum(progress.done)} از {faNum(progress.total)}</span>
      </div>
      <div className="vault-progress-track">
        <div className="vault-progress-bar" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function ReportBanner({ report, onClose }) {
  if (!report) return null;
  const failed = report.failed || [];
  if (failed.length === 0) return null;
  return (
    <AlertBanner
      type="warning"
      onClose={onClose}
      message={`${faNum(failed.length)} مورد پردازش نشد (${failed.slice(0, 3).join('، ')}${failed.length > 3 ? ' و …' : ''}). هیچ داده‌ای از دست نرفته — دوباره تلاش کنید.`}
    />
  );
}

/**
 * @param {object} props
 * @param {(report: { failed: string[] }) => void} [props.onDone] called once the vault is on
 * @param {string} [props.submitLabel]
 */
export default function VaultEnableForm({ onDone, submitLabel = 'فعال‌سازی و رمزنگاری همه داده‌ها' }) {
  const [pass, setPass] = useState('');
  const [passConfirm, setPassConfirm] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useWarnBeforeUnload(Boolean(progress));

  const handleEnable = async (e) => {
    e.preventDefault();
    setError('');
    if (pass.length < VAULT_MIN_PASSPHRASE_LENGTH) {
      setError(`رمز عبور باید حداقل ${faNum(VAULT_MIN_PASSPHRASE_LENGTH)} کاراکتر باشد.`);
      return;
    }
    if (pass !== passConfirm) {
      setError('تکرار رمز عبور با رمز وارد شده یکسان نیست.');
      return;
    }
    if (!acknowledged) {
      setError('لطفاً تأیید کنید که در صورت فراموشی رمز، داده‌ها قابل بازیابی نیستند.');
      return;
    }
    setBusy(true);
    try {
      await createVault(pass);
      setProgress({ done: 0, total: 0, label: 'در حال آماده‌سازی…' });
      const res = await encryptAccountData({ passphrase: pass, onProgress: setProgress });
      setProgress(null);
      setReport(res);
      setPass('');
      setPassConfirm('');
      setAcknowledged(false);
      onDone?.(res);
    } catch (err) {
      setError(err.message || 'خطا در فعال‌سازی رمزنگاری');
      setProgress(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="vault-settings-block" onSubmit={handleEnable}>
      {error && <AlertBanner type="error" message={error} onClose={() => setError('')} />}
      <ReportBanner report={report} onClose={() => setReport(null)} />
      <ProgressBar progress={progress} />
      <AlertBanner
        type="warning"
        message="رمز عبور رمزنگاری هیچ‌جا ذخیره نمی‌شود و قابل بازیابی نیست. اگر آن را فراموش کنید، داده‌های رمزنگاری‌شده برای همیشه از دست می‌روند."
      />
      <PassphraseInput
        show={showPass}
        onToggle={() => setShowPass((v) => !v)}
        label="رمز عبور رمزنگاری"
        id="vault-new-pass"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
        disabled={busy}
        hint={`حداقل ${faNum(VAULT_MIN_PASSPHRASE_LENGTH)} کاراکتر؛ آن را با رمز ورود به حساب یکی نکنید. اگر قبلاً برای پورتفویی رمز گذاشته‌اید، همان رمز را وارد کنید تا آن پورتفو خودکار منتقل شود.`}
      />
      <PassphraseInput
        show={showPass}
        onToggle={() => setShowPass((v) => !v)}
        label="تکرار رمز عبور"
        id="vault-new-pass-confirm"
        value={passConfirm}
        onChange={(e) => setPassConfirm(e.target.value)}
        disabled={busy}
      />
      <label className="vault-settings-check">
        <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} disabled={busy} />
        <span>متوجه هستم که در صورت فراموشی رمز، اطلاعاتم قابل بازیابی نیست.</span>
      </label>
      <Button type="submit" variant="primary" loading={busy} icon={<Lock size={16} />} block>
        {submitLabel}
      </Button>
    </form>
  );
}
