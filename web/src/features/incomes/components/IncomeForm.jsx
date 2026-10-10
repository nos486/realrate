/**
 * IncomeForm.jsx — Modal form to record or edit an income, in tomans or a foreign currency (dollar,
 * euro, lira, dirham: utils/currencies.js). A foreign income is tomans at its currency's rate on
 * its day, from the price history — shown here (DayRateHint), never typed or stored. A bank
 * credit and a cheque are in tomans: «تسویه بدهی اعتباری» and «دریافت با چک» are for a toman
 * income only.
 *
 * An income's category may link it to a record (utils/categoryLinks.js), picked right under the
 * category (CategoryLinkField): «فروش دارایی» what was sold out of a portfolio («کم کردن از
 * پورتفو»: the asset and its quantity — a «sell» there at the income's tomans, `soldFrom`),
 * «تسویه بدهی اعتباری» the bank credit whose debt it pays (`creditAccountId`, utils/creditAccount.js).
 * A choice fills in what it knows (title, amount).
 * «دریافت با چک»: an income of any category may come with one of the user's received cheques
 * (`chequeId`: saving clears the cheque, shared/vault/recordLinks.js).
 *
 * Mounted only while open (keyed by what it edits), so its state is initialized straight from
 * props instead of being reset in an effect.
 */

import React, { useState } from 'react';
import { Wallet } from 'lucide-react';
import { AlertBanner, Button, FilterPills, Input, Modal, NumericInput } from '../../../shared/ui/index.js';
import ShamsiDatePicker, {
  getTodayShamsi,
  gregorianToShamsi,
  shamsiToGregorian,
} from '../../portfolio/components/ShamsiDatePicker.jsx';
import { parseInputNumber } from '../../portfolio/utils/holdingHelpers.js';
import { DEFAULT_INCOME_CATEGORY } from '../constants/incomeCategories.js';
import { useCategories } from '../../../shared/categories/useCategories.js';
import CategoryManagerModal from '../../../shared/categories/CategoryManagerModal.jsx';
import CategoryLinkField from '../../../shared/links/CategoryLinkField.jsx';
import { linkValueOf } from '../../../shared/links/linkValues.js';
import ChequeLinkPicker from '../../cheques/components/ChequeLinkPicker.jsx';
import { categoryLinkOf } from '../../../utils/categoryLinks.js';
import { isLinkComplete } from '../../../utils/portfolioLink.js';
import { newLinkTxId } from '../../../shared/vault/portfolioFunds.js';
import { CURRENCIES, allowsDecimals, currencyLabel, currencyRateToday, isForeignCurrency, normalizeCurrency } from '../../../utils/currencies.js';
import { usePricing } from '../../market/context/PricingContext.jsx';
import { useFxRates } from '../../market/useFxRates.js';
import { useDayRate } from '../../../shared/currency/useDayRate.js';
import DayRateHint from '../../../shared/currency/DayRateHint.jsx';

const CURRENCY_OPTIONS = CURRENCIES.map(({ code, label }) => ({ value: code, label }));

export default function IncomeForm({
  onClose,
  onSubmit,
  editingIncome = null,
  submitting = false,
  // A new income filled in from elsewhere (a bank SMS deposit): { title, amount, incomeDate, notes }
  draft = null,
}) {
  const source = editingIncome || draft;
  const [title, setTitle] = useState(source?.title || '');
  const [category, setCategory] = useState(source?.category || DEFAULT_INCOME_CATEGORY);
  const [managing, setManaging] = useState(false);
  // The user's categories (a hidden one only when this income already has it)
  const categoryOptions = useCategories('income', { keep: source?.category }).map(({ value, label, Icon }) => ({
    value,
    label,
    icon: <Icon size={14} strokeWidth={2} />,
  }));
  const [amount, setAmount] = useState(source ? String(source.amount) : '');
  const [currency, setCurrency] = useState(normalizeCurrency(source?.currency));
  const isForeign = isForeignCurrency(currency);
  const unit = currencyLabel(currency);
  const [dateShamsi, setDateShamsi] = useState(() => {
    const iso = editingIncome?.incomeDate || draft?.incomeDate;
    return iso ? gregorianToShamsi(`${iso}T00:00:00`) : getTodayShamsi();
  });
  const [notes, setNotes] = useState(source?.notes || '');
  const [submitError, setSubmitError] = useState('');
  // The record its category links it to (categoryLinks.js), as the income stores it — a bank
  // credit's only for a toman income
  const categoryLink = categoryLinkOf('income', category);
  const link = categoryLink?.target === 'credit_account' && isForeign ? null : categoryLink;
  const [linkValue, setLinkValue] = useState(() => linkValueOf('income', source?.category, source));
  const changeCategory = (next) => {
    setCategory(next);
    setLinkValue(linkValueOf('income', next, source));
  };
  // «فروش دارایی»: what was sold, out of a portfolio (none: not taken out)
  const selling = link?.target === 'portfolio' && Boolean(linkValue);
  // «تسویه بدهی اعتباری»: the credit it pays is required
  const settling = link?.target === 'credit_account';
  // «دریافت با چک»: the received cheque it came with (any category)
  const [withCheque, setWithCheque] = useState(Boolean(source?.chequeId));
  const [chequeId, setChequeId] = useState(source?.chequeId || '');
  const fill = (fields) => {
    if (editingIncome) return;
    if (fields.title && !title.trim()) setTitle(fields.title);
    if (fields.amount) setAmount(String(fields.amount));
  };

  const amountNum = parseInputNumber(amount);
  // The Shamsi value is the single source of truth; the stored Gregorian date is derived from it
  // (empty while the user is still typing an incomplete date, which keeps submit disabled).
  const dateIso = shamsiToGregorian(dateShamsi);
  // A foreign income: its currency's rate on its day (the price history), and the tomans it makes
  const pricing = usePricing();
  const fx = useFxRates(undefined, false);
  const todayRate = isForeign ? currencyRateToday(currency, { usdToman: Number(pricing?.getAssetPrice?.('usd')) || 0, ...fx }) : 0;
  const { rate: dayRate, state: rateState } = useDayRate(currency, dateIso, todayRate);
  const toman = isForeign ? (amountNum || 0) * (dayRate || todayRate) : amountNum || 0;
  const receivesCheque = withCheque && !isForeign;
  const isAmountValid = amountNum !== null && amountNum > 0;
  const isFormValid = Boolean(title.trim()) && isAmountValid && Boolean(dateIso) && !submitting
    && (!selling || isLinkComplete(linkValue))
    // A sale is priced at the day's rate: it must be known
    && (!selling || !isForeign || dayRate > 0)
    && (!settling || Boolean(linkValue));

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!isFormValid) return;

    setSubmitError('');
    try {
      await onSubmit({
        title: title.trim(),
        category,
        amount: amountNum,
        currency,
        incomeDate: dateIso,
        notes: notes.trim(),
        // Only its category's link (the store drops the others too)
        creditAccountId: settling ? linkValue : '',
        chequeId: receivesCheque ? chequeId : '',
        soldFrom: selling
          ? {
            portfolioId: linkValue.portfolioId,
            portfolioName: linkValue.portfolioName,
            assetId: linkValue.assetId,
            ...(linkValue.unit ? { unit: linkValue.unit } : {}),
            quantity: Number(linkValue.quantity),
            txId: editingIncome?.soldFrom?.portfolioId === linkValue.portfolioId ? editingIncome.soldFrom.txId : newLinkTxId(),
          }
          : null,
      });
      onClose();
    } catch (err) {
      setSubmitError(err.message || 'خطا در ذخیره درآمد');
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={editingIncome ? 'ویرایش درآمد' : 'ثبت درآمد جدید'}
      subtitle={isForeign ? `به ${unit}، با نرخ همان روز از تاریخچه‌ی قیمت` : 'به تومان'}
      icon={<Wallet size={18} />}
      maxWidth="540px"
      onSubmit={handleSubmit}
      footer={
        <div className="modal-actions">
          <Button variant="secondary" block disabled={submitting} onClick={onClose}>
            انصراف
          </Button>
          <Button type="submit" block loading={submitting} disabled={!isFormValid}>
            {editingIncome ? 'ذخیره تغییرات' : 'ثبت درآمد'}
          </Button>
        </div>
      }
    >
      <div className="income-form-body">
        {submitError && <AlertBanner type="error" message={submitError} />}

        <Input
          id="income-title"
          label="عنوان درآمد *"
          placeholder="مثلاً: حقوق مهرماه، پروژه طراحی سایت"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          autoFocus={!editingIncome}
          required
        />

        <div className="ui-input-group">
          <span className="ui-input-label">دسته‌بندی</span>
          <FilterPills
            options={categoryOptions}
            activeValue={category}
            onChange={changeCategory}
            size="sm"
            className="income-category-picker"
          />
          <button type="button" className="category-picker-edit" onClick={() => setManaging(true)}>ویرایش و افزودن دسته</button>
        </div>
        {managing && <CategoryManagerModal kind="income" onClose={() => setManaging(false)} />}

        {link && (
          <CategoryLinkField
            side="income"
            category={category}
            value={linkValue}
            onChange={setLinkValue}
            onFill={fill}
            recordId={editingIncome?.id || ''}
            toman={toman}
            own={editingIncome?.soldFrom || null}
          />
        )}

        <div className="ui-input-group">
          <span className="ui-input-label">ارز</span>
          <FilterPills options={CURRENCY_OPTIONS} activeValue={currency} onChange={setCurrency} size="sm" />
        </div>

        <div className="ui-input-group">
          <label htmlFor="income-amount" className="ui-input-label">مبلغ ({unit}) *</label>
          <div className="ui-input-wrapper">
            <NumericInput
              id="income-amount"
              value={amount}
              onValueChange={setAmount}
              allowDecimals={allowsDecimals(currency)}
              placeholder={isForeign ? 'مثلاً ۲۵۰۰' : 'مثلاً ۲۵,۰۰۰,۰۰۰'}
              className="ui-input-control"
              required
            />
          </div>
        </div>
        {isForeign && <DayRateHint unit={unit} rate={dayRate} state={rateState} toman={amountNum > 0 ? toman : 0} portfolio={selling} />}

        {!isForeign && (
          <div className="ui-input-group">
            <span className="ui-input-label">دریافت با</span>
            <FilterPills
              options={[{ value: 'other', label: 'واریز یا نقد' }, { value: 'cheque', label: 'چک' }]}
              activeValue={withCheque ? 'cheque' : 'other'}
              onChange={(v) => setWithCheque(v === 'cheque')}
              size="sm"
            />
          </div>
        )}
        {receivesCheque && (
          <ChequeLinkPicker side="income" value={chequeId} onChange={setChequeId} onFill={fill} recordId={editingIncome?.id || ''} />
        )}

        <ShamsiDatePicker
          label="تاریخ دریافت *"
          value={dateShamsi}
          onChange={setDateShamsi}
        />
        <Input
          id="income-notes"
          as="textarea"
          label="یادداشت (اختیاری)"
          placeholder="توضیحات تکمیلی، نام کارفرما، شماره فاکتور و..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          rows={2}
        />

      </div>
    </Modal>
  );
}
