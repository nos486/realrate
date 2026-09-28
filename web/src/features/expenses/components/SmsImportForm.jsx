/**
 * SmsImportForm.jsx — Paste a bank SMS, see what it says, and record it as an everyday expense
 *
 * The message is read in the browser (utils/bankSms.js with the banks in bankSmsTemplates.js);
 * nothing is sent anywhere. A withdrawal continues to the expense form, filled in: amount (the
 * message's rials in tomans), day, the account it matches, and a note with the bank and time.
 * A message already recorded (same fingerprint among the loaded expenses) is flagged.
 */

import React, { useMemo, useState } from 'react';
import { MessageSquareText, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { AlertBanner, Button, Input, Modal } from '../../../shared/ui/index.js';
import { BankLogo, resolveBank } from '../../../shared/banks/index.js';
import { parseBankSms, matchSmsAccount } from '../../../utils/bankSms.js';
import { BANK_SMS_TEMPLATES, SMS_BANK_IDS } from '../../../utils/bankSmsTemplates.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { accountLabel } from '../../accounts/constants/accountDisplay.js';
import { formatAmount } from '../utils/format.js';

const faTime = (time) => time.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const SUPPORTED_BANKS = SMS_BANK_IDS.map((id) => resolveBank({ bankId: id }).shortName).join('، ');

/**
 * The expense a withdrawal SMS becomes (the form's draft)
 * @returns {object}
 */
export function smsExpenseDraft(tx, accounts = []) {
  const bank = resolveBank({ bankId: tx.bankId });
  const note = [`پیامک ${bank.shortName}`, tx.time && `ساعت ${faTime(tx.time)}`].filter(Boolean).join(' · ');
  return {
    amount: Math.round(tx.amount),
    date: tx.date,
    accountId: matchSmsAccount(tx, accounts),
    notes: note,
    source: 'sms',
    bankId: tx.bankId,
    smsFingerprint: tx.fingerprint,
  };
}

/**
 * @param {{ accounts?: object[], recorded?: object[], onContinue: (draft: object) => void,
 *   onClose: () => void }} props
 *   `recorded`: expenses already loaded, to spot a message recorded before
 */
export default function SmsImportForm({ accounts = [], recorded = [], onContinue, onClose }) {
  const [text, setText] = useState('');
  const tx = useMemo(() => (text.trim() ? parseBankSms(text, BANK_SMS_TEMPLATES) : null), [text]);
  const bank = tx ? resolveBank({ bankId: tx.bankId }) : null;
  const accountId = tx ? matchSmsAccount(tx, accounts) : '';
  const account = accounts.find((a) => a.id === accountId);
  const duplicate = tx && recorded.some((e) => e.smsFingerprint && e.smsFingerprint === tx.fingerprint);
  const isDebit = tx?.direction === 'debit';

  const handleSubmit = (e) => {
    e?.preventDefault?.();
    if (tx && isDebit) onContinue(smsExpenseDraft(tx, accounts));
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="افزودن از پیامک بانک"
      subtitle="متن پیامک برداشت را اینجا بچسبانید"
      icon={<MessageSquareText size={18} />}
      maxWidth="520px"
      onSubmit={handleSubmit}
      footer={
        <div className="modal-actions">
          <Button variant="secondary" block onClick={onClose}>انصراف</Button>
          <Button type="submit" block disabled={!tx || !isDebit}>ادامه و ثبت هزینه</Button>
        </div>
      }
    >
      <div className="income-form-body">
        <Input
          id="sms-text"
          as="textarea"
          label="متن پیامک"
          placeholder={'مثلاً:\n30101540968603\nمبلغ:397,500-\nمانده:81,294,045\n07/06\n14:49'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          dir="auto"
          autoFocus
        />

        {text.trim() && !tx && (
          <AlertBanner
            type="warning"
            message={`این پیامک شناخته نشد. بانک‌هایی که فعلاً پیامکشان خوانده می‌شود: ${SUPPORTED_BANKS}.`}
          />
        )}

        {tx && (
          <div className={`sms-preview ${isDebit ? 'is-debit' : 'is-credit'}`} aria-live="polite">
            <div className="sms-preview-head">
              <BankLogo bank={bank} size={32} />
              <div>
                <strong>{bank.name}</strong>
                <span className="sms-preview-kind">
                  {isDebit ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
                  {isDebit ? 'برداشت' : 'واریز'}
                </span>
              </div>
              <span className="sms-preview-amount">
                {formatAmount(tx.amount)} <small>تومان</small>
              </span>
            </div>
            <dl className="sms-preview-details">
              {tx.date && (<><dt>تاریخ</dt><dd>{formatShamsiDisplay(`${tx.date}T00:00:00`)}{tx.time && ` · ${faTime(tx.time)}`}</dd></>)}
              {tx.balance !== null && (<><dt>مانده</dt><dd>{formatAmount(tx.balance)} تومان</dd></>)}
              {tx.account && (<><dt>حساب</dt><dd><bdi dir="ltr">{tx.account}</bdi></dd></>)}
              <dt>پرداخت از</dt>
              <dd>{account ? accountLabel(account) : 'حسابی با این بانک و شماره پیدا نشد (در فرم انتخاب کنید)'}</dd>
            </dl>
          </div>
        )}

        {duplicate && <AlertBanner type="warning" message="این پیامک قبلاً ثبت شده است." />}
        {tx && !isDebit && (
          <AlertBanner type="info" message="این پیامک واریز است؛ فعلاً فقط برداشت‌ها به‌عنوان هزینه ثبت می‌شوند." />
        )}
      </div>
    </Modal>
  );
}
