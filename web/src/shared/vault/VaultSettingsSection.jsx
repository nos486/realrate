/**
 * VaultSettingsSection.jsx — Account-wide end-to-end encryption, managed from account settings
 *
 * One switch for the whole account: portfolios (holdings + transactions), loans and incomes are
 * all encrypted in the browser with a key only the user's passphrase can unlock.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Lock, LockOpen, ShieldCheck, ShieldOff, KeyRound, RefreshCw, Eye, EyeOff } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import AlertBanner from '../ui/AlertBanner.jsx';
import { useFeedback } from '../ui/FeedbackProvider.jsx';
import { useVault } from './useVault.js';
import VaultUnlockCard from './VaultUnlockCard.jsx';
import {
  createVault,
  changeVaultPassphrase,
  verifyVaultPassphrase,
  lockVault,
  loadVault,
  bumpVaultEpoch,
  VAULT_MIN_PASSPHRASE_LENGTH,
} from './vaultStore.js';
import {
  encryptAccountData,
  decryptAccountData,
  findPendingPlaintext,
  adoptLegacyPortfolio,
} from './vaultMigration.js';

const faNum = (n) => Number(n || 0).toLocaleString('fa-IR');

function PassphraseInput({ show, onToggle, ...props }) {
  return (
    <div className="vault-settings-pass">
      <Input type={show ? 'text' : 'password'} dir="ltr" autoComplete="new-password" {...props} />
      <button type="button" className="vault-settings-eye" onClick={onToggle} tabIndex={-1} aria-label={show ? 'مخفی کردن رمز' : 'نمایش رمز'}>
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

function ProgressBar({ progress }) {
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

function ReportBanner({ report, onClose }) {
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

/** Portfolios that still have their own (older) vault passphrase */
function LegacyPortfolios({ portfolios, onAdopted }) {
  const [passes, setPasses] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [errors, setErrors] = useState({});

  if (!portfolios.length) return null;

  const adopt = async (portfolio) => {
    setBusyId(portfolio.id);
    setErrors((prev) => ({ ...prev, [portfolio.id]: '' }));
    try {
      const ok = await adoptLegacyPortfolio(portfolio, passes[portfolio.id]);
      if (!ok) {
        setErrors((prev) => ({ ...prev, [portfolio.id]: 'رمز گاوصندوق این پورتفو نادرست است.' }));
      } else {
        onAdopted();
      }
    } catch (err) {
      setErrors((prev) => ({ ...prev, [portfolio.id]: err.message || 'خطا در انتقال' }));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="vault-settings-block">
      <h5 className="vault-settings-subtitle">پورتفوهایی با رمز جداگانه</h5>
      <p className="vault-settings-text">
        این پورتفوها قبلاً با رمز اختصاصی خودشان رمزنگاری شده‌اند. با وارد کردن رمز قبلی هر کدام، به رمزنگاری حساب منتقل
        می‌شوند و از این پس با همان رمز حساب باز می‌شوند (داده‌هایشان دست نمی‌خورد). تا آن موقع، مثل قبل با رمز خودشان کار می‌کنند.
      </p>
      {portfolios.map((p) => (
        <form
          key={p.id}
          className="vault-legacy-row"
          onSubmit={(e) => {
            e.preventDefault();
            adopt(p);
          }}
        >
          <strong className="vault-legacy-name">{p.name}</strong>
          <Input
            type="password"
            dir="ltr"
            placeholder="رمز قبلی گاوصندوق این پورتفو"
            value={passes[p.id] || ''}
            onChange={(e) => setPasses((prev) => ({ ...prev, [p.id]: e.target.value }))}
            error={errors[p.id] || undefined}
            disabled={busyId === p.id}
            aria-label={`رمز قبلی پورتفوی ${p.name}`}
          />
          <Button type="submit" variant="secondary" size="sm" loading={busyId === p.id} disabled={!passes[p.id]}>
            انتقال
          </Button>
        </form>
      ))}
    </div>
  );
}

export default function VaultSettingsSection() {
  const vault = useVault();
  const { confirm, toast } = useFeedback();

  const [pass, setPass] = useState('');
  const [passConfirm, setPassConfirm] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);

  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPassConfirm, setNewPassConfirm] = useState('');
  const [disablePass, setDisablePass] = useState('');
  const [panel, setPanel] = useState(null); // 'change' | 'disable' | null

  const refreshPending = useCallback(async () => {
    try {
      setPending(await findPendingPlaintext());
    } catch {
      setPending(null);
    }
  }, []);

  useEffect(() => {
    if (vault.status !== 'unlocked' || busy) return undefined;
    let cancelled = false;
    findPendingPlaintext()
      .then((res) => {
        if (!cancelled) setPending(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [vault.status, vault.epoch, busy]);

  const runEncrypt = async (passphrase) => {
    setProgress({ done: 0, total: 0, label: 'در حال آماده‌سازی…' });
    const res = await encryptAccountData({ passphrase, onProgress: setProgress });
    setReport(res);
    setProgress(null);
    await refreshPending();
    return res;
  };

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
      const res = await runEncrypt(pass);
      setPass('');
      setPassConfirm('');
      setAcknowledged(false);
      if (res.failed.length === 0) toast.success('رمزنگاری سرتاسری حساب فعال شد و همه داده‌ها رمزنگاری شدند.');
    } catch (err) {
      setError(err.message || 'خطا در فعال‌سازی رمزنگاری');
      setProgress(null);
    } finally {
      setBusy(false);
    }
  };

  const handleEncryptPending = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await runEncrypt();
      if (res.failed.length === 0) toast.success('داده‌های باقی‌مانده رمزنگاری شدند.');
    } catch (err) {
      setError(err.message || 'خطا در رمزنگاری');
      setProgress(null);
    } finally {
      setBusy(false);
    }
  };

  const handleChangePass = async (e) => {
    e.preventDefault();
    setError('');
    if (newPass !== newPassConfirm) {
      setError('تکرار رمز جدید با رمز وارد شده یکسان نیست.');
      return;
    }
    setBusy(true);
    try {
      await changeVaultPassphrase(currentPass, newPass);
      setCurrentPass('');
      setNewPass('');
      setNewPassConfirm('');
      setPanel(null);
      toast.success('رمز عبور رمزنگاری تغییر کرد.');
    } catch (err) {
      setError(err.message || 'خطا در تغییر رمز');
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (!(await verifyVaultPassphrase(disablePass))) {
        setError('رمز عبور رمزنگاری نادرست است.');
        return;
      }
      const confirmed = await confirm({
        title: 'غیرفعال‌سازی رمزنگاری سرتاسری',
        message: 'همه پورتفوها، وام‌ها و درآمدها رمزگشایی و به‌صورت عادی روی سرور ذخیره می‌شوند. ادامه می‌دهید؟',
        confirmLabel: 'غیرفعال‌سازی',
        danger: true,
      });
      if (!confirmed) return;
      setProgress({ done: 0, total: 0, label: 'در حال آماده‌سازی…' });
      const res = await decryptAccountData({ onProgress: setProgress });
      setReport(res);
      setProgress(null);
      setDisablePass('');
      setPanel(null);
      if (res.failed.length === 0) toast.success('رمزنگاری سرتاسری غیرفعال شد.');
    } catch (err) {
      setError(err.message || 'خطا در غیرفعال‌سازی');
      setProgress(null);
    } finally {
      setBusy(false);
    }
  };

  const pendingCount = pending
    ? pending.plainPortfolios.length + pending.plainLoans + pending.plainIncomes
    : 0;

  return (
    <section className="vault-settings" aria-labelledby="vault-settings-title">
      <div className="section-title">
        <span id="vault-settings-title">
          <ShieldCheck size={18} className="vault-settings-title-icon" />
          رمزنگاری سرتاسری (E2EE)
        </span>
        {vault.status === 'unlocked' && <span className="vault-status-pill is-on">فعال</span>}
        {vault.status === 'locked' && <span className="vault-status-pill is-locked">قفل</span>}
        {vault.status === 'off' && <span className="vault-status-pill">غیرفعال</span>}
      </div>

      <p className="vault-settings-text">
        با فعال‌سازی، همه اطلاعات مالی شما — پورتفوها (دارایی‌ها و تراکنش‌ها)، وام‌ها و درآمدها — پیش از ارسال، در
        همین مرورگر رمزنگاری می‌شوند. سرور فقط داده رمزشده را می‌بیند و بدون رمز شما هیچ‌کس (حتی ما) نمی‌تواند آن را بخواند.
      </p>

      {error && <AlertBanner type="error" message={error} onClose={() => setError('')} />}
      <ReportBanner report={report} onClose={() => setReport(null)} />
      <ProgressBar progress={progress} />

      {(vault.status === 'loading' || vault.status === 'idle') && (
        <p className="vault-settings-text">در حال بررسی وضعیت رمزنگاری…</p>
      )}

      {vault.status === 'error' && (
        <AlertBanner
          type="error"
          message={vault.error || 'وضعیت رمزنگاری دریافت نشد.'}
          action={
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => loadVault(vault.userId, { force: true })}>
              تلاش مجدد
            </Button>
          }
        />
      )}

      {vault.status === 'off' && (
        <form className="vault-settings-block" onSubmit={handleEnable}>
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
            hint={`حداقل ${faNum(VAULT_MIN_PASSPHRASE_LENGTH)} کاراکتر؛ آن را با رمز حساب گوگل یکی نکنید. اگر قبلاً برای پورتفویی رمز گذاشته‌اید، همان رمز را وارد کنید تا آن پورتفو خودکار منتقل شود.`}
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
            فعال‌سازی و رمزنگاری همه داده‌ها
          </Button>
        </form>
      )}

      {vault.status === 'locked' && (
        <VaultUnlockCard title="رمزنگاری حساب قفل است" className="vault-settings-unlock" />
      )}

      {vault.status === 'unlocked' && (
        <>
          <div className="vault-settings-actions">
            <Button variant="secondary" size="sm" icon={<LockOpen size={14} />} onClick={lockVault} disabled={busy}>
              قفل کردن در این مرورگر
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<KeyRound size={14} />}
              onClick={() => setPanel(panel === 'change' ? null : 'change')}
              disabled={busy}
            >
              تغییر رمز عبور
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<ShieldOff size={14} />}
              onClick={() => setPanel(panel === 'disable' ? null : 'disable')}
              disabled={busy}
            >
              غیرفعال‌سازی
            </Button>
          </div>

          {pendingCount > 0 && (
            <div className="vault-settings-block">
              <AlertBanner
                type="info"
                message={`${faNum(pendingCount)} مورد هنوز رمزنگاری نشده است (مثلاً داده‌ای که از دستگاه دیگری با نسخه قدیمی ثبت شده).`}
                action={
                  <Button size="sm" variant="secondary" loading={busy} onClick={handleEncryptPending}>
                    رمزنگاری
                  </Button>
                }
              />
            </div>
          )}

          <LegacyPortfolios portfolios={pending?.legacyPortfolios || []} onAdopted={() => { refreshPending(); bumpVaultEpoch(); }} />

          {panel === 'change' && (
            <form className="vault-settings-block" onSubmit={handleChangePass}>
              <h5 className="vault-settings-subtitle">تغییر رمز عبور رمزنگاری</h5>
              <PassphraseInput show={showPass} onToggle={() => setShowPass((v) => !v)} label="رمز فعلی" id="vault-cur-pass" value={currentPass} onChange={(e) => setCurrentPass(e.target.value)} disabled={busy} />
              <PassphraseInput show={showPass} onToggle={() => setShowPass((v) => !v)} label="رمز جدید" id="vault-next-pass" value={newPass} onChange={(e) => setNewPass(e.target.value)} disabled={busy} hint={`حداقل ${faNum(VAULT_MIN_PASSPHRASE_LENGTH)} کاراکتر`} />
              <PassphraseInput show={showPass} onToggle={() => setShowPass((v) => !v)} label="تکرار رمز جدید" id="vault-next-pass-confirm" value={newPassConfirm} onChange={(e) => setNewPassConfirm(e.target.value)} disabled={busy} />
              <p className="vault-settings-text">داده‌ها دوباره رمزنگاری نمی‌شوند؛ فقط کلید حساب با رمز جدید قفل می‌شود.</p>
              <Button type="submit" variant="primary" loading={busy} block>ذخیره رمز جدید</Button>
            </form>
          )}

          {panel === 'disable' && (
            <form className="vault-settings-block" onSubmit={handleDisable}>
              <h5 className="vault-settings-subtitle">غیرفعال‌سازی رمزنگاری</h5>
              <p className="vault-settings-text">
                همه داده‌ها رمزگشایی و به حالت عادی ذخیره می‌شوند. اگر پورتفوی عمومی رمزنگاری‌شده دارید، لینک اشتراک آن دوباره بدون کلید کار می‌کند.
              </p>
              <PassphraseInput show={showPass} onToggle={() => setShowPass((v) => !v)} label="رمز عبور رمزنگاری" id="vault-disable-pass" value={disablePass} onChange={(e) => setDisablePass(e.target.value)} disabled={busy} />
              <Button type="submit" variant="danger" loading={busy} disabled={!disablePass} block>رمزگشایی همه داده‌ها و غیرفعال‌سازی</Button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
