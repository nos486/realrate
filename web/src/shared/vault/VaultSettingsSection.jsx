/**
 * VaultSettingsSection.jsx — Account-wide end-to-end encryption, managed from account settings
 *
 * Mandatory for the whole account: portfolios (holdings + transactions), loans, incomes and
 * cheques are all encrypted in the browser with a key only the user's passphrase can unlock.
 * Once on it cannot be turned off — only the passphrase can be changed.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { LockOpen, ShieldCheck, KeyRound, RefreshCw } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import AlertBanner from '../ui/AlertBanner.jsx';
import { useFeedback } from '../ui/FeedbackProvider.jsx';
import { useVault } from './useVault.js';
import VaultUnlockCard from './VaultUnlockCard.jsx';
import VaultEnableForm, { PassphraseInput, ProgressBar, ReportBanner } from './VaultEnableForm.jsx';
import { useWarnBeforeUnload } from './useWarnBeforeUnload.js';
import { changeVaultPassphrase, lockAll, loadVault, bumpVaultEpoch, VAULT_MIN_PASSPHRASE_LENGTH } from './vaultStore.js';
import { encryptAccountData, findPendingPlaintext, adoptLegacyPortfolio } from './vaultMigration.js';

const faNum = (n) => Number(n || 0).toLocaleString('fa-IR');

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
  const { toast } = useFeedback();

  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);

  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPassConfirm, setNewPassConfirm] = useState('');
  const [changing, setChanging] = useState(false);

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
      setChanging(false);
      toast.success('رمز عبور رمزنگاری تغییر کرد.');
    } catch (err) {
      setError(err.message || 'خطا در تغییر رمز');
    } finally {
      setBusy(false);
    }
  };

  // Leaving mid-migration is safe (the next run finishes it) but leaves data half-converted
  // until then — ask the browser to confirm closing or reloading the tab meanwhile.
  useWarnBeforeUnload(Boolean(progress));

  const pendingCount = pending
    ? pending.plainPortfolios.length + pending.plainLoans + pending.plainIncomes + pending.plainCheques + pending.plainRecurringIncomes
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
        {vault.status === 'off' && <span className="vault-status-pill is-required">الزامی</span>}
      </div>

      <p className="vault-settings-text">
        همه اطلاعات مالی شما — پورتفوها (دارایی‌ها و تراکنش‌ها)، وام‌ها، درآمدها و چک‌ها — پیش از ارسال، در همین مرورگر
        رمزنگاری می‌شوند. سرور فقط داده رمزشده را می‌بیند و بدون رمز شما هیچ‌کس (حتی ما) نمی‌تواند آن را بخواند. برای امنیت
        کاربران، رمزنگاری برای همه حساب‌ها اجباری است و پس از فعال‌سازی خاموش نمی‌شود.
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
        <>
          <AlertBanner
            type="error"
            message="رمزنگاری سرتاسری برای حساب شما هنوز فعال نشده است. تا آن را فعال نکنید، امکان ذخیره اطلاعات جدید وجود ندارد."
          />
          <VaultEnableForm
            onDone={(res) => {
              setReport(res);
              refreshPending();
              if (res.failed.length === 0) toast.success('رمزنگاری سرتاسری حساب فعال شد و همه داده‌ها رمزنگاری شدند.');
            }}
          />
        </>
      )}

      {vault.status === 'locked' && (
        <VaultUnlockCard title="رمزنگاری حساب قفل است" className="vault-settings-unlock" />
      )}

      {vault.status === 'unlocked' && (
        <>
          <div className="vault-settings-actions">
            <Button variant="secondary" size="sm" icon={<LockOpen size={14} />} onClick={lockAll} disabled={busy}>
              قفل کردن در این مرورگر
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<KeyRound size={14} />}
              onClick={() => setChanging((v) => !v)}
              disabled={busy}
            >
              تغییر رمز عبور
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

          {changing && (
            <form className="vault-settings-block" onSubmit={handleChangePass}>
              <h5 className="vault-settings-subtitle">تغییر رمز عبور رمزنگاری</h5>
              <PassphraseInput show={showPass} onToggle={() => setShowPass((v) => !v)} label="رمز فعلی" id="vault-cur-pass" value={currentPass} onChange={(e) => setCurrentPass(e.target.value)} disabled={busy} />
              <PassphraseInput show={showPass} onToggle={() => setShowPass((v) => !v)} label="رمز جدید" id="vault-next-pass" value={newPass} onChange={(e) => setNewPass(e.target.value)} disabled={busy} hint={`حداقل ${faNum(VAULT_MIN_PASSPHRASE_LENGTH)} کاراکتر`} />
              <PassphraseInput show={showPass} onToggle={() => setShowPass((v) => !v)} label="تکرار رمز جدید" id="vault-next-pass-confirm" value={newPassConfirm} onChange={(e) => setNewPassConfirm(e.target.value)} disabled={busy} />
              <p className="vault-settings-text">داده‌ها دوباره رمزنگاری نمی‌شوند؛ فقط کلید حساب با رمز جدید قفل می‌شود.</p>
              <Button type="submit" variant="primary" loading={busy} block>ذخیره رمز جدید</Button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
