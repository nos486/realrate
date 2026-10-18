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
 * With «نگه‌داشتن پیامک‌های ردشده» on (app settings), «رد» / «رد همه» record the messages in «رد شده»
 * (outside the totals, smsRecord.js recordSmsRejected) instead of dropping them.
 * Recording writes encrypted records, so the vault must be unlocked for it. Once it is, messages
 * already recorded (recordedCheck.js) leave the list — by their transaction key, or a
 * hand-recorded expense/income of the same day, amount and kind.
 */

import { intlLocale, t } from '../../utils/i18n.js';
import React, { useEffect, useMemo, useState } from 'react';
import { MessageSquareText, History } from 'lucide-react';
import { AlertBanner, Button, Card, FeaturePageHeader, FilterPills, NumericInput } from '../../shared/ui/index.js';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import VaultUnlockCard from '../../shared/vault/VaultUnlockCard.jsx';
import { useVault } from '../../shared/vault/useVault.js';
import { useDemo } from '../demo/index.js';
import { useAccounts } from '../accounts/hooks/useAccounts.js';
import { usePricing } from '../market/index.js';
import { markSmsHandled, restoreSms, readSmsDays, readSmsRange, smsPermission, getSmsSettings, smsOutcome, getPendingSms, MAX_READ_DAYS } from '../../shared/native/smsInbox.js';
import SmsReadHistory from './SmsReadHistory.jsx';
import { useSmsInbox } from '../../shared/native/useSmsInbox.js';
import { createIncome } from '../incomes/api/incomeApi.js';
import ExpenseForm from '../expenses/components/ExpenseForm.jsx';
import IncomeForm from '../incomes/components/IncomeForm.jsx';
import SmsInboxList from './SmsInboxList.jsx';
import LoanDepositSheet from './LoanDepositSheet.jsx';
import ShareDepositSheet from './ShareDepositSheet.jsx';
import ProjectPickSheet from './ProjectPickSheet.jsx';
import TransferPairSheet from './TransferPairSheet.jsx';
import TransferForm from '../accounts/components/TransferForm.jsx';
import { saveTransfer } from '../../shared/vault/vaultTransfers.js';
import { smsExpenseDraft, smsProjectExpenseDraft, smsIncomeDraft, smsTransferDraft, findTransferCounterpart, oppositeMessages } from './smsDrafts.js';
import { formatAmount } from '../expenses/utils/format.js';
import { ensureSmsAccount } from './smsAccounts.js';
import { saveSmsExpense, recordSmsExpense, recordSmsRejected, dropAlreadyRecorded, autoRecordSms } from './smsRecord.js';
import { getExpenseCategory } from '../expenses/constants/expenseCategories.js';
import { bumpVaultEpoch } from '../../shared/vault/vaultStore.js';
import { DateField } from '../../shared/form/index.js';
import { getTodayShamsi, shamsiToGregorian } from '../portfolio/components/ShamsiDatePicker.jsx';
import { todayIso } from '../../shared/utils/dates.js';

/** «دلخواه»: the number of days typed */
const CUSTOM_DAYS = 'custom';
/** «بازه‌ی تاریخ»: from a day to a day */
const RANGE = 'range';

/** What «ثبت خودکار موارد کوچک» of a read starts with: withdrawals to «هزینه‌های جاری», deposits to «درآمد خرد» */
const DEFAULT_SMALL_EXPENSE = 5_000;
const DEFAULT_SMALL_INCOME = 1_000_000;
const SMALL_EXPENSE_CATEGORY = 'running_costs';
const SMALL_INCOME_CATEGORY = 'small_income';

const DAY_OPTIONS = [
  { value: 1, label: t('۲۴ ساعت') },
  ...[7, 30, 90].map((d) => ({ value: d, label: t('{n} روز', { n: d.toLocaleString(intlLocale()) }) })),
  { value: 365, label: t('۱ سال') },
  { value: CUSTOM_DAYS, label: t('دلخواه') },
  { value: RANGE, label: t('بازه‌ی تاریخ') },
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
  const readDays = days === RANGE ? null : days === CUSTOM_DAYS ? (customValid ? typedDays : null) : days;
  // «بازه‌ی تاریخ»: from a day to a day (Shamsi in the fields, Gregorian to read)
  const [fromShamsi, setFromShamsi] = useState(getTodayShamsi());
  const [toShamsi, setToShamsi] = useState(getTodayShamsi());
  const fromIso = shamsiToGregorian(fromShamsi);
  const toIso = shamsiToGregorian(toShamsi);
  const rangeValid = Boolean(fromIso && toIso && fromIso <= toIso);
  const readReady = days === RANGE ? rangeValid : Boolean(readDays);
  // «ثبت خودکار موارد کوچک»: what this read records by itself, up to these amounts
  const [autoSmall, setAutoSmall] = useState(false);
  const [smallExpense, setSmallExpense] = useState(String(DEFAULT_SMALL_EXPENSE));
  const [smallIncome, setSmallIncome] = useState(String(DEFAULT_SMALL_INCOME));
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
  // No pair found on its own but others wait: the message whose other side the user picks
  const [pairItem, setPairItem] = useState(null);

  const locked = vaultStatus === 'locked';
  const { pending, settings: smsSettings } = useSmsInbox();
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
      toast.success(t('هزینه در «{category}» ثبت شد.', { category: getExpenseCategory(getSmsSettings().recordCategory).label }));
    } catch (err) {
      toast.error(err?.message || t('ثبت هزینه ممکن نشد.'));
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

  /** Opens the transfer form for a message; `chosen` is the other side picked by hand */
  const openTransfer = async (item, chosen = null) => {
    // Both sides are the user's own accounts: the other message's too
    const other = chosen || findTransferCounterpart(item, pending);
    const active = await withMessageAccounts(...[item, other].filter(Boolean));
    const { draft, counterpart } = smsTransferDraft(item, pending, active, chosen);
    setTransferDraft({ draft, items: [item, counterpart].filter(Boolean) });
  };

  const handleTransfer = async (item) => {
    // Nothing pairs on its own but opposite messages wait: the user may pick the other side
    if (!findTransferCounterpart(item, pending) && oppositeMessages(item, pending).length) {
      setPairItem(item);
      return;
    }
    await openTransfer(item);
  };

  const handleSaveTransfer = async (input) => {
    setSaving(true);
    try {
      await saveTransfer(input);
      for (const msg of transferDraft.items) markSmsHandled(msg.fingerprint);
      toast.success(t('انتقال بین حساب‌ها ثبت شد (جزو هزینه و درآمد نیست).'));
    } finally {
      setSaving(false);
    }
  };

  /** «رد» / «رد همه» with «رد شده» kept: recorded there (the vault must be open), else they wait */
  const handleReject = async (items) => {
    if (locked || readOnly) {
      toast.error(t('برای انتقال به «رد شده»، اطلاعات رمزنگاری‌شده را باز کنید.'));
      return;
    }
    try {
      const n = await recordSmsRejected(items);
      bumpVaultEpoch();
      toast.success(t('{n} پیامک در «رد شده» ثبت شد.', { n: n.toLocaleString(intlLocale()) }));
    } catch (err) {
      toast.error(err?.message || t('ثبت در «رد شده» ممکن نشد.'));
    }
  };

  /** A message dismissed by mistake: back in the inbox, ready to record or edit */
  const handleRestore = (item) => {
    if (!restoreSms(item)) return;
    setReadHistory((list) => list.filter((h) => h.fingerprint !== item.fingerprint));
    toast.success(t('پیامک به فهرست برگشت و می‌توانید آن را ثبت یا ویرایش کنید.'));
  };

  const handleReadPast = async () => {
    if (!readReady) return;
    setReading(true);
    try {
      if ((await smsPermission()) !== 'granted' && (await smsPermission({ request: true })) !== 'granted') {
        toast.error(t('اجازه‌ی خواندن پیامک داده نشد. از تنظیمات گوشی (برنامه‌ها ← RealRate ← مجوزها) آن را بدهید.'), { duration: 8000 });
        return;
      }
      // With the vault open, recorded ones are read again and checked against it: a message whose
      // expense or income was deleted comes back
      const unlocked = vaultStatus === 'unlocked';
      const options = { recheckRecorded: unlocked, onProgress: setProgress };
      const { read, added, transactions = [] } = days === RANGE
        ? await readSmsRange(fromIso, toIso, options)
        : await readSmsDays(readDays, options);
      const dropped = unlocked && added ? await dropAlreadyRecorded() : 0;
      // The small ones of what was read recorded by themselves (the rest waits, as always)
      let autoRecorded = 0;
      if (autoSmall && unlocked && !readOnly) {
        setProgress({ stage: 'recording' });
        const amount = (value) => Number(String(value).replace(/[^\d]/g, '')) || 0;
        const span = days === RANGE
          ? { from: fromIso, to: toIso }
          : { from: todayIso(new Date(Date.now() - readDays * 86_400_000)) };
        autoRecorded = await autoRecordSms({
          expense: amount(smallExpense) > 0 ? { max: amount(smallExpense), category: SMALL_EXPENSE_CATEGORY } : null,
          income: amount(smallIncome) > 0 ? { max: amount(smallIncome), category: SMALL_INCOME_CATEGORY } : null,
          ...span,
        });
        if (autoRecorded) bumpVaultEpoch();
      }
      // The rest of what it read: not waiting any more (recorded, or dismissed)
      const waiting = new Set(getPendingSms().map((p) => p.tx?.key));
      setReadHistory(transactions
        .filter((item) => !waiting.has(item.tx.key))
        .map((item) => ({ ...item, outcome: smsOutcome(item) }))
        .filter((item) => item.outcome));
      const fresh = Math.max(0, added - dropped - autoRecorded);
      toast.success(autoRecorded
        ? t('{read} پیامک بانکی خوانده شد؛ {fresh} مورد جدید برای ثبت و {auto} مورد کوچک خودکار ثبت شد.', { read: read.toLocaleString(intlLocale()), fresh: fresh.toLocaleString(intlLocale()), auto: autoRecorded.toLocaleString(intlLocale()) })
        : t('{read} پیامک بانکی خوانده شد؛ {fresh} مورد جدید برای ثبت.', { read: read.toLocaleString(intlLocale()), fresh: fresh.toLocaleString(intlLocale()) }));
    } catch (err) {
      toast.error(err?.message || t('خواندن پیامک‌ها ممکن نشد.'));
    } finally {
      setReading(false);
      setProgress(null);
    }
  };

  return (
    <div className="incomes-page-container sms-inbox-page">
      <FeaturePageHeader
        icon={<MessageSquareText size={24} />}
        title={t('پیامک‌های بانکی')}
        help="sms"
        subtitle={t('برداشت‌ها و واریزهای خوانده‌شده از پیامک بانک؛ دسته را انتخاب و ثبت کنید')}
      />

      {locked && <VaultUnlockCard title={t('برای ثبت، اطلاعات رمزنگاری‌شده را باز کنید')} />}

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
          onReject={smsSettings.keepRejected ? handleReject : undefined}
          canRecord={!locked && !readOnly}
        />
      </Card>

      <Card
        className="sms-inbox-page-card"
        padding="lg"
        icon={<History size={18} />}
        title={t('خواندن پیامک‌های قبلی')}
        subtitle={t('خواندن خودکار فقط پیامک‌هایی را می‌گیرد که از زمان روشن شدنش می‌رسند؛ پیامک‌های قبل را اینجا بخوانید (تکراری‌ها کنار گذاشته می‌شوند؛ ثبت‌شده‌ها زیر همین کارت جدا نشان داده می‌شوند).')}
      >
        <div className="app-setting-actions">
          <FilterPills options={DAY_OPTIONS} activeValue={days} onChange={setDays} size="sm" />
          {days === CUSTOM_DAYS && (
            <label className="sms-read-days">
              <NumericInput
                id="sms-read-days"
                value={customDays}
                onValueChange={setCustomDays}
                placeholder={t('مثلاً ۱۸۰')}
                className="ui-input-control"
                aria-label={t('تعداد روز')}
              />
              <span>{t('روز گذشته')}</span>
            </label>
          )}
          <Button size="sm" onClick={handleReadPast} loading={reading} disabled={!readReady}>{t('بخوان')}</Button>
        </div>
        {days === RANGE && (
          <div className="sms-read-range">
            <DateField label={t('از تاریخ')} value={fromShamsi} onChange={setFromShamsi} />
            <DateField label={t('تا تاریخ')} value={toShamsi} onChange={setToShamsi} />
            {!rangeValid && <p className="expense-form-hint is-warning">{t('تاریخ «از» باید پیش از «تا» (یا همان روز) باشد.')}</p>}
          </div>
        )}
        <div className="sms-read-auto">
          <label className="app-switch">
            <input type="checkbox" role="switch" checked={autoSmall} onChange={(e) => setAutoSmall(e.target.checked)} aria-label={t('ثبت خودکار موارد کوچک این خواندن')} />
            <span className="app-switch-track" aria-hidden="true" />
          </label>
          <span>{t('ثبت خودکار موارد کوچک همین خواندن (نیازمند باز بودن اطلاعات رمزنگاری‌شده)')}</span>
        </div>
        {autoSmall && (
          <div className="sms-read-auto-fields">
            <div className="app-setting-field">
              <label htmlFor="sms-small-expense">{t('هزینه‌ی تا مبلغ (در «هزینه‌های جاری»)')}</label>
              <NumericInput id="sms-small-expense" value={smallExpense} onValueChange={setSmallExpense} affix={t('تومان')} />
            </div>
            <div className="app-setting-field">
              <label htmlFor="sms-small-income">{t('واریز تا مبلغ (در «درآمد خرد»)')}</label>
              <NumericInput id="sms-small-income" value={smallIncome} onValueChange={setSmallIncome} affix={t('تومان')} />
            </div>
            <small>{t('مبلغ صفر یعنی آن نوع ثبت نشود. بقیه‌ی پیامک‌ها مثل همیشه در فهرست می‌مانند.')}</small>
          </div>
        )}
        {days === CUSTOM_DAYS && !customValid && customDays !== '' && (
          <p className="expense-form-hint is-warning">{t('بین ۱ تا {max} روز.', { max: MAX_READ_DAYS.toLocaleString(intlLocale()) })}</p>
        )}
        {progress && (
          <p className="expense-form-hint" role="status">
            {progress.stage === 'recording'
              ? t('در حال ثبت خودکار موارد کوچک…')
              : progress.stage === 'reading'
              ? t('در حال خواندن پیامک‌ها: بازه‌ی {done} از {total} ({messages} پیامک تا اینجا)', { done: progress.done.toLocaleString(intlLocale()), total: progress.total.toLocaleString(intlLocale()), messages: (progress.messages || 0).toLocaleString(intlLocale()) })
              : t('در حال بررسی پیامک‌ها: {done} از {total}', { done: progress.done.toLocaleString(intlLocale()), total: progress.total.toLocaleString(intlLocale()) })}
          </p>
        )}
        {!progress && readDays > 90 && <p className="expense-form-hint">{t('خواندن بازه‌ی طولانی ممکن است چند ثانیه طول بکشد.')}</p>}
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
          onSubmit={record(saveSmsExpense, expenseDraft, t('هزینه ثبت شد.'))}
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
          onSubmit={record(saveSmsExpense, projectDraft.draft, t('هزینه ثبت شد.'))}
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
            <AlertBanner
              type="info"
              message={transferDraft.draft.fee
                ? t('پیامک طرف دیگر این انتقال هم پیدا شد و با ثبت آن کنار گذاشته می‌شود؛ اختلاف دو مبلغ ({fee} تومان) کارمزد ثبت می‌شود.', { fee: formatAmount(transferDraft.draft.fee) })
                : t('پیامک طرف دیگر این انتقال (همان مبلغ، همان روز) هم پیدا شد و با ثبت آن کنار گذاشته می‌شود.')}
            />
          )}
        />
      )}
      {pairItem && (
        <TransferPairSheet
          item={pairItem}
          candidates={oppositeMessages(pairItem, pending)}
          onClose={() => setPairItem(null)}
          onAlone={() => { const it = pairItem; setPairItem(null); openTransfer(it); }}
          onPick={(other) => { const it = pairItem; setPairItem(null); openTransfer(it, other); }}
        />
      )}
      {shareItem && <ShareDepositSheet item={shareItem} accounts={accounts} onClose={() => setShareItem(null)} />}
      {incomeDraft && (
        <IncomeForm
          draft={incomeDraft}
          accounts={accounts.filter((a) => !a.archived)}
          submitting={saving}
          onClose={() => setIncomeDraft(null)}
          onSubmit={record(createIncome, incomeDraft, t('درآمد ثبت شد.'))}
        />
      )}
    </div>
  );
}
