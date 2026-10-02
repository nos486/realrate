/**
 * SmsInboxList.jsx — The bank messages read by the Android app, waiting to be recorded
 *
 * Until the app may read SMS: a card to turn automatic reading on (asks for the permission;
 * from then on each bank message is read as it arrives), or to decline it. Afterwards: the
 * withdrawals and deposits (smsInbox.js) neither recorded nor dismissed, newest first.
 * «ثبت» hands the message to `onRecord` (the page opens the expense or income form); a withdrawal
 * up to QUICK_RECORD_MAX also gets «ثبت سریع» (`onQuickRecord`: recorded as it is, no form); a
 * deposit gets «وام» (`onLoanDeposit`: a received loan, not income) and «دنگ» (`onShareDeposit`:
 * someone's share of an expense the user paid, not income); «رد» drops it for good.
 */

import React, { useEffect, useState } from 'react';
import { MessageSquareText, Check, X, ArrowDownLeft, ArrowUpRight, BellRing, Inbox, Zap, Landmark, HandCoins } from 'lucide-react';
import { Button, EmptyState } from '../../shared/ui/index.js';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { BankLogo, resolveBank } from '../../shared/banks/index.js';
import { useSmsInbox } from '../../shared/native/useSmsInbox.js';
import { dismissSms, smsPermission, enableSmsReading, setSmsSettings, SMS_SENDERS, QUICK_RECORD_MAX } from '../../shared/native/smsInbox.js';
import { matchSmsAccount } from '../../utils/bankSms.js';
import { formatShamsiDisplay } from '../portfolio/components/ShamsiDatePicker.jsx';
import { accountLabel } from '../accounts/constants/accountDisplay.js';
import { formatAmount } from '../expenses/utils/format.js';

const faTime = (time) => time.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

function EnableCard({ onChange }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);

  const handleEnable = async () => {
    setBusy(true);
    try {
      const { permission } = await enableSmsReading();
      onChange(permission);
      if (permission !== 'granted') {
        toast.error('اجازه‌ی خواندن پیامک داده نشد. از تنظیمات گوشی (برنامه‌ها ← RealRate ← مجوزها) آن را بدهید.', { duration: 8000 });
      } else {
        toast.success('از این پس پیامک‌های بانک خودکار خوانده می‌شوند.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="sms-inbox-card is-setup">
      <header className="sms-inbox-head">
        <BellRing size={18} />
        <h4>ثبت خودکار از پیامک بانک</h4>
      </header>
      <p className="sms-inbox-setup-text">
        از این پس با هر پیامک برداشت یا واریز بانک اعلانی می‌آید و مبلغ و تاریخ آماده‌ی ثبت است؛ فقط دسته را انتخاب کنید.
      </p>
      <ul className="sms-inbox-privacy">
        <li>فقط پیامک‌های <strong>برداشت و واریز</strong> فرستنده‌های بانک (<bdi dir="ltr">{SMS_SENDERS.join(', ')}</bdi>) خوانده می‌شوند؛ پیامک‌های دیگر — حتی پیام‌های دیگر بانک — به برنامه نمی‌رسند و اعلانی ندارند.</li>
        <li>پیامک‌های رمز پویا و کد تأیید، حتی از خود بانک، همان‌جا کنار گذاشته می‌شوند و خوانده یا نمایش داده نمی‌شوند.</li>
        <li>متن پیامک از گوشی خارج نمی‌شود و ذخیره هم نمی‌شود؛ فقط مبلغ و تاریخی که ثبت می‌کنید، رمزنگاری‌شده، ذخیره می‌شود.</li>
        <li>اعلان‌ها متن پیامک را نشان نمی‌دهند. هر وقت بخواهید از تنظیمات اپ یا گوشی خاموشش کنید.</li>
      </ul>
      <div className="sms-inbox-setup-actions">
        <Button size="sm" icon={<MessageSquareText size={14} />} onClick={handleEnable} loading={busy}>
          فعال کردن
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setSmsSettings({ auto: false })} disabled={busy}>
          نه، ممنون
        </Button>
      </div>
    </section>
  );
}

/**
 * @param {{ accounts?: object[], onRecord: (item: object) => void, canRecord?: boolean }} props
 */
export default function SmsInboxList({ accounts = [], onRecord, onQuickRecord, quickRecordingId = null, onLoanDeposit, onShareDeposit, canRecord = true }) {
  const { pending, settings } = useSmsInbox();
  const [permission, setPermission] = useState(null);

  useEffect(() => {
    smsPermission().then(setPermission);
  }, [settings.auto]);

  if (permission && permission !== 'granted' && settings.auto) return <EnableCard onChange={setPermission} />;

  if (!pending.length) {
    return (
      <EmptyState
        icon={<Inbox size={40} strokeWidth={1.5} />}
        title="پیامک ثبت‌نشده‌ای نیست"
        description={permission === 'granted' && settings.auto
          ? 'پیامک‌های بانک به محض رسیدن اینجا می‌آیند.'
          : 'خواندن خودکار پیامک خاموش است (تنظیمات اپ).'}
      />
    );
  }

  return (
    <ul className="sms-inbox-list" aria-label="پیامک‌های بانکی ثبت‌نشده">
      {pending.map((item) => {
        const { tx } = item;
        const bank = resolveBank({ bankId: tx.bankId });
        const account = accounts.find((a) => a.id === matchSmsAccount(tx, accounts));
        const isDebit = tx.direction === 'debit';
        return (
          <li key={item.fingerprint} className={`sms-inbox-item ${isDebit ? 'is-debit' : 'is-credit'}`}>
            <BankLogo bank={bank} size={30} />
            <div className="sms-inbox-info">
              <strong>
                <span className="sms-inbox-kind">
                  {isDebit ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} />}
                  {isDebit ? 'برداشت' : 'واریز'}
                </span>
                {formatAmount(tx.amount)} <small>تومان</small>
              </strong>
              <span>
                {tx.date ? formatShamsiDisplay(`${tx.date}T00:00:00`) : bank.shortName}
                {tx.time && ` · ${faTime(tx.time)}`}
                {' · '}
                {account ? accountLabel(account) : bank.shortName}
              </span>
            </div>
            <div className="sms-inbox-actions">
              {onQuickRecord && isDebit && tx.amount <= QUICK_RECORD_MAX && (
                <Button
                  size="sm"
                  icon={<Zap size={14} />}
                  onClick={() => onQuickRecord(item)}
                  loading={quickRecordingId === item.fingerprint}
                  disabled={!canRecord || Boolean(quickRecordingId)}
                  title="بدون فرم، با دسته‌ی تنظیمات اپ ثبت می‌شود"
                >
                  ثبت سریع
                </Button>
              )}
              <Button
                size="sm"
                variant={onQuickRecord && isDebit && tx.amount <= QUICK_RECORD_MAX ? 'secondary' : 'primary'}
                icon={<Check size={14} />}
                onClick={() => onRecord(item)}
                disabled={!canRecord}
              >
                ثبت
              </Button>
              {onLoanDeposit && !isDebit && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Landmark size={14} />}
                  onClick={() => onLoanDeposit(item)}
                  disabled={!canRecord}
                  title="این واریز، دریافت وام است (درآمد نیست)"
                >
                  وام
                </Button>
              )}
              {onShareDeposit && !isDebit && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<HandCoins size={14} />}
                  onClick={() => onShareDeposit(item)}
                  disabled={!canRecord}
                  title="این واریز، سهم دیگران از هزینه‌ای است که پرداختید (درآمد نیست)"
                >
                  دنگ
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                icon={<X size={14} />}
                onClick={() => dismissSms(item.fingerprint)}
                aria-label="رد این پیامک"
              >
                رد
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
