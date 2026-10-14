/**
 * SmsReadHistory.jsx — After «بخوان» (reading earlier messages by hand): the transactions it found
 * that are already recorded or were dismissed, so the user sees what is in and what isn't. Kept
 * only on screen: leaving the SMS page clears it (nothing is stored).
 */

import { intlLocale, t } from '../../utils/i18n.js';
import { toPersianDigits } from '../../shared/utils/formatters.js';
import React, { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, X, ListChecks, Undo2 } from 'lucide-react';
import { Button, Card } from '../../shared/ui/index.js';
import { BankLogo, resolveBank } from '../../shared/banks/index.js';
import { formatShamsiDisplay } from '../portfolio/components/ShamsiDatePicker.jsx';
import { formatAmount } from '../expenses/utils/format.js';

const faTime = (v) => toPersianDigits(v);

/** Rows shown at a time: what a long read found is not listed in full */
const PAGE_SIZE = 50;

const OUTCOME = {
  recorded: { label: t('ثبت شده'), Icon: CheckCircle2, className: 'is-recorded' },
  dismissed: { label: t('رد شده'), Icon: X, className: 'is-dismissed' },
};

/**
 * @param {{ items: Array<{ fingerprint: string, tx: object, outcome: 'recorded'|'dismissed' }>,
 *   onRestore?: (item: object) => void }} props `onRestore`: puts a dismissed message back in the inbox
 */
export default function SmsReadHistory({ items, onRestore }) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  if (!items?.length) return null;
  return (
    <Card
      className="sms-inbox-page-card sms-read-history"
      padding="lg"
      icon={<ListChecks size={18} />}
      title={t('قبلاً ثبت‌شده')}
      subtitle={t('پیامک‌هایی که این بار خوانده شد و از قبل ثبت یا رد شده‌اند؛ رد شده‌ها را می‌توانید برگردانید تا دوباره قابل ثبت و ویرایش شوند. با بستن این صفحه فهرست پاک می‌شود.')}
    >
      <ul className="sms-inbox-list" aria-label={t('پیامک‌های قبلاً ثبت‌شده')}>
        {items.slice(0, limit).map((item) => {
          const { fingerprint, tx, outcome } = item;
          const bank = resolveBank({ bankId: tx.bankId });
          const isDebit = tx.direction === 'debit';
          const status = OUTCOME[outcome];
          return (
            <li key={fingerprint} className={`sms-inbox-item is-past ${isDebit ? 'is-debit' : 'is-credit'}`}>
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
                  {bank.shortName}
                </span>
              </div>
              <span className={`sms-read-status ${status.className}`}>
                <status.Icon size={14} aria-hidden="true" />
                {status.label}
              </span>
              {outcome === 'dismissed' && onRestore && (
                <button type="button" className="sms-inbox-dismiss" onClick={() => onRestore(item)}>
                  <Undo2 size={14} aria-hidden="true" />
                  {t('برگردان')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {items.length > limit && (
        <Button block variant="secondary" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
          {t('نمایش بیشتر ({n} مورد دیگر)', { n: (items.length - limit).toLocaleString(intlLocale()) })}
        </Button>
      )}
    </Card>
  );
}
