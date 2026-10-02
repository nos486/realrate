/**
 * BackupSection.jsx — «پشتیبان کامل»: download everything the account holds in one file, and
 * restore it (here or in another account) — fullBackup.js
 *
 * The file is decrypted unless a password is given for it. Restoring replaces records with the
 * same id and adds the others; nothing is deleted.
 */

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

const faNum = (n) => Number(n || 0).toLocaleString('fa-IR');

const KIND_LABELS = {
  holding: 'خرید و موجودی پورتفو',
  transaction: 'فروش و پرداخت از پورتفو',
  portfolio_layout: 'دسته‌بندی و هدف پورتفو',
  loan: 'وام',
  income: 'درآمد',
  recurring_income: 'درآمد ثابت',
  cheque: 'چک',
  expense_group: 'بخش هزینه',
  expense: 'هزینه',
  bank_account: 'حساب',
  transfer: 'انتقال بین حساب‌ها',
  category_settings: 'تنظیم دسته‌ها',
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
      toast.success(`پشتیبان با ${faNum(Object.values(counts).reduce((a, b) => a + b, 0))} مورد آماده شد.`);
    } catch (err) {
      toast.error(err?.message || 'ساخت پشتیبان ممکن نشد.');
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
      setRestore((r) => ({ ...r, progress: null, error: err?.message || 'بازگردانی ممکن نشد.' }));
    }
  };

  const summary = restore?.backup ? summarizeBackup(restore.backup) : null;
  const restoring = Boolean(restore?.progress);

  return (
    <section className="vault-settings backup-section" aria-labelledby="backup-title">
      <div className="section-title">
        <span id="backup-title">
          <DatabaseBackup size={18} className="vault-settings-title-icon" />
          پشتیبان کامل
        </span>
      </div>
      <p className="vault-settings-text">
        همه‌ی اطلاعات حساب در یک فایل: پورتفوها با همه‌ی خرید و فروش‌ها، دسته‌بندی و هدف‌ها؛ وام‌ها با اقساط پرداخت‌شده؛
        درآمدها، چک‌ها، هزینه‌ها و دنگ‌ها، حساب‌ها و انتقال‌ها، دسته‌ها و صفحه‌ی اصلی. با «بازگردانی» همه‌چیز همان‌طور برمی‌گردد
        (همین حساب یا حساب دیگر).
      </p>
      <PassphraseInput
        id="backup-password"
        label="رمز فایل (اختیاری)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        show={showPass}
        onToggle={() => setShowPass((v) => !v)}
        hint="بدون رمز، اطلاعات در فایل خوانا است؛ آن را امن نگه دارید."
        disabled={busy}
      />
      <div className="vault-settings-actions">
        <Button variant="secondary" size="sm" icon={<Download size={14} />} loading={busy} onClick={handleExport}>
          دریافت پشتیبان
        </Button>
        <Button variant="secondary" size="sm" icon={<Upload size={14} />} disabled={busy || readOnly} onClick={() => fileRef.current?.click()}>
          بازگردانی از فایل
        </Button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={handleFile} />
      </div>

      {restore && (
        <Modal
          isOpen
          onClose={restoring ? undefined : () => setRestore(null)}
          title="بازگردانی پشتیبان"
          icon={<Upload size={18} />}
          maxWidth="480px"
          footer={(
            <div className="modal-actions">
              <Button variant="secondary" block disabled={restoring} onClick={() => setRestore(null)}>{restore.result ? 'بستن' : 'انصراف'}</Button>
              {restore.needsPassword && !restore.backup && (
                <Button block onClick={() => readFile(restore.text, restore.password)} disabled={!restore.password}>باز کردن فایل</Button>
              )}
              {restore.backup && !restore.result && (
                <Button block loading={restoring} onClick={handleRestore}>بازگردانی</Button>
              )}
            </div>
          )}
        >
          <div className="income-form-body">
            {restore.error && <AlertBanner type="error" message={restore.error} />}
            {restore.needsPassword && !restore.backup && (
              <PassphraseInput
                id="backup-open-password"
                label="رمز فایل"
                value={restore.password}
                onChange={(e) => setRestore((r) => ({ ...r, password: e.target.value }))}
                show={showPass}
                onToggle={() => setShowPass((v) => !v)}
              />
            )}
            {summary && !restore.result && (
              <>
                <p className="vault-settings-text">
                  پشتیبان {summary.exportedAt ? `تاریخ ${new Date(summary.exportedAt).toLocaleDateString('fa-IR')}` : ''} شامل
                  {summary.portfolios > 0 && ` ${faNum(summary.portfolios)} پورتفو و`}:
                </p>
                <ul className="backup-summary">
                  {Object.entries(summary.counts).map(([kind, n]) => (
                    <li key={kind}><span>{KIND_LABELS[kind] || kind}</span><strong>{faNum(n)}</strong></li>
                  ))}
                </ul>
                <AlertBanner type="info" message="موردهایی که در حساب هست با نسخه‌ی فایل جایگزین و بقیه اضافه می‌شوند؛ چیزی حذف نمی‌شود." />
              </>
            )}
            <ProgressBar progress={restore.progress ? { ...restore.progress, label: 'در حال بازگردانی…' } : null} />
            {restore.result && (
              <AlertBanner
                type={restore.result.skipped ? 'warning' : 'success'}
                message={`${faNum(restore.result.restored)} مورد بازگردانده شد${restore.result.createdPortfolios ? `، ${faNum(restore.result.createdPortfolios)} پورتفوی تازه ساخته شد` : ''}${restore.result.skipped ? `؛ ${faNum(restore.result.skipped)} مورد بازگردانده نشد (مثلاً بخشی که برای این حساب فعال نیست).` : '.'}`}
              />
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
