/**
 * SmsInboxList.jsx — The bank messages read by the Android app, waiting to be recorded
 *
 * Until the app may read SMS: a card to turn automatic reading on (asks for the permission;
 * from then on each bank message is read as it arrives), or to decline it. Afterwards: the
 * withdrawals and deposits (smsInbox.js) neither recorded nor dismissed, newest first.
 * Each message shows one main action and a «⋮» menu with the rest (they don't fit a phone's row):
 * «ثبت» hands the message to `onRecord` (the page opens the expense or income form); with «ثبت سریع»
 * turned on in the app's settings (`quickRecord`, off by default), a withdrawal up to
 * QUICK_RECORD_MAX shows «ثبت سریع» instead (`onQuickRecord`: recorded as it is, no form), with
 * «ثبت با فرم» in the menu; a withdrawal can also go to a project («ثبت در یک پروژه»,
 * `onRecordToProject`) or as the installments of one or several loans («قسط وام», `onLoanInstallment`); a deposit's menu has «وام» (`onLoanDeposit`: a received loan, not
 * income) and «دنگ» (`onShareDeposit`: someone's share of an expense the user paid, not income);
 * either kind can be «انتقال بین حساب‌های خودم» (`onTransfer`: money moved between the user's own
 * accounts — neither expense nor income). «رد همه» above the list drops every message on show (after a
 * confirmation). «رد» (beside the main action, not in the menu) drops it
 * for good — or, when the page gives `onReject` (the «رد شده» setting on), hands the messages to it
 * instead, to be kept there. With messages from more than one bank, pills above the list filter
 * them by bank.
 */

import { intlLocale, t } from '../../utils/i18n.js';
import { toPersianDigits } from '../../shared/utils/formatters.js';
import React, { useEffect, useMemo, useState } from 'react';
import { MessageSquareText, Check, X, ArrowDownLeft, ArrowUpRight, BellRing, Inbox, Zap, Landmark, HandCoins, FolderOpen, ArrowLeftRight } from 'lucide-react';
import { ActionMenu, Button, EmptyState } from '../../shared/ui/index.js';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { BankLogo, resolveBank } from '../../shared/banks/index.js';
import { useSmsInbox } from '../../shared/native/useSmsInbox.js';
import { dismissSms, dismissSmsMany, smsPermission, enableSmsReading, setSmsSettings, SMS_SENDERS, QUICK_RECORD_MAX } from '../../shared/native/smsInbox.js';
import { matchSmsAccount } from '../../utils/bankSms.js';
import { formatShamsiDisplay } from '../portfolio/components/ShamsiDatePicker.jsx';
import { accountLabel } from '../accounts/constants/accountDisplay.js';
import { formatAmount } from '../expenses/utils/format.js';

/** Rows shown at a time: a long inbox (hundreds of messages) is revealed a page at a time */
const PAGE_SIZE = 50;

const faTime = (v) => toPersianDigits(v);

function EnableCard({ onChange }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);

  const handleEnable = async () => {
    setBusy(true);
    try {
      const { permission } = await enableSmsReading();
      onChange(permission);
      if (permission !== 'granted') {
        toast.error(t('اجازه‌ی خواندن پیامک داده نشد. از تنظیمات گوشی (برنامه‌ها ← RealRate ← مجوزها) آن را بدهید.'), { duration: 8000 });
      } else {
        toast.success(t('از این پس پیامک‌های بانک خودکار خوانده می‌شوند.'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="sms-inbox-card is-setup">
      <header className="sms-inbox-head">
        <BellRing size={18} />
        <h4>{t('ثبت خودکار از پیامک بانک')}</h4>
      </header>
      <p className="sms-inbox-setup-text">
        {t('از این پس با هر پیامک برداشت یا واریز بانک اعلانی می‌آید و مبلغ و تاریخ آماده‌ی ثبت است؛ فقط دسته را انتخاب کنید.')}
      </p>
      <ul className="sms-inbox-privacy">
        <li>{t('فقط پیامک‌های')} <strong>{t('برداشت و واریز')}</strong> {t('فرستنده‌های بانک (')}<bdi dir="ltr">{SMS_SENDERS.join(', ')}</bdi>{t(') خوانده می‌شوند؛ پیامک‌های دیگر — حتی پیام‌های دیگر بانک — به برنامه نمی‌رسند و اعلانی ندارند.')}</li>
        <li>{t('پیامک‌های رمز پویا و کد تأیید، حتی از خود بانک، همان‌جا کنار گذاشته می‌شوند و خوانده یا نمایش داده نمی‌شوند.')}</li>
        <li>{t('متن پیامک از گوشی خارج نمی‌شود و ذخیره هم نمی‌شود؛ فقط مبلغ و تاریخی که ثبت می‌کنید، رمزنگاری‌شده، ذخیره می‌شود.')}</li>
        <li>{t('اعلان‌ها متن پیامک را نشان نمی‌دهند. هر وقت بخواهید از تنظیمات اپ یا گوشی خاموشش کنید.')}</li>
      </ul>
      <div className="sms-inbox-setup-actions">
        <Button size="sm" icon={<MessageSquareText size={14} />} onClick={handleEnable} loading={busy}>
          {t('فعال کردن')}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setSmsSettings({ auto: false })} disabled={busy}>
          {t('نه، ممنون')}
        </Button>
      </div>
    </section>
  );
}

/**
 * @param {{ accounts?: object[], onRecord: (item: object) => void, canRecord?: boolean,
 *   onReject?: (items: object[]) => Promise<void>|void }} props `onReject`: what «رد» / «رد همه» do
 *   in place of dropping the messages (kept in «رد شده»)
 */
export default function SmsInboxList({ accounts = [], onRecord, onQuickRecord, quickRecordingId = null, onLoanDeposit, onLoanInstallment, onShareDeposit, onRecordToProject, onTransfer, onReject, canRecord = true }) {
  const { pending, settings } = useSmsInbox();
  const { confirm, toast } = useFeedback();
  const [permission, setPermission] = useState(null);
  const [bankFilter, setBankFilter] = useState('all');
  const [limit, setLimit] = useState(PAGE_SIZE);

  // The banks of the waiting messages, most messages first
  const banks = useMemo(() => {
    const map = new Map();
    for (const item of pending) {
      const id = item.tx.bankId || '';
      const entry = map.get(id) || { id, bank: resolveBank({ bankId: item.tx.bankId }), count: 0 };
      entry.count += 1;
      map.set(id, entry);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [pending]);
  // A bank whose messages are all handled falls back to «همه»
  const activeBank = banks.some((b) => b.id === bankFilter) ? bankFilter : 'all';
  const matching = activeBank === 'all' ? pending : pending.filter((item) => (item.tx.bankId || '') === activeBank);
  const shown = matching.slice(0, limit);

  useEffect(() => {
    smsPermission().then(setPermission);
  }, [settings.auto]);

  /** «رد همه»: after a confirmation, every message of the bank on show (all banks when none is picked) is dismissed */
  const handleDismissAll = async () => {
    const n = matching.length.toLocaleString(intlLocale());
    const ok = await confirm({
      title: t('رد همه‌ی پیامک‌ها'),
      message: onReject
        ? t('{n} پیامک در دسته‌ی «رد شده» ثبت می‌شود (جزو جمع‌ها نیست). ادامه می‌دهید؟', { n })
        : t('{n} پیامک کنار گذاشته می‌شود و ثبت نمی‌شود. ادامه می‌دهید؟', { n }),
      confirmLabel: t('رد همه'),
      danger: true,
    });
    if (!ok) return;
    if (onReject) {
      await onReject(matching);
      return;
    }
    dismissSmsMany(matching.map((item) => item.fingerprint));
    toast.success(t('{n} پیامک رد شد.', { n: matching.length.toLocaleString(intlLocale()) }));
  };

  if (permission && permission !== 'granted' && settings.auto) return <EnableCard onChange={setPermission} />;

  if (!pending.length) {
    return (
      <EmptyState
        icon={<Inbox size={40} strokeWidth={1.5} />}
        title={t('پیامک ثبت‌نشده‌ای نیست')}
        description={permission === 'granted' && settings.auto
          ? t('پیامک‌های بانک به محض رسیدن اینجا می‌آیند.')
          : t('خواندن خودکار پیامک خاموش است (تنظیمات اپ).')}
      />
    );
  }

  return (
    <>
    {banks.length > 1 && (
      <div className="tx-filter-pills-bar sms-bank-filter" role="group" aria-label={t('فیلتر بانک')}>
        {[{ id: 'all', count: pending.length }, ...banks].map(({ id, bank, count }) => (
          <button
            key={id || 'unknown'}
            type="button"
            className={`tx-filter-pill ${activeBank === id ? 'active' : ''}`}
            aria-pressed={activeBank === id}
            onClick={() => { setBankFilter(id); setLimit(PAGE_SIZE); }}
          >
            {id === 'all' ? t('همه‌ی بانک‌ها') : <><BankLogo bank={bank} size={16} /> {bank.shortName}</>}
            <span className="cheque-filter-count">{count.toLocaleString(intlLocale())}</span>
          </button>
        ))}
      </div>
    )}
    <div className="sms-inbox-bulk">
      <Button size="sm" variant="secondary" icon={<X size={14} />} onClick={handleDismissAll}>
        {t('رد همه ({n})', { n: matching.length.toLocaleString(intlLocale()) })}
      </Button>
    </div>
    <ul className="sms-inbox-list" aria-label={t('پیامک‌های بانکی ثبت‌نشده')}>
      {shown.map((item) => {
        const { tx } = item;
        const bank = resolveBank({ bankId: tx.bankId });
        const account = accounts.find((a) => a.id === matchSmsAccount(tx, accounts));
        const isDebit = tx.direction === 'debit';
        // «ثبت سریع» only when turned on in the app's settings; «ثبت» otherwise
        const quick = Boolean(onQuickRecord) && settings.quickRecord && isDebit && tx.amount <= QUICK_RECORD_MAX;
        return (
          <li key={item.fingerprint} className={`sms-inbox-item ${isDebit ? 'is-debit' : 'is-credit'}`}>
            <BankLogo bank={bank} size={30} />
            <div className="sms-inbox-info">
              <strong>
                <span className="sms-inbox-kind">
                  {isDebit ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} />}
                  {isDebit ? t('برداشت') : t('واریز')}
                </span>
                {formatAmount(tx.amount)} <small>{t('تومان')}</small>
              </strong>
              <span>
                {tx.date ? formatShamsiDisplay(`${tx.date}T00:00:00`) : bank.shortName}
                {tx.time && ` · ${faTime(tx.time)}`}
                {' · '}
                {account ? accountLabel(account) : bank.shortName}
              </span>
            </div>
            <div className="sms-inbox-actions">
              {/* One main action; the rest in «⋮» (narrow phones) */}
              {quick ? (
                <Button
                  size="sm"
                  icon={<Zap size={14} />}
                  onClick={() => onQuickRecord(item)}
                  loading={quickRecordingId === item.fingerprint}
                  disabled={!canRecord || Boolean(quickRecordingId)}
                  title={t('بدون فرم، با دسته‌ی تنظیمات اپ ثبت می‌شود')}
                >
                  {t('ثبت سریع')}
                </Button>
              ) : (
                <Button size="sm" icon={<Check size={14} />} onClick={() => onRecord(item)} disabled={!canRecord}>
                  {t('ثبت')}
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                icon={<X size={14} />}
                className="sms-inbox-dismiss"
                onClick={() => (onReject ? onReject([item]) : dismissSms(item.fingerprint))}
                title={onReject ? t('این پیامک در دسته‌ی «رد شده» ثبت شود (جزو جمع‌ها نیست)') : t('این پیامک کنار گذاشته شود (ثبت نمی‌شود)')}
              >
                {t('رد')}
              </Button>
              <ActionMenu
                label={t('گزینه‌های این پیامک')}
                items={[
                  quick && { key: 'record', label: t('ثبت با فرم'), icon: <Check size={16} />, onClick: () => onRecord(item), disabled: !canRecord },
                  onRecordToProject && isDebit && {
                    key: 'project', label: t('ثبت در یک پروژه'), icon: <FolderOpen size={16} />, onClick: () => onRecordToProject(item), disabled: !canRecord,
                  },
                  onLoanInstallment && isDebit && {
                    key: 'installment', label: t('قسط وام'), icon: <Landmark size={16} />, onClick: () => onLoanInstallment(item), disabled: !canRecord,
                  },
                  onLoanDeposit && !isDebit && {
                    key: 'loan', label: t('دریافت وام (درآمد نیست)'), icon: <Landmark size={16} />, onClick: () => onLoanDeposit(item), disabled: !canRecord,
                  },
                  onShareDeposit && !isDebit && {
                    key: 'share', label: t('دنگ یک هزینه (درآمد نیست)'), icon: <HandCoins size={16} />, onClick: () => onShareDeposit(item), disabled: !canRecord,
                  },
                  onTransfer && {
                    key: 'transfer', label: t('انتقال بین حساب‌های خودم'), icon: <ArrowLeftRight size={16} />, onClick: () => onTransfer(item), disabled: !canRecord,
                  },
                ]}
              />
            </div>
          </li>
        );
      })}
    </ul>
    {matching.length > shown.length && (
      <Button block variant="secondary" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
        {t('نمایش بیشتر ({n} پیامک دیگر)', { n: (matching.length - shown.length).toLocaleString(intlLocale()) })}
      </Button>
    )}
    </>
  );
}
