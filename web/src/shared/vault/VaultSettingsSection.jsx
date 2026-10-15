/**
 * VaultSettingsSection.jsx — Account-wide end-to-end encryption, managed from account settings
 *
 * Mandatory for the whole account: portfolios (holdings + transactions), loans, incomes and
 * cheques are all encrypted in the browser with a key only the user's passphrase can unlock.
 * Once on it cannot be turned off — only the passphrase can be changed, or, when it is forgotten,
 * everything reset (VaultResetSection).
 */

import { intlLocale, t } from '../../utils/i18n.js';
import React, { useState } from 'react';
import { LockOpen, ShieldCheck, KeyRound, RefreshCw } from 'lucide-react';
import Button from '../ui/Button.jsx';
import AlertBanner from '../ui/AlertBanner.jsx';
import { useFeedback } from '../ui/FeedbackProvider.jsx';
import { useVault } from './useVault.js';
import VaultUnlockCard from './VaultUnlockCard.jsx';
import VaultResetSection from './VaultResetSection.jsx';
import { useDemo } from '../../features/demo/index.js';
import VaultEnableForm, { PassphraseInput } from './VaultEnableForm.jsx';
import { changeVaultPassphrase, lockAll, loadVault, VAULT_MIN_PASSPHRASE_LENGTH } from './vaultStore.js';

const faNum = (n) => Number(n || 0).toLocaleString(intlLocale());

export default function VaultSettingsSection() {
  const vault = useVault();
  const { toast } = useFeedback();
  const demo = useDemo();

  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPassConfirm, setNewPassConfirm] = useState('');
  const [changing, setChanging] = useState(false);

  const handleChangePass = async (e) => {
    e.preventDefault();
    setError('');
    if (newPass !== newPassConfirm) {
      setError(t('تکرار رمز جدید با رمز وارد شده یکسان نیست.'));
      return;
    }
    setBusy(true);
    try {
      await changeVaultPassphrase(currentPass, newPass);
      setCurrentPass('');
      setNewPass('');
      setNewPassConfirm('');
      setChanging(false);
      toast.success(t('رمز عبور رمزنگاری تغییر کرد.'));
    } catch (err) {
      setError(err.message || t('خطا در تغییر رمز'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="vault-settings" aria-labelledby="vault-settings-title">
      <div className="section-title">
        <span id="vault-settings-title">
          <ShieldCheck size={18} className="vault-settings-title-icon" />
          {t('رمزنگاری سرتاسری (E2EE)')}
        </span>
        {vault.status === 'unlocked' && <span className="vault-status-pill is-on">{t('فعال')}</span>}
        {vault.status === 'locked' && <span className="vault-status-pill is-locked">{t('قفل')}</span>}
        {vault.status === 'off' && <span className="vault-status-pill is-required">{t('الزامی')}</span>}
      </div>

      <p className="vault-settings-text">
        {t('همه اطلاعات مالی شما — پورتفوها (دارایی‌ها و تراکنش‌ها)، وام‌ها، درآمدها و چک‌ها — پیش از ارسال، در همین مرورگر رمزنگاری می‌شوند. سرور فقط داده رمزشده را می‌بیند و بدون رمز شما هیچ‌کس (حتی ما) نمی‌تواند آن را بخواند. برای امنیت کاربران، رمزنگاری برای همه حساب‌ها اجباری است و پس از فعال‌سازی خاموش نمی‌شود.')}
      </p>

      {error && <AlertBanner type="error" message={error} onClose={() => setError('')} />}

      {(vault.status === 'loading' || vault.status === 'idle') && (
        <p className="vault-settings-text">{t('در حال بررسی وضعیت رمزنگاری…')}</p>
      )}

      {vault.status === 'error' && (
        <AlertBanner
          type="error"
          message={vault.error || t('وضعیت رمزنگاری دریافت نشد.')}
          action={
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => loadVault(vault.userId, { force: true })}>
              {t('تلاش مجدد')}
            </Button>
          }
        />
      )}

      {vault.status === 'off' && (
        <>
          <AlertBanner
            type="error"
            message={t('رمزنگاری سرتاسری برای حساب شما هنوز فعال نشده است. تا آن را فعال نکنید، امکان ذخیره اطلاعات جدید وجود ندارد.')}
          />
          <VaultEnableForm onDone={() => toast.success(t('رمزنگاری سرتاسری حساب فعال شد.'))} />
        </>
      )}

      {vault.status === 'locked' && (
        <VaultUnlockCard title={t('رمزنگاری حساب قفل است')} className="vault-settings-unlock" showForgot={false} />
      )}

      {vault.status === 'unlocked' && (
        <>
          <div className="vault-settings-actions">
            <Button variant="secondary" size="sm" icon={<LockOpen size={14} />} onClick={lockAll} disabled={busy}>
              {t('قفل کردن در این مرورگر')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<KeyRound size={14} />}
              onClick={() => setChanging((v) => !v)}
              disabled={busy}
            >
              {t('تغییر رمز عبور')}
            </Button>
          </div>

          {changing && (
            <form className="vault-settings-block" onSubmit={handleChangePass}>
              <h5 className="vault-settings-subtitle">{t('تغییر رمز عبور رمزنگاری')}</h5>
              <PassphraseInput show={showPass} onToggle={() => setShowPass((v) => !v)} label={t('رمز فعلی')} id="vault-cur-pass" value={currentPass} onChange={(e) => setCurrentPass(e.target.value)} disabled={busy} />
              <PassphraseInput show={showPass} onToggle={() => setShowPass((v) => !v)} label={t('رمز جدید')} id="vault-next-pass" value={newPass} onChange={(e) => setNewPass(e.target.value)} disabled={busy} hint={t('حداقل {n} کاراکتر', { n: faNum(VAULT_MIN_PASSPHRASE_LENGTH) })} />
              <PassphraseInput show={showPass} onToggle={() => setShowPass((v) => !v)} label={t('تکرار رمز جدید')} id="vault-next-pass-confirm" value={newPassConfirm} onChange={(e) => setNewPassConfirm(e.target.value)} disabled={busy} />
              <p className="vault-settings-text">{t('داده‌ها دوباره رمزنگاری نمی‌شوند؛ فقط کلید حساب با رمز جدید قفل می‌شود.')}</p>
              <Button type="submit" variant="primary" loading={busy} block>{t('ذخیره رمز جدید')}</Button>
            </form>
          )}
        </>
      )}

      {(vault.status === 'locked' || vault.status === 'unlocked') && !demo?.isDemo && <VaultResetSection />}
    </section>
  );
}
