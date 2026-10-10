/**
 * SmsInboxPage.jsx — «پیامک‌های بانکی»: the bank messages the Android app has read (app only)
 *
 * - the withdrawals and deposits waiting to be recorded (SmsInboxList); «ثبت» opens the everyday
 *   expense form (withdrawal) or the income form (deposit), filled in from the message; «وام»
 *   marks a deposit as a received loan (LoanDepositSheet) and «دنگ» as someone's share of an
 *   expense the user paid (ShareDepositSheet), so neither is recorded as income; a withdrawal can
 *   go to a project instead of everyday expenses («ثبت در یک پروژه», ProjectPickSheet)
 * - "read earlier messages": automatic reading only picks up messages from the moment it is on;
 *   older ones are read here on demand (the last 24 hours, 7, 30 or 90 days)
 * Recording writes encrypted records, so the vault must be unlocked for it. Once it is, messages
 * already recorded (recordedCheck.js) leave the list — by their transaction key, or a
 * hand-recorded expense/income of the same day, amount and kind.
 */

import React, { useEffect, useState } from 'react';
import { MessageSquareText, History } from 'lucide-react';
import { AlertBanner, Button, Card, FeaturePageHeader, FilterPills } from '../../shared/ui/index.js';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import VaultUnlockCard from '../../shared/vault/VaultUnlockCard.jsx';
import { useVault } from '../../shared/vault/useVault.js';
import { useDemo } from '../demo/index.js';
import { useAccounts } from '../accounts/hooks/useAccounts.js';
import { usePricing } from '../market/index.js';
import { markSmsHandled, readSmsDays, smsPermission, getSmsSettings, smsOutcome, getPendingSms } from '../../shared/native/smsInbox.js';
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
import { smsExpenseDraft, smsProjectExpenseDraft, smsIncomeDraft, smsTransferDraft } from './smsDrafts.js';
import { saveSmsExpense, recordSmsExpense, dropAlreadyRecorded } from './smsRecord.js';
import { getExpenseCategory } from '../expenses/constants/expenseCategories.js';
import { bumpVaultEpoch } from '../../shared/vault/vaultStore.js';

const DAY_OPTIONS = [
  { value: 1, label: '۲۴ ساعت' },
  ...[7, 30, 90].map((d) => ({ value: d, label: `${d.toLocaleString('fa-IR')} روز` })),
];

export default function SmsInboxPage() {
  const { toast } = useFeedback();
  const { readOnly } = useDemo();
  const { status: vaultStatus } = useVault();
  const { accounts } = useAccounts();
  const pricing = usePricing();
  const usdToman = Number(pricing?.getAssetPrice?.('usd')) || 0;
  const [expenseDraft, setExpenseDraft] = useState(null);
  const [incomeDraft, setIncomeDraft] = useState(null);
  // The message the open expense or income form was filled from («مدیریت نقدینگی» → a transfer)
  const [draftItem, setDraftItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [days, setDays] = useState(30);
  const [reading, setReading] = useState(false);
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

  const handleRecord = (item) => {
    setDraftItem(item);
    if (item.tx.direction === 'debit') setExpenseDraft(smsExpenseDraft(item.tx, accounts));
    else setIncomeDraft(smsIncomeDraft(item.tx));
  };

  /** «ثبت سریع»: recorded as it is, in the category of the app settings — no form */
  const handleQuickRecord = async (item) => {
    setQuickId(item.fingerprint);
    try {
      await recordSmsExpense(item, { accounts: accounts.filter((a) => !a.archived) });
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

  const handleTransfer = (item) => {
    const { draft, counterpart } = smsTransferDraft(item, pending, accounts.filter((a) => !a.archived));
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

  const handleReadPast = async () => {
    setReading(true);
    try {
      if ((await smsPermission()) !== 'granted' && (await smsPermission({ request: true })) !== 'granted') {
        toast.error('اجازه‌ی خواندن پیامک داده نشد. از تنظیمات گوشی (برنامه‌ها ← RealRate ← مجوزها) آن را بدهید.', { duration: 8000 });
        return;
      }
      // With the vault open, recorded ones are read again and checked against it: a message whose
      // expense or income was deleted comes back
      const unlocked = vaultStatus === 'unlocked';
      const { read, added, transactions = [] } = await readSmsDays(days, { recheckRecorded: unlocked });
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
    }
  };

  return (
    <div className="incomes-page-container sms-inbox-page">
      <FeaturePageHeader
        icon={<MessageSquareText size={24} />}
        title="پیامک‌های بانکی"
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
          <Button size="sm" onClick={handleReadPast} loading={reading}>بخوان</Button>
        </div>
      </Card>

      <SmsReadHistory items={readHistory} />

      {expenseDraft && (
        <ExpenseForm
          daily
          draft={expenseDraft}
          usdToman={usdToman}
          accounts={accounts.filter((a) => !a.archived)}
          submitting={saving}
          onClose={() => setExpenseDraft(null)}
          onSubmit={record(saveSmsExpense, expenseDraft, 'هزینه ثبت شد.')}
          onCashMove={() => {
            setExpenseDraft(null);
            handleTransfer(draftItem);
          }}
        />
      )}
      {loanItem && <LoanDepositSheet item={loanItem} onClose={() => setLoanItem(null)} />}
      {projectItem && (
        <ProjectPickSheet
          item={projectItem}
          onClose={() => setProjectItem(null)}
          onPick={(project) => {
            setProjectDraft({ project, draft: smsProjectExpenseDraft(projectItem.tx, accounts) });
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
          submitting={saving}
          onClose={() => setIncomeDraft(null)}
          onSubmit={record(createIncome, incomeDraft, 'درآمد ثبت شد.')}
          onCashMove={() => {
            setIncomeDraft(null);
            handleTransfer(draftItem);
          }}
        />
      )}
    </div>
  );
}
