/**
 * AccountForm.jsx — Modal to add or edit a money account (bank account, bank credit, cash,
 * e-wallet, ...). A bank credit takes only its limit, the debt already owed when it is added and
 * the day to count from — no bank rules: settling it and turning it into installments are
 * recorded by hand from its card (utils/creditAccount.js). Any other account holds one or more
 * currencies (tomans, dollars or both — e.g. a Wise account); forms then offer it only for records
 * in a currency it holds (accountsForCurrency).
 * Mounted only while open, so its state starts from props.
 */

import React, { useState } from 'react';
import { WalletCards } from 'lucide-react';
import { AlertBanner, Button, FilterPills, Input, Modal, NumericInput } from '../../../shared/ui/index.js';
import { BankPicker } from '../../../shared/banks/index.js';
import { ACCOUNT_TYPES, ACCOUNT_LIMITS, accountCurrencies } from '../../../utils/accountDocument.js';
import { EXPENSE_CURRENCIES } from '../../../utils/expenseDocument.js';
import { todayIso } from '../../../shared/utils/dates.js';
import ShamsiDatePicker, { gregorianToShamsi, shamsiToGregorian } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { getAccountTypeIcon } from '../constants/accountDisplay.js';

const TYPE_OPTIONS = ACCOUNT_TYPES.map(({ value, label }) => {
  const Icon = getAccountTypeIcon(value);
  return { value, label, icon: <Icon size={14} strokeWidth={2} /> };
});
const CURRENCY_OPTIONS = EXPENSE_CURRENCIES.map(({ value, label }) => ({ value, label }));
const digits = (v) => String(v ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[^\d]/g, '');

/** A credit's terms as the form edits them (strings) */
function creditFields(credit) {
  return {
    limit: credit?.limit ? String(credit.limit) : '',
    openingDebt: credit?.openingDebt ? String(credit.openingDebt) : '',
    startShamsi: gregorianToShamsi(`${credit?.startDate || todayIso()}T00:00:00`),
  };
}

export default function AccountForm({ account = null, onSubmit, onClose, submitting = false }) {
  const [type, setType] = useState(account?.type || 'bank');
  const [name, setName] = useState(account?.name || '');
  const [bank, setBank] = useState({ bankId: account?.bankId || '', lenderName: account?.bankName || '' });
  const [cardLast4, setCardLast4] = useState(account?.cardLast4 || '');
  const [accountNumber, setAccountNumber] = useState(account?.accountNumber || '');
  const [currencies, setCurrencies] = useState(() => accountCurrencies(account));
  // At least one stays chosen: the last one can't be turned off
  const toggleCurrency = (value) => setCurrencies((list) => (list.includes(value)
    ? (list.length > 1 ? list.filter((c) => c !== value) : list)
    : CURRENCY_OPTIONS.map((o) => o.value).filter((c) => c === value || list.includes(c))));
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
  const isValid = Boolean(effectiveName) && !submitting
    && (!isCredit || limitNum > 0);

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
        currencies: isCredit ? ['IRT'] : currencies,
        notes: notes.trim(),
        ...(isCredit ? {
          credit: {
            limit: limitNum,
            openingDebt: Number(digits(credit.openingDebt)) || 0,
            startDate: shamsiToGregorian(credit.startShamsi) || todayIso(),
            // Its installment plans stay
            conversions: account?.credit?.conversions || [],
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
            <span className="ui-input-label" id="account-currencies-label">ارزهای حساب</span>
            <div className="ui-filter-pills variant-pills size-sm" role="group" aria-labelledby="account-currencies-label">
              {CURRENCY_OPTIONS.map((o) => {
                const on = currencies.includes(o.value);
                return (
                  <button key={o.value} type="button" className={`filter-pill-btn ${on ? 'active' : ''}`} aria-pressed={on} onClick={() => toggleCurrency(o.value)}>
                    <span className="pill-label">{o.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="expense-form-hint">حسابی که چند ارز دارد (مثلاً تومان و دلار) را یک‌بار ثبت کنید؛ در هر فرم فقط حساب‌هایی می‌آیند که ارز همان ثبت را دارند.</p>
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

/** A credit's terms: its limit, the debt already owed, and from when its records count */
function CreditTermsFields({ credit, setTerm }) {
  const numberField = (id, key, label, hint) => (
    <div className="ui-input-group">
      <label htmlFor={id} className="ui-input-label">{label}</label>
      <div className="ui-input-wrapper">
        <NumericInput id={id} value={credit[key]} onValueChange={setTerm(key)} className="ui-input-control" />
      </div>
      {hint && <p className="expense-form-hint">{hint}</p>}
    </div>
  );
  return (
    <div className="credit-terms-fields">
      {numberField('credit-limit', 'limit', 'سقف اعتبار (تومان) *')}
      {numberField('credit-opening', 'openingDebt', 'بدهی فعلی هنگام ثبت (تومان، اختیاری)', 'آنچه پیش از افزودن این حساب خرج شده و هنوز پرداخت نشده')}
      <ShamsiDatePicker label="محاسبه از تاریخ" value={credit.startShamsi} onChange={setTerm('startShamsi')} />
      <p className="expense-form-hint">خرید از اعتبار را مثل هر هزینه با «پرداخت از» همین حساب ثبت کنید؛ تسویه‌ی بدهی و تبدیل به قسط از روی کارت اعتبار، دستی و با مبلغ‌های واقعی ثبت می‌شوند.</p>
    </div>
  );
}
