/**
 * SmsInboxPage.jsx — «پیامک‌های بانکی»: the bank messages the Android app has read (app only)
 *
 * - the withdrawals and deposits waiting to be recorded (SmsInboxList); «ثبت» opens the everyday
 *   expense form (withdrawal) or the income form (deposit), filled in from the message; «وام»
 *   marks a deposit as a received loan (LoanDepositSheet) and «دنگ» as someone's share of an
 *   expense the user paid (ShareDepositSheet), so neither is recorded as income; a withdrawal can
 *   go to a project instead of everyday expenses («ثبت در یک پروژه», ProjectPickSheet)
 * - "read earlier messages": automatic reading only picks up messages from the moment it is on;
 *   older ones are read here on demand: the last 24 hours, 7, 30 or 90 days, a year, or any number
 *   of days the user types («دلخواه», up to MAX_READ_DAYS; a long span is read a window at a time)
 * Recording writes encrypted records, so the vault must be unlocked for it. Once it is, messages
 * already recorded (recordedCheck.js) leave the list — by their transaction key, or a
 * hand-recorded expense/income of the same day, amount and kind.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { MessageSquareText, History } from 'lucide-react';
import { AlertBanner, Button, Card, FeaturePageHeader, FilterPills, NumericInput } from '../../shared/ui/index.js';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import VaultUnlockCard from '../../shared/vault/VaultUnlockCard.jsx';
import { useVault } from '../../shared/vault/useVault.js';
import { useDemo } from '../demo/index.js';
import { useAccounts } from '../accounts/hooks/useAccounts.js';
import { usePricing } from '../market/index.js';
import { markSmsHandled, restoreSms, readSmsDays, smsPermission, getSmsSettings, smsOutcome, getPendingSms, MAX_READ_DAYS } from '../../shared/native/smsInbox.js';
import SmsReadHistory from './SmsReadHistory.jsx';
import { useSmsInbox } from '../../shared/native/useSmsInbox.js';
import { createIncome } from '../incomes/api/incomeApi.js';
import ExpenseForm from '../expenses/components/ExpenseForm.jsx';
import IncomeForm from '../incomes/components/IncomeForm.jsx';
import SmsInboxList from './SmsInboxList.jsx';
import LoanDepositSheet from './LoanDepositSheet.jsx';
import ShareDepositSheet from './ShareDepositSheet.jsx';
import ProjectPickSheet from './ProjectPickSheet.jsx';
import TransferForm from '../accounts/components/TransferForm.jsx';
import { saveTransfer } from '../../shared/vault/vaultTransfers.js';
import { smsExpenseDraft, smsProjectExpenseDraft, smsIncomeDraft, smsTransferDraft, findTransferCounterpart } from './smsDrafts.js';
import { ensureSmsAccount } from './smsAccounts.js';
import { saveSmsExpense, recordSmsExpense, dropAlreadyRecorded } from './smsRecord.js';
import { getExpenseCategory } from '../expenses/constants/expenseCategories.js';
import { bumpVaultEpoch } from '../../shared/vault/vaultStore.js';

/** «دلخواه»: the number of days typed */
const CUSTOM_DAYS = 'custom';

const DAY_OPTIONS = [
  { value: 1, label: '۲۴ ساعت' },
  ...[7, 30, 90].map((d) => ({ value: d, label: `${d.toLocaleString('fa-IR')} روز` })),
  { value: 365, label: '۱ سال' },
  { value: CUSTOM_DAYS, label: 'دلخواه' },
];

export default function SmsInboxPage() {
  const { toast } = useFeedback();
  const { readOnly } = useDemo();
  const { status: vaultStatus } = useVault();
  const { accounts: loadedAccounts, enabled: accountsEnabled } = useAccounts();
  // Accounts made from messages in this session, until the list has read them
  const [madeAccounts, setMadeAccounts] = useState([]);
  const accounts = useMemo(
    () => [...loadedAccounts, ...madeAccounts.filter((m) => !loadedAccounts.some((a) => a.id === m.id))],
    [loadedAccounts, madeAccounts]);
  const pricing = usePricing();
  const usdToman = Number(pricing?.getAssetPrice?.('usd')) || 0;
  const [expenseDraft, setExpenseDraft] = useState(null);
  const [incomeDraft, setIncomeDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [days, setDays] = useState(30);
  const [customDays, setCustomDays] = useState('');
  const typedDays = Number(String(customDays).replace(/,/g, ''));
  const customValid = Number.isInteger(typedDays) && typedDays >= 1 && typedDays <= MAX_READ_DAYS;
  const readDays = days === CUSTOM_DAYS ? (customValid ? typedDays : null) : days;
  const [reading, setReading] = useState(false);
  // How far the read has come: { stage: 'reading'|'parsing', done, total, messages? }
  const [progress, setProgress] = useState(null);
  // What the last «بخوان» found that is already recorded or dismissed: on screen only
  const [readHistory, setReadHistory] = useState([]);
  const [quickId, setQuickId] = useState(null);
  const [loanItem, setLoanItem] = useState(null);
  const [shareItem, setShareItem] = useState(null);
  // «ثبت در یک پروژه»: the message, then the project picked for it
  const [projectItem, setProjectItem] = useState(null);
  const [projectDraft, setProjectDraft] = useState(null); // { project, draft }
  // «انتقال بین حساب‌های خودم»: the message (and the other side's, when it waits too)
  const [transferDraft, setTransferDraft] = useState(null); // { draft, items: [message, counterpart?] }

  const locked = vaultStatus === 'locked';
  const { pending } = useSmsInbox();
  const pendingIds = pending.map((p) => p.fingerprint).join(',');

  // Messages already recorded (from an SMS here or on another device, or by hand: the same day,
  // amount and kind) leave the list for good
  useEffect(() => {
    if (vaultStatus !== 'unlocked' || !pendingIds) return undefined;
    let cancelled = false;
    dropAlreadyRecorded().catch((err) => {
      if (!cancelled) console.warn('Checking recorded SMS failed:', err);
    });
    return () => {
      cancelled = true;
    };
    // `pendingIds`: checked again whenever the list changes
  }, [vaultStatus, pendingIds]);

  /**
   * Make the account each message belongs to when the user has none for it (smsAccounts.js);
   * returns the accounts, new ones included. Nothing is made without the accounts feature.
   */
  const withMessageAccounts = async (...items) => {
    const active = accounts.filter((a) => !a.archived);
    if (!accountsEnabled) return active;
    const before = active.length;
    for (const item of items) await ensureSmsAccount(item.tx, active);
    if (active.length > before) {
      setMadeAccounts((made) => [...made, ...active.slice(before)]);
      bumpVaultEpoch();
    }
    return active;
  };

  const handleRecord = async (item) => {
    const active = await withMessageAccounts(item);
    if (item.tx.direction === 'debit') setExpenseDraft(smsExpenseDraft(item.tx, active));
    else setIncomeDraft(smsIncomeDraft(item.tx, active));
  };

  /** «ثبت سریع»: recorded as it is, in the category of the app settings — no form */
  const handleQuickRecord = async (item) => {
    setQuickId(item.fingerprint);
    try {
      await recordSmsExpense(item, { accounts: await withMessageAccounts(item) });
      bumpVaultEpoch();
      toast.success(`هزینه در «${getExpenseCategory(getSmsSettings().recordCategory).label}» ثبت شد.`);
    } catch (err) {
      toast.error(err?.message || 'ثبت هزینه ممکن نشد.');
    } finally {
      setQuickId(null);
    }
  };

  /** Save through `save` (with the transaction's key), then drop the message from the inbox */
  const record = (save, draft, done) => async (input) => {
    setSaving(true);
    try {
      await save({ ...input, smsKey: draft.smsKey });
      markSmsHandled(draft.smsFingerprint);
      toast.success(done);
    } finally {
      setSaving(false);
    }
  };

  const handleTransfer = async (item) => {
    // Both sides are the user's own accounts: the other message's too
    const other = findTransferCounterpart(item, pending);
    const active = await withMessageAccounts(...[item, other].filter(Boolean));
    const { draft, counterpart } = smsTransferDraft(item, pending, active);
    setTransferDraft({ draft, items: [item, counterpart].filter(Boolean) });
  };

  const handleSaveTransfer = async (input) => {
    setSaving(true);
    try {
      await saveTransfer(input);
      for (const msg of transferDraft.items) markSmsHandled(msg.fingerprint);
      toast.success('انتقال بین حساب‌ها ثبت شد (جزو هزینه و درآمد نیست).');
    } finally {
      setSaving(false);
    }
  };

  /** A message dismissed by mistake: back in the inbox, ready to record or edit */
  const handleRestore = (item) => {
    if (!restoreSms(item)) return;
    setReadHistory((list) => list.filter((h) => h.fingerprint !== item.fingerprint));
    toast.success('پیامک به فهرست برگشت و می‌توانید آن را ثبت یا ویرایش کنید.');
  };

  const handleReadPast = async () => {
    if (!readDays) return;
    setReading(true);
    try {
      if ((await smsPermission()) !== 'granted' && (await smsPermission({ request: true })) !== 'granted') {
        toast.error('اجازه‌ی خواندن پیامک داده نشد. از تنظیمات گوشی (برنامه‌ها ← RealRate ← مجوزها) آن را بدهید.', { duration: 8000 });
        return;
      }
      // With the vault open, recorded ones are read again and checked against it: a message whose
      // expense or income was deleted comes back
      const unlocked = vaultStatus === 'unlocked';
      const { read, added, transactions = [] } = await readSmsDays(readDays, { recheckRecorded: unlocked, onProgress: setProgress });
      const dropped = unlocked && added ? await dropAlreadyRecorded() : 0;
      // The rest of what it read: not waiting any more (recorded, or dismissed)
      const waiting = new Set(getPendingSms().map((p) => p.tx?.key));
      setReadHistory(transactions
        .filter((item) => !waiting.has(item.tx.key))
        .map((item) => ({ ...item, outcome: smsOutcome(item) }))
        .filter((item) => item.outcome));
      const fresh = Math.max(0, added - dropped);
      toast.success(`${read.toLocaleString('fa-IR')} پیامک بانکی خوانده شد؛ ${fresh.toLocaleString('fa-IR')} مورد جدید برای ثبت.`);
    } catch (err) {
      toast.error(err?.message || 'خواندن پیامک‌ها ممکن نشد.');
    } finally {
      setReading(false);
      setProgress(null);
    }
  };

  return (
    <div className="incomes-page-container sms-inbox-page">
      <FeaturePageHeader
        icon={<MessageSquareText size={24} />}
        title="پیامک‌های بانکی"
        help="sms"
        subtitle="برداشت‌ها و واریزهای خوانده‌شده از پیامک بانک؛ دسته را انتخاب و ثبت کنید"
      />

      {locked && <VaultUnlockCard title="برای ثبت، اطلاعات رمزنگاری‌شده را باز کنید" />}

      <Card className="sms-inbox-page-card" padding="lg">
        <SmsInboxList
          accounts={accounts}
          onRecord={handleRecord}
          onQuickRecord={handleQuickRecord}
          quickRecordingId={quickId}
          onLoanDeposit={setLoanItem}
          onShareDeposit={setShareItem}
          onRecordToProject={setProjectItem}
          onTransfer={accounts.filter((a) => !a.archived).length >= 2 ? handleTransfer : undefined}
          canRecord={!locked && !readOnly}
        />
      </Card>

      <Card
        className="sms-inbox-page-card"
        padding="lg"
        icon={<History size={18} />}
        title="خواندن پیامک‌های قبلی"
        subtitle="خواندن خودکار فقط پیامک‌هایی را می‌گیرد که از زمان روشن شدنش می‌رسند؛ پیامک‌های قبل را اینجا بخوانید (تکراری‌ها کنار گذاشته می‌شوند؛ ثبت‌شده‌ها زیر همین کارت جدا نشان داده می‌شوند)."
      >
        <div className="app-setting-actions">
          <FilterPills options={DAY_OPTIONS} activeValue={days} onChange={setDays} size="sm" />
          {days === CUSTOM_DAYS && (
            <label className="sms-read-days">
              <NumericInput
                id="sms-read-days"
                value={customDays}
                onValueChange={setCustomDays}
                placeholder="مثلاً ۱۸۰"
                className="ui-input-control"
                aria-label="تعداد روز"
              />
              <span>روز گذشته</span>
            </label>
          )}
          <Button size="sm" onClick={handleReadPast} loading={reading} disabled={!readDays}>بخوان</Button>
        </div>
        {days === CUSTOM_DAYS && !customValid && customDays !== '' && (
          <p className="expense-form-hint is-warning">بین ۱ تا {MAX_READ_DAYS.toLocaleString('fa-IR')} روز.</p>
        )}
        {progress && (
          <p className="expense-form-hint" role="status">
            {progress.stage === 'reading'
              ? `در حال خواندن پیامک‌ها: بازه‌ی ${progress.done.toLocaleString('fa-IR')} از ${progress.total.toLocaleString('fa-IR')} (${(progress.messages || 0).toLocaleString('fa-IR')} پیامک تا اینجا)`
              : `در حال بررسی پیامک‌ها: ${progress.done.toLocaleString('fa-IR')} از ${progress.total.toLocaleString('fa-IR')}`}
          </p>
        )}
        {!progress && readDays > 90 && <p className="expense-form-hint">خواندن بازه‌ی طولانی ممکن است چند ثانیه طول بکشد.</p>}
      </Card>

      <SmsReadHistory items={readHistory} onRestore={handleRestore} />

      {expenseDraft && (
        <ExpenseForm
          daily
          draft={expenseDraft}
          usdToman={usdToman}
          accounts={accounts.filter((a) => !a.archived)}
          submitting={saving}
          onClose={() => setExpenseDraft(null)}
          onSubmit={record(saveSmsExpense, expenseDraft, 'هزینه ثبت شد.')}
        />
      )}
      {loanItem && <LoanDepositSheet item={loanItem} onClose={() => setLoanItem(null)} />}
      {projectItem && (
        <ProjectPickSheet
          item={projectItem}
          onClose={() => setProjectItem(null)}
          onPick={async (project) => {
            const active = await withMessageAccounts(projectItem);
            setProjectDraft({ project, draft: smsProjectExpenseDraft(projectItem.tx, active) });
            setProjectItem(null);
          }}
        />
      )}
      {projectDraft && (
        <ExpenseForm
          group={projectDraft.project}
          draft={projectDraft.draft}
          usdToman={usdToman}
          accounts={accounts.filter((a) => !a.archived)}
          submitting={saving}
          onClose={() => setProjectDraft(null)}
          onSubmit={record(saveSmsExpense, projectDraft.draft, 'هزینه ثبت شد.')}
        />
      )}
      {transferDraft && (
        <TransferForm
          draft={transferDraft.draft}
          accounts={accounts.filter((a) => !a.archived)}
          submitting={saving}
          onClose={() => setTransferDraft(null)}
          onSubmit={handleSaveTransfer}
          note={transferDraft.items.length > 1 && (
            <AlertBanner type="info" message="پیامک طرف دیگر این انتقال (همان مبلغ، همان روز) هم پیدا شد و با ثبت آن کنار گذاشته می‌شود." />
          )}
        />
      )}
      {shareItem && <ShareDepositSheet item={shareItem} accounts={accounts} onClose={() => setShareItem(null)} />}
      {incomeDraft && (
        <IncomeForm
          draft={incomeDraft}
          accounts={accounts.filter((a) => !a.archived)}
          submitting={saving}
          onClose={() => setIncomeDraft(null)}
          onSubmit={record(createIncome, incomeDraft, 'درآمد ثبت شد.')}
        />
      )}
    </div>
  );
}
