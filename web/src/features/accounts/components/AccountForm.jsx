/**
 * AccountForm.jsx — Modal to add or edit a money account (bank account, bank credit, cash,
 * e-wallet, ...). A bank credit takes only its limit, the debt already owed when it is added and
 * the day to count from — no bank rules: settling it and turning it into installments are
 * recorded by hand from its card (utils/creditAccount.js). Any other account holds one or more
 * currencies (tomans, dollars, euros, lira, dirhams — utils/currencies.js; several, e.g. a Wise
 * account); forms then offer it only for records
 * in a currency it holds (accountsForCurrency).
 * Laid out with the entry forms' parts (shared/form/, docs/en/DESIGN.md «Entry forms»): the type
 * as icon tiles, the bank, the name, the currencies (or a credit's terms, its day as
 * «امروز»/«دیروز»/«روز دیگر»), and the card's digits, the account number and the notes under
 * «جزئیات بیشتر». A setup form: no «ثبت و بعدی».
 * Mounted only while open, so its state starts from props.
 */

import React, { useState } from 'react';
import { WalletCards } from 'lucide-react';
import { AlertBanner, Input, Modal, NumericInput } from '../../../shared/ui/index.js';
import { CategoryGrid, DateField, EntryFormActions, MoreDetails } from '../../../shared/form/index.js';
import { BankPicker } from '../../../shared/banks/index.js';
import { ACCOUNT_TYPES, ACCOUNT_LIMITS, accountCurrencies } from '../../../utils/accountDocument.js';
import { CURRENCIES } from '../../../utils/currencies.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { getTodayShamsi, gregorianToShamsi, shamsiToGregorian } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { cycleStartOf } from '../../../utils/creditAccount.js';
import { gregorianToJalali } from '../../../utils/loanCalculator.js';
import { getAccountTypeIcon } from '../constants/accountDisplay.js';
import { t } from '../../../utils/i18n.js';

/** The types as icon tiles (CategoryGrid) */
const TYPE_OPTIONS = ACCOUNT_TYPES.map(({ value, label }) => ({ value, label: t(label), Icon: getAccountTypeIcon(value) }));
const CURRENCY_OPTIONS = CURRENCIES.map(({ code, label }) => ({ value: code, label: t(label) }));
const digitsDecimal = (v) => String(v ?? '').replace(/,/g, ''); // i18n-ignore
const digits = (v) => String(v ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[^\d]/g, ''); // i18n-ignore

/** The Shamsi day of month of a Gregorian YYYY-MM-DD */
function shamsiDayOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return gregorianToJalali(y, m, d).jd;
}

/** A credit's terms as the form edits them (strings) */
function creditFields(credit) {
  return {
    limit: credit?.limit ? String(credit.limit) : '',
    openingDebt: credit?.openingDebt ? String(credit.openingDebt) : '',
    cycleDay: String(credit?.cycleDay || shamsiDayOf(credit?.startDate || todayIso())),
  };
}

/** The amounts the form edits (strings) for the currencies held: the balance now, else empty */
const balanceFields = (current) => Object.fromEntries(Object.entries(current || {}).map(([code, v]) => [code, String(Math.round(Number(v) * 100) / 100)]));

/**
 * @param {object} props
 * @param {object|null} [props.account] - the account edited (null: a new one)
 * @param {Record<string, number>} [props.currentBalance] - what the account holds now, per currency
 *   (its stated balance moved by the records): what the balance fields start from
 */
export default function AccountForm({ account = null, currentBalance = null, onSubmit, onClose, submitting = false }) {
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
  // «موجودی»: the money the account holds now, kept up to date by the records (utils/accountBalance.js)
  const [track, setTrack] = useState(Boolean(account?.balance));
  const [amounts, setAmounts] = useState(() => balanceFields(currentBalance || account?.balance?.amounts));
  // The day the amount is stated for: records from that day on move it, so an earlier day brings
  // in what was already recorded (a stated balance of today leaves out yesterday's records)
  const [balanceDay, setBalanceDay] = useState(() => (currentBalance || !account?.balance?.startDate ? getTodayShamsi() : gregorianToShamsi(`${account.balance.startDate}T00:00:00`)));
  const [submitError, setSubmitError] = useState('');
  const setTerm = (key) => (value) => setCredit((c) => ({ ...c, [key]: value }));

  const isCredit = type === 'credit';
  // A bank account and a bank credit both belong to a bank
  const isBank = type === 'bank' || isCredit;
  // An empty name falls back to the bank's
  const effectiveName = name.trim() || (isBank ? bank.lenderName : '');
  const limitNum = Number(digits(credit.limit)) || 0;
  const cycleDayNum = parseInt(digits(credit.cycleDay), 10) || 0;
  const isValid = Boolean(effectiveName) && !submitting
    && (!isCredit || (limitNum > 0 && cycleDayNum >= 1 && cycleDayNum <= 31));

  // What «جزئیات بیشتر» holds that is filled in (a bank's card and number only for a bank)
  const detailsFilled = [
    ...(isBank && cardLast4 ? [t('کارت')] : []),
    ...(isBank && accountNumber ? [t('شماره حساب')] : []),
    ...(notes.trim() ? [t('توضیحات')] : []),
  ];

  // The stated balance: kept as it is while the amounts shown are untouched, else stated anew from now
  const balanceToSave = () => {
    const stated = Object.fromEntries(currencies.map((c) => [c, Number(digitsDecimal(amounts[c])) || 0]));
    const before = currentBalance || account?.balance?.amounts || {};
    const startDate = shamsiToGregorian(balanceDay) || todayIso();
    // While the amounts and the day are untouched, the balance stays as it was stated
    const unchanged = account?.balance && startDate === (account.balance.startDate || startDate)
      && currencies.every((c) => Math.round((stated[c] || 0) * 100) === Math.round((Number(before[c]) || 0) * 100));
    if (unchanged) return account.balance;
    // A past day counts from its start, today from this moment (what was recorded earlier today is in the amount)
    return startDate < todayIso() ? { amounts: stated, startDate, startAt: `${startDate}T00:00:00.000Z` } : { amounts: stated };
  };

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
            cycleDay: cycleDayNum,
            // Counting starts on the first day of the period the day gives, kept while the day is unchanged
            startDate: account?.credit?.startDate && account.credit.cycleDay === cycleDayNum
              ? account.credit.startDate
              : cycleStartOf(cycleDayNum, todayIso()),
            // Its installment plans stay
            conversions: account?.credit?.conversions || [],
          },
        } : {}),
        ...(!isCredit && track ? { balance: balanceToSave() } : {}),
        archived: account?.archived || false,
      });
      onClose();
    } catch (err) {
      setSubmitError(err.message || t('خطا در ذخیره حساب'));
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={account ? t('ویرایش حساب') : t('حساب جدید')}
      subtitle={t('حساب بانکی، اعتبار بانکی، پول نقد یا کیف پول؛ برای مشخص کردن منبع هر هزینه')}
      icon={<WalletCards size={18} />}
      maxWidth="520px"
      onSubmit={handleSubmit}
      footer={
        <EntryFormActions submitLabel={account ? t('ذخیره تغییرات') : t('افزودن حساب')} valid={isValid} submitting={submitting} onCancel={onClose} />
      }
    >
      <div className="entry-form-body">
        {submitError && <AlertBanner type="error" message={submitError} />}

        <div className="account-type-field">
          <CategoryGrid kind="account" label={t('نوع')} options={TYPE_OPTIONS} value={type} onChange={setType} />
        </div>

        {isBank && <BankPicker id="account-bank" value={bank} onChange={setBank} label={t('بانک')} />}

        <Input
          id="account-name"
          label={isBank ? t('نام حساب (اختیاری)') : t('نام حساب *')}
          placeholder={isCredit ? t('مثلاً: اعتبار خرید') : isBank ? (bank.lenderName ? t('خالی: «{name}»', { name: bank.lenderName }) : t('مثلاً: حساب حقوق')) : t('مثلاً: کیف پول، صندوق خانه')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={ACCOUNT_LIMITS.nameLength}
          required={!isBank}
        />

        {isCredit ? (
          <CreditTermsFields credit={credit} setTerm={setTerm} />
        ) : (
          <div className="ui-input-group">
            <span className="ui-input-label" id="account-currencies-label">{t('ارزهای حساب')}</span>
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
            <p className="expense-form-hint">{t('حسابی که چند ارز دارد (مثلاً تومان و دلار) را یک‌بار ثبت کنید؛ در هر فرم فقط حساب‌هایی می‌آیند که ارز همان ثبت را دارند.')}</p>
          </div>
        )}

        {!isCredit && (
          <div className="ui-input-group balance-form-fields">
            <span className="ui-input-label" id="account-balance-label">{t('موجودی حساب')}</span>
            <div className="ui-filter-pills variant-pills size-sm" role="group" aria-labelledby="account-balance-label">
              <button type="button" className={`filter-pill-btn ${track ? 'active' : ''}`} aria-pressed={track} onClick={() => setTrack((v) => !v)}>
                <span className="pill-label">{t('نگه‌داشتن موجودی')}</span>
              </button>
            </div>
            {track && currencies.map((code) => (
              <div className="ui-input-group" key={code}>
                <label htmlFor={`account-balance-${code}`} className="ui-input-label">{t('موجودی فعلی ({currency})', { currency: CURRENCY_OPTIONS.find((o) => o.value === code)?.label || code })}</label>
                <div className="ui-input-wrapper">
                  <NumericInput
                    id={`account-balance-${code}`}
                    value={amounts[code] ?? ''}
                    allowDecimals={code !== 'IRT'}
                    onValueChange={(v) => setAmounts((a) => ({ ...a, [code]: v }))}
                    className="ui-input-control"
                  />
                </div>
              </div>
            ))}
            {track && <DateField label={t('تاریخ موجودی')} value={balanceDay} onChange={setBalanceDay} />}
            <p className="expense-form-hint">
              {track
                ? t('موجودی حساب را در «تاریخ موجودی» بنویسید؛ هزینه‌ها، درآمدها و انتقال‌های این حساب از همان روز به بعد آن را کم و زیاد می‌کنند. اگر پیش‌تر چیزی ثبت کرده‌اید، تاریخ را به قبل از آن‌ها ببرید. برای هماهنگ شدن با بانک، مقدار را دوباره بنویسید.')
                : t('با ثبت موجودی فعلی، موجودی این حساب خودکار با هر هزینه، درآمد و انتقال به‌روز می‌شود.')}
            </p>
          </div>
        )}

        <MoreDetails filled={detailsFilled}>
          {isBank && (
            <Input
              id="account-card"
              label={t('چهار رقم آخر کارت (اختیاری)')}
              placeholder={t('مثلاً ۱۲۳۴')}
              value={cardLast4}
              onChange={(e) => setCardLast4(e.target.value.replace(/[^\d۰-۹٠-٩]/g, '').slice(0, 4))} // i18n-ignore
              inputMode="numeric"
              maxLength={4}
            />
          )}

          {isBank && (
            <Input
              id="account-number"
              label={t('شماره حساب (اختیاری)')}
              placeholder={t('برای تشخیص خودکار پیامک‌های بانک')}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/[^\d۰-۹٠-٩]/g, '').slice(0, 26))} // i18n-ignore
              inputMode="numeric"
              dir="ltr"
              maxLength={26}
            />
          )}

          <Input
            id="account-notes"
            as="textarea"
            label={t('توضیحات (اختیاری)')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={ACCOUNT_LIMITS.notesLength}
            rows={2}
          />
        </MoreDetails>
      </div>
    </Modal>
  );
}

/** A credit's terms: its limit, the debt already owed, and the day of the month its period starts */
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
      {numberField('credit-limit', 'limit', t('سقف اعتبار (تومان) *'))}
      {numberField('credit-opening', 'openingDebt', t('بدهی فعلی هنگام ثبت (تومان، اختیاری)'), t('آنچه پیش از افزودن این حساب خرج شده و هنوز پرداخت نشده'))}
      {numberField('credit-cycle-day', 'cycleDay', t('روز شروع دوره‌ی هر ماه (روز چندم ماه شمسی) *'), t('بدهی و «هزینه‌ها و انتقال این دوره» از این روز حساب می‌شوند؛ «بدهی فعلی» همان بدهی در شروع همین دوره است'))}
      <p className="expense-form-hint">{t('خرید از اعتبار را مثل هر هزینه با «پرداخت از» همین حساب ثبت کنید؛ تسویه‌ی بدهی و تبدیل به قسط از روی کارت اعتبار، دستی و با مبلغ‌های واقعی ثبت می‌شوند.')}</p>
    </div>
  );
}
