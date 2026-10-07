/**
 * AccountForm.jsx — Modal to add or edit a money account (bank account, bank credit, cash,
 * e-wallet, ...). A bank credit also takes its terms: the limit, when a statement closes and is
 * due, whether it is paid any day or only on the due day, the settlement fee, and the installments
 * an unsettled statement becomes (utils/creditAccount.js).
 * Mounted only while open, so its state starts from props.
 */

import React, { useState } from 'react';
import { WalletCards } from 'lucide-react';
import { AlertBanner, Button, FilterPills, Input, Modal, NumericInput } from '../../../shared/ui/index.js';
import { BankPicker } from '../../../shared/banks/index.js';
import { ACCOUNT_TYPES, ACCOUNT_LIMITS } from '../../../utils/accountDocument.js';
import { EXPENSE_CURRENCIES } from '../../../utils/expenseDocument.js';
import { CREDIT_PAY_MODES, CREDIT_DEFAULTS } from '../../../utils/creditAccount.js';
import { todayIso } from '../../../shared/utils/dates.js';
import ShamsiDatePicker, { gregorianToShamsi, shamsiToGregorian } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { getAccountTypeIcon } from '../constants/accountDisplay.js';

const TYPE_OPTIONS = ACCOUNT_TYPES.map(({ value, label }) => {
  const Icon = getAccountTypeIcon(value);
  return { value, label, icon: <Icon size={14} strokeWidth={2} /> };
});
const CURRENCY_OPTIONS = EXPENSE_CURRENCIES.map(({ value, label }) => ({ value, label }));
const PAY_MODE_OPTIONS = CREDIT_PAY_MODES.map(({ value, label }) => ({ value, label }));
const digits = (v) => String(v ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[^\d.]/g, '');

/** A credit's terms as the form edits them (strings), from the stored ones or the defaults */
function creditFields(credit) {
  const c = { ...CREDIT_DEFAULTS, ...(credit || {}) };
  return {
    limit: credit?.limit ? String(credit.limit) : '',
    closingDay: String(c.closingDay),
    graceDays: String(c.graceDays),
    payMode: c.payMode,
    settleFeePct: String(c.settleFeePct),
    installmentCount: String(c.installmentCount),
    installmentRatePct: String(c.installmentRatePct),
    openingDebt: c.openingDebt ? String(c.openingDebt) : '',
    startShamsi: gregorianToShamsi(`${c.startDate || todayIso()}T00:00:00`),
  };
}

export default function AccountForm({ account = null, onSubmit, onClose, submitting = false }) {
  const [type, setType] = useState(account?.type || 'bank');
  const [name, setName] = useState(account?.name || '');
  const [bank, setBank] = useState({ bankId: account?.bankId || '', lenderName: account?.bankName || '' });
  const [cardLast4, setCardLast4] = useState(account?.cardLast4 || '');
  const [accountNumber, setAccountNumber] = useState(account?.accountNumber || '');
  const [currency, setCurrency] = useState(account?.currency || 'IRT');
  const [notes, setNotes] = useState(account?.notes || '');
  const [credit, setCredit] = useState(() => creditFields(account?.credit));
  const [submitError, setSubmitError] = useState('');
  const setTerm = (key) => (value) => setCredit((c) => ({ ...c, [key]: value }));

  const isCredit = type === 'credit';
  // A bank account and a bank credit both belong to a bank
  const isBank = type === 'bank' || isCredit;
  // An empty name falls back to the bank's
  const effectiveName = name.trim() || (isBank ? bank.lenderName : '');
  const limitNum = Number(digits(credit.limit)) || 0;
  const isValid = Boolean(effectiveName) && !submitting && (!isCredit || limitNum > 0);

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
        currency: isCredit ? 'IRT' : currency,
        notes: notes.trim(),
        ...(isCredit ? {
          credit: {
            limit: limitNum,
            closingDay: Number(digits(credit.closingDay)) || 1,
            graceDays: Number(digits(credit.graceDays)) || 0,
            payMode: credit.payMode,
            settleFeePct: Number(digits(credit.settleFeePct)) || 0,
            installmentCount: Number(digits(credit.installmentCount)) || 1,
            installmentRatePct: Number(digits(credit.installmentRatePct)) || 0,
            openingDebt: Number(digits(credit.openingDebt)) || 0,
            startDate: shamsiToGregorian(credit.startShamsi) || todayIso(),
          },
        } : {}),
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
      subtitle="حساب بانکی، اعتبار بانکی، پول نقد یا کیف پول؛ برای مشخص کردن منبع هر هزینه"
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
          placeholder={isCredit ? 'مثلاً: اعتبار خرید' : isBank ? (bank.lenderName ? `خالی: «${bank.lenderName}»` : 'مثلاً: حساب حقوق') : 'مثلاً: کیف پول، صندوق خانه'}
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

        {isCredit ? (
          <CreditTermsFields credit={credit} setTerm={setTerm} />
        ) : (
          <div className="ui-input-group">
            <span className="ui-input-label">ارز حساب</span>
            <FilterPills options={CURRENCY_OPTIONS} activeValue={currency} onChange={setCurrency} size="sm" />
          </div>
        )}

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

/** A credit's terms: the limit, its statements, and what happens when one isn't settled */
function CreditTermsFields({ credit, setTerm }) {
  const numberField = (id, key, label, { hint } = {}) => (
    <div className="ui-input-group">
      <label htmlFor={id} className="ui-input-label">{label}</label>
      <div className="ui-input-wrapper">
        <NumericInput id={id} value={credit[key]} onValueChange={setTerm(key)} allowDecimals={key.endsWith('Pct')} className="ui-input-control" />
      </div>
      {hint && <p className="expense-form-hint">{hint}</p>}
    </div>
  );
  return (
    <div className="credit-terms-fields">
      {numberField('credit-limit', 'limit', 'سقف اعتبار (تومان) *')}
      <div className="credit-terms-row">
        {numberField('credit-closing-day', 'closingDay', 'روز بستن صورت‌حساب', { hint: 'خریدهای تا این روز هر ماه یک صورت‌حساب‌اند' })}
        {numberField('credit-grace', 'graceDays', 'مهلت پرداخت (روز)', { hint: '۰: همان روز بستن صورت‌حساب' })}
      </div>
      <div className="ui-input-group">
        <span className="ui-input-label">زمان پرداخت</span>
        <FilterPills options={PAY_MODE_OPTIONS} activeValue={credit.payMode} onChange={setTerm('payMode')} size="sm" />
      </div>
      {numberField('credit-fee', 'settleFeePct', 'کارمزد تسویه (درصد)', { hint: 'کارمزد پرداخت به‌موقع صورت‌حساب؛ ۰ اگر رایگان است' })}
      <div className="credit-terms-row">
        {numberField('credit-installments', 'installmentCount', 'در صورت پرداخت‌نکردن: تعداد اقساط')}
        {numberField('credit-rate', 'installmentRatePct', 'سود سالانه‌ی اقساط (درصد)')}
      </div>
      {numberField('credit-opening', 'openingDebt', 'بدهی فعلی هنگام ثبت (تومان، اختیاری)', { hint: 'آنچه پیش از افزودن این حساب خرج شده و هنوز پرداخت نشده' })}
      <ShamsiDatePicker label="محاسبه از تاریخ" value={credit.startShamsi} onChange={setTerm('startShamsi')} />
    </div>
  );
}
