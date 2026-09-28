/**
 * AccountForm.jsx — Modal to add or edit a money account (bank account, cash, e-wallet, ...)
 * Mounted only while open, so its state starts from props.
 */

import React, { useState } from 'react';
import { WalletCards } from 'lucide-react';
import { AlertBanner, Button, FilterPills, Input, Modal } from '../../../shared/ui/index.js';
import { BankPicker } from '../../../shared/banks/index.js';
import { ACCOUNT_TYPES, ACCOUNT_LIMITS } from '../../../utils/accountDocument.js';
import { EXPENSE_CURRENCIES } from '../../../utils/expenseDocument.js';
import { getAccountTypeIcon } from '../constants/accountDisplay.js';

const TYPE_OPTIONS = ACCOUNT_TYPES.map(({ value, label }) => {
  const Icon = getAccountTypeIcon(value);
  return { value, label, icon: <Icon size={14} strokeWidth={2} /> };
});
const CURRENCY_OPTIONS = EXPENSE_CURRENCIES.map(({ value, label }) => ({ value, label }));

export default function AccountForm({ account = null, onSubmit, onClose, submitting = false }) {
  const [type, setType] = useState(account?.type || 'bank');
  const [name, setName] = useState(account?.name || '');
  const [bank, setBank] = useState({ bankId: account?.bankId || '', lenderName: account?.bankName || '' });
  const [cardLast4, setCardLast4] = useState(account?.cardLast4 || '');
  const [accountNumber, setAccountNumber] = useState(account?.accountNumber || '');
  const [currency, setCurrency] = useState(account?.currency || 'IRT');
  const [notes, setNotes] = useState(account?.notes || '');
  const [submitError, setSubmitError] = useState('');

  const isBank = type === 'bank';
  // An empty name falls back to the bank's
  const effectiveName = name.trim() || (isBank ? bank.lenderName : '');
  const isValid = Boolean(effectiveName) && !submitting;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!isValid) return;
    setSubmitError('');
    try {
      await onSubmit({
        type,
        name: effectiveName,
        bankId: isBank ? bank.bankId : '',
        bankName: isBank ? bank.lenderName : '',
        cardLast4: isBank ? cardLast4 : '',
        accountNumber: isBank ? accountNumber : '',
        currency,
        notes: notes.trim(),
        archived: account?.archived || false,
      });
      onClose();
    } catch (err) {
      setSubmitError(err.message || 'خطا در ذخیره حساب');
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={account ? 'ویرایش حساب' : 'حساب جدید'}
      subtitle="حساب بانکی، پول نقد یا کیف پول؛ برای مشخص کردن منبع هر هزینه"
      icon={<WalletCards size={18} />}
      maxWidth="520px"
      onSubmit={handleSubmit}
      footer={
        <div className="modal-actions">
          <Button variant="secondary" block disabled={submitting} onClick={onClose}>انصراف</Button>
          <Button type="submit" block loading={submitting} disabled={!isValid}>
            {account ? 'ذخیره تغییرات' : 'افزودن حساب'}
          </Button>
        </div>
      }
    >
      <div className="income-form-body">
        {submitError && <AlertBanner type="error" message={submitError} />}

        <div className="ui-input-group">
          <span className="ui-input-label">نوع</span>
          <FilterPills options={TYPE_OPTIONS} activeValue={type} onChange={setType} size="sm" />
        </div>

        {isBank && <BankPicker id="account-bank" value={bank} onChange={setBank} label="بانک" />}

        <Input
          id="account-name"
          label={isBank ? 'نام حساب (اختیاری)' : 'نام حساب *'}
          placeholder={isBank ? (bank.lenderName ? `خالی: «${bank.lenderName}»` : 'مثلاً: حساب حقوق') : 'مثلاً: کیف پول، صندوق خانه'}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={ACCOUNT_LIMITS.nameLength}
          required={!isBank}
        />

        {isBank && (
          <Input
            id="account-card"
            label="چهار رقم آخر کارت (اختیاری)"
            placeholder="مثلاً ۱۲۳۴"
            value={cardLast4}
            onChange={(e) => setCardLast4(e.target.value.replace(/[^\d۰-۹٠-٩]/g, '').slice(0, 4))}
            inputMode="numeric"
            maxLength={4}
          />
        )}

        {isBank && (
          <Input
            id="account-number"
            label="شماره حساب (اختیاری)"
            placeholder="برای تشخیص خودکار پیامک‌های بانک"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value.replace(/[^\d۰-۹٠-٩]/g, '').slice(0, 26))}
            inputMode="numeric"
            dir="ltr"
            maxLength={26}
          />
        )}

        <div className="ui-input-group">
          <span className="ui-input-label">ارز حساب</span>
          <FilterPills options={CURRENCY_OPTIONS} activeValue={currency} onChange={setCurrency} size="sm" />
        </div>

        <Input
          id="account-notes"
          as="textarea"
          label="توضیحات (اختیاری)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={ACCOUNT_LIMITS.notesLength}
          rows={2}
        />
      </div>
    </Modal>
  );
}
