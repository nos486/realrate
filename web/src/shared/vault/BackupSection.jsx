/**
 * BackupSection.jsx — «پشتیبان کامل»: download everything the account holds in one file, and
 * restore it (here or in another account) — fullBackup.js
 *
 * The file is decrypted unless a password is given for it. Restoring replaces records with the
 * same id and adds the others; nothing is deleted.
 */

import { intlLocale, t } from '../../utils/i18n.js';
import React, { useRef, useState } from 'react';
import { DatabaseBackup, Download, Upload } from 'lucide-react';
import Button from '../ui/Button.jsx';
import AlertBanner from '../ui/AlertBanner.jsx';
import Modal from '../ui/Modal.jsx';
import { useFeedback } from '../ui/FeedbackProvider.jsx';
import { useVault } from './useVault.js';
import { useDemo } from '../../features/demo/index.js';
import { PassphraseInput, ProgressBar } from './VaultEnableForm.jsx';
import { bumpVaultEpoch } from './vaultStore.js';
import { buildFullBackup, serializeBackup, parseBackup, restoreFullBackup, summarizeBackup } from './fullBackup.js';
import { saveTextFile } from '../utils/fileExport.js';
import { todayIso } from '../utils/dates.js';

const faNum = (n) => Number(n || 0).toLocaleString(intlLocale());

const KIND_LABELS = {
  holding: t('خرید و موجودی پورتفو'),
  transaction: t('فروش و پرداخت از پورتفو'),
  portfolio_layout: t('دسته‌بندی و هدف پورتفو'),
  risk_profile: t('نتیجه آزمون ریسک‌پذیری'),
  loan: t('وام'),
  income: t('درآمد'),
  cheque: t('چک'),
  expense_group: t('بخش هزینه'),
  expense: t('هزینه'),
  bank_account: t('حساب'),
  transfer: t('انتقال بین حساب‌ها'),
  category_settings: t('تنظیم دسته‌ها'),
  subscription: t('اشتراک'),
  goal: t('هدف پس‌انداز'),
  recurring_income: t('درآمد تکرارشونده'),
};

export default function BackupSection() {
  const vault = useVault();
  const { readOnly } = useDemo();
  const { toast } = useFeedback();
  const fileRef = useRef(null);
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [restore, setRestore] = useState(null); // { text, backup?, needsPassword?, password, error, progress, result }

  if (vault.status !== 'unlocked') return null;

  const handleExport = async () => {
    setBusy(true);
    try {
      const backup = await buildFullBackup();
      const text = await serializeBackup(backup, password);
      await saveTextFile(`realrate-backup-${todayIso()}.json`, text, 'application/json');
      const { counts } = summarizeBackup(backup);
      toast.success(t('پشتیبان با {n} مورد آماده شد.', { n: faNum(Object.values(counts).reduce((a, b) => a + b, 0)) }));
    } catch (err) {
      toast.error(err?.message || t('ساخت پشتیبان ممکن نشد.'));
    } finally {
      setBusy(false);
    }
  };

  const readFile = async (text, pass = '') => {
    try {
      const backup = await parseBackup(text, pass);
      setRestore({ text, backup, password: pass, error: '' });
    } catch (err) {
      setRestore({ text, needsPassword: err.code === 'NEEDS_PASSWORD' || err.code === 'WRONG_PASSWORD', password: pass, error: err.code === 'NEEDS_PASSWORD' ? '' : err.message });
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) readFile(await file.text());
  };

  const handleRestore = async () => {
    setRestore((r) => ({ ...r, progress: { done: 0, total: 0 } }));
    try {
      const result = await restoreFullBackup(restore.backup, {
        onProgress: (done, total) => setRestore((r) => ({ ...r, progress: { done, total } })),
      });
      bumpVaultEpoch();
      setRestore((r) => ({ ...r, progress: null, result }));
    } catch (err) {
      setRestore((r) => ({ ...r, progress: null, error: err?.message || t('بازگردانی ممکن نشد.') }));
    }
  };

  const summary = restore?.backup ? summarizeBackup(restore.backup) : null;
  const restoring = Boolean(restore?.progress);

  return (
    <section className="vault-settings backup-section" aria-labelledby="backup-title">
      <div className="section-title">
        <span id="backup-title">
          <DatabaseBackup size={18} className="vault-settings-title-icon" />
          {t('پشتیبان کامل')}
        </span>
      </div>
      <p className="vault-settings-text">
        {t('همه‌ی اطلاعات حساب در یک فایل: پورتفوها با همه‌ی خرید و فروش‌ها، دسته‌بندی و هدف‌ها؛ وام‌ها با اقساط پرداخت‌شده؛ درآمدها، چک‌ها، هزینه‌ها و دنگ‌ها، اشتراک‌ها، هدف‌های پس‌انداز، حساب‌ها (با کارت‌های ادغام‌شده و تاریخ مانده) و انتقال‌ها، دسته‌ها و صفحه‌ی اصلی. با «بازگردانی» همه‌چیز همان‌طور برمی‌گردد (همین حساب یا حساب دیگر).')}
      </p>
      <PassphraseInput
        id="backup-password"
        label={t('رمز فایل (اختیاری)')}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        show={showPass}
        onToggle={() => setShowPass((v) => !v)}
        hint={t('بدون رمز، اطلاعات در فایل خوانا است؛ آن را امن نگه دارید.')}
        disabled={busy}
      />
      <div className="vault-settings-actions">
        <Button variant="secondary" size="sm" icon={<Download size={14} />} loading={busy} onClick={handleExport}>
          {t('دریافت پشتیبان')}
        </Button>
        <Button variant="secondary" size="sm" icon={<Upload size={14} />} disabled={busy || readOnly} onClick={() => fileRef.current?.click()}>
          {t('بازگردانی از فایل')}
        </Button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={handleFile} />
      </div>

      {restore && (
        <Modal
          isOpen
          onClose={restoring ? undefined : () => setRestore(null)}
          title={t('بازگردانی پشتیبان')}
          icon={<Upload size={18} />}
          maxWidth="480px"
          footer={(
            <div className="modal-actions">
              <Button variant="secondary" block disabled={restoring} onClick={() => setRestore(null)}>{restore.result ? t('بستن') : t('انصراف')}</Button>
              {restore.needsPassword && !restore.backup && (
                <Button block onClick={() => readFile(restore.text, restore.password)} disabled={!restore.password}>{t('باز کردن فایل')}</Button>
              )}
              {restore.backup && !restore.result && (
                <Button block loading={restoring} onClick={handleRestore}>{t('بازگردانی')}</Button>
              )}
            </div>
          )}
        >
          <div className="income-form-body">
            {restore.error && <AlertBanner type="error" message={restore.error} />}
            {restore.needsPassword && !restore.backup && (
              <PassphraseInput
                id="backup-open-password"
                label={t('رمز فایل')}
                value={restore.password}
                onChange={(e) => setRestore((r) => ({ ...r, password: e.target.value }))}
                show={showPass}
                onToggle={() => setShowPass((v) => !v)}
              />
            )}
            {summary && !restore.result && (
              <>
                <p className="vault-settings-text">
                  {summary.exportedAt ? t('پشتیبان تاریخ {date} شامل', { date: new Date(summary.exportedAt).toLocaleDateString(intlLocale()) }) : t('پشتیبان شامل')}
                  {summary.portfolios > 0 && ` ${t('{n} پورتفو و', { n: faNum(summary.portfolios) })}`}:
                </p>
                <ul className="backup-summary">
                  {Object.entries(summary.counts).map(([kind, n]) => (
                    <li key={kind}><span>{KIND_LABELS[kind] || kind}</span><strong>{faNum(n)}</strong></li>
                  ))}
                </ul>
                <AlertBanner type="info" message={t('موردهایی که در حساب هست با نسخه‌ی فایل جایگزین و بقیه اضافه می‌شوند؛ چیزی حذف نمی‌شود.')} />
              </>
            )}
            <ProgressBar progress={restore.progress ? { ...restore.progress, label: t('در حال بازگردانی…') } : null} />
            {restore.result && (
              <AlertBanner
                type={restore.result.skipped ? 'warning' : 'success'}
                message={`${t('{n} مورد بازگردانده شد', { n: faNum(restore.result.restored) })}${restore.result.createdPortfolios ? `${t('،')} ${t('{n} پورتفوی تازه ساخته شد', { n: faNum(restore.result.createdPortfolios) })}` : ''}${restore.result.skipped ? `${t('؛')} ${t('{n} مورد بازگردانده نشد (مثلاً بخشی که برای این حساب فعال نیست).', { n: faNum(restore.result.skipped) })}` : '.'}`}
              />
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
