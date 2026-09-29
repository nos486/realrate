/**
 * SmsInboxPage.jsx — «پیامک‌های بانکی»: the bank messages the Android app has read (app only)
 *
 * - the withdrawals and deposits waiting to be recorded (SmsInboxList); «ثبت» opens the everyday
 *   expense form (withdrawal) or the income form (deposit), filled in from the message
 * - "read earlier messages": automatic reading only picks up messages from the moment it is on;
 *   older ones are read here on demand (the last 7, 30 or 90 days)
 * Recording writes encrypted records, so the vault must be unlocked for it.
 */

import React, { useState } from 'react';
import { MessageSquareText, History } from 'lucide-react';
import { Button, Card, FeaturePageHeader, FilterPills } from '../../shared/ui/index.js';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import VaultUnlockCard from '../../shared/vault/VaultUnlockCard.jsx';
import { useVault } from '../../shared/vault/useVault.js';
import { useDemo } from '../demo/index.js';
import { useAccounts } from '../accounts/hooks/useAccounts.js';
import { usePricing } from '../market/index.js';
import { markSmsHandled, readSmsDays, smsPermission } from '../../shared/native/smsInbox.js';
import * as expensesApi from '../../shared/vault/vaultExpenses.js';
import { createIncome } from '../incomes/api/incomeApi.js';
import ExpenseForm from '../expenses/components/ExpenseForm.jsx';
import IncomeForm from '../incomes/components/IncomeForm.jsx';
import SmsInboxList from './SmsInboxList.jsx';
import { smsExpenseDraft, smsIncomeDraft } from './smsDrafts.js';

const DAY_OPTIONS = [7, 30, 90].map((d) => ({ value: d, label: `${d.toLocaleString('fa-IR')} روز` }));

/** An everyday expense (in the daily section, created on first use) */
async function saveDailyExpense(input) {
  const { groups } = await expensesApi.getExpenseGroups();
  const group = await expensesApi.ensureDailyGroup(groups);
  return expensesApi.saveExpense({ ...input, groupId: group.id });
}

export default function SmsInboxPage() {
  const { toast } = useFeedback();
  const { readOnly } = useDemo();
  const { status: vaultStatus } = useVault();
  const { accounts } = useAccounts();
  const pricing = usePricing();
  const usdToman = Number(pricing?.getAssetPrice?.('usd')) || 0;
  const [expenseDraft, setExpenseDraft] = useState(null);
  const [incomeDraft, setIncomeDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [days, setDays] = useState(30);
  const [reading, setReading] = useState(false);

  const locked = vaultStatus === 'locked';

  const handleRecord = (item) => {
    if (item.tx.direction === 'debit') setExpenseDraft(smsExpenseDraft(item.tx, accounts));
    else setIncomeDraft(smsIncomeDraft(item.tx));
  };

  /** Save through `save`, then drop the message from the inbox */
  const record = (save, fingerprint, done) => async (input) => {
    setSaving(true);
    try {
      await save(input);
      markSmsHandled(fingerprint);
      toast.success(done);
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
      const { read, added } = await readSmsDays(days);
      toast.success(`${read.toLocaleString('fa-IR')} پیامک بانکی خوانده شد؛ ${added.toLocaleString('fa-IR')} مورد جدید برای ثبت.`);
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
        <SmsInboxList accounts={accounts} onRecord={handleRecord} canRecord={!locked && !readOnly} />
      </Card>

      <Card
        className="sms-inbox-page-card"
        padding="lg"
        icon={<History size={18} />}
        title="خواندن پیامک‌های قبلی"
        subtitle="خواندن خودکار فقط پیامک‌هایی را می‌گیرد که از زمان روشن شدنش می‌رسند؛ پیامک‌های قبل را اینجا بخوانید (تکراری‌ها و ثبت‌شده‌ها کنار گذاشته می‌شوند)."
      >
        <div className="app-setting-actions">
          <FilterPills options={DAY_OPTIONS} activeValue={days} onChange={setDays} size="sm" />
          <Button size="sm" onClick={handleReadPast} loading={reading}>بخوان</Button>
        </div>
      </Card>

      {expenseDraft && (
        <ExpenseForm
          daily
          draft={expenseDraft}
          usdToman={usdToman}
          accounts={accounts.filter((a) => !a.archived)}
          submitting={saving}
          onClose={() => setExpenseDraft(null)}
          onSubmit={record(saveDailyExpense, expenseDraft.smsFingerprint, 'هزینه ثبت شد.')}
        />
      )}
      {incomeDraft && (
        <IncomeForm
          draft={incomeDraft}
          submitting={saving}
          onClose={() => setIncomeDraft(null)}
          onSubmit={record(createIncome, incomeDraft.smsFingerprint, 'درآمد ثبت شد.')}
        />
      )}
    </div>
  );
}
