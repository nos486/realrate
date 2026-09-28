/**
 * SmsInboxCard.jsx — Bank withdrawals read from SMS, waiting to be recorded (Android app)
 *
 * Shown above the everyday expenses when the app has read withdrawals (smsInbox.js) that are
 * neither recorded nor dismissed. «ثبت» opens the expense form filled in from the message (only
 * the category is left to pick); «رد» drops it for good.
 */

import React from 'react';
import { MessageSquareText, Check, X } from 'lucide-react';
import { Button } from '../../../shared/ui/index.js';
import { BankLogo, resolveBank } from '../../../shared/banks/index.js';
import { useSmsInbox } from '../../../shared/native/useSmsInbox.js';
import { markSmsHandled } from '../../../shared/native/smsInbox.js';
import { matchSmsAccount } from '../../../utils/bankSms.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { accountLabel } from '../../accounts/constants/accountDisplay.js';
import { formatAmount } from '../utils/format.js';

const faTime = (time) => time.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const SHOWN = 5;

/**
 * @param {{ accounts?: object[], onRecord: (item: object) => void, readOnly?: boolean }} props
 */
export default function SmsInboxCard({ accounts = [], onRecord, readOnly = false }) {
  const { pending } = useSmsInbox();
  if (!pending.length) return null;

  return (
    <section className="sms-inbox-card" aria-label="پیامک‌های بانکی ثبت‌نشده">
      <header className="sms-inbox-head">
        <MessageSquareText size={18} />
        <h4>پیامک‌های بانکی ثبت‌نشده</h4>
        <span className="sms-inbox-count">{pending.length.toLocaleString('fa-IR')}</span>
      </header>
      <ul className="sms-inbox-list">
        {pending.slice(0, SHOWN).map((item) => {
          const { tx } = item;
          const bank = resolveBank({ bankId: tx.bankId });
          const account = accounts.find((a) => a.id === matchSmsAccount(tx, accounts));
          return (
            <li key={item.fingerprint} className="sms-inbox-item">
              <BankLogo bank={bank} size={30} />
              <div className="sms-inbox-info">
                <strong>{formatAmount(tx.amount)} <small>تومان</small></strong>
                <span>
                  {tx.date ? formatShamsiDisplay(`${tx.date}T00:00:00`) : bank.shortName}
                  {tx.time && ` · ${faTime(tx.time)}`}
                  {' · '}
                  {account ? accountLabel(account) : bank.shortName}
                </span>
              </div>
              <div className="sms-inbox-actions">
                <Button size="sm" icon={<Check size={14} />} onClick={() => onRecord(item)} disabled={readOnly}>ثبت</Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<X size={14} />}
                  onClick={() => markSmsHandled(item.fingerprint)}
                  aria-label="رد این پیامک"
                >
                  رد
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {pending.length > SHOWN && (
        <p className="sms-inbox-more">و {(pending.length - SHOWN).toLocaleString('fa-IR')} پیامک دیگر</p>
      )}
    </section>
  );
}
