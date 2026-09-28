/**
 * ExpenseForm.jsx — Modal to record or edit an expense, in tomans or dollars
 *
 * For a project section (`group`) the title is required. For everyday expenses (`daily`) a
 * category is picked instead and the title is optional (the category's name when left empty).
 * A dollar expense may carry the toman rate of its day; left empty, totals convert it at
 * today's rate. Mounted only while open, so its state starts from props.
 */

import React, { useState } from 'react';
import { Receipt, RefreshCw } from 'lucide-react';
import { AlertBanner, Button, FilterPills, Input, Modal, NumericInput } from '../../../shared/ui/index.js';
import ShamsiDatePicker, {
  getTodayShamsi,
  gregorianToShamsi,
  shamsiToGregorian,
} from '../../portfolio/components/ShamsiDatePicker.jsx';
import { parseInputNumber, formatNum } from '../../portfolio/utils/holdingHelpers.js';
import { EXPENSE_CURRENCIES, EXPENSE_LIMITS } from '../../../utils/expenseDocument.js';
import { EXPENSE_CATEGORIES, getExpenseCategory } from '../constants/expenseCategories.js';

const CURRENCY_OPTIONS = EXPENSE_CURRENCIES.map(({ value, label }) => ({ value, label }));
const CATEGORY_OPTIONS = EXPENSE_CATEGORIES.map(({ value, label, Icon }) => ({
  value,
  label,
  icon: <Icon size={14} strokeWidth={2} />,
}));

export default function ExpenseForm({ group = null, daily = false, expense = null, usdToman = 0, onSubmit, onClose, submitting = false }) {
  const [category, setCategory] = useState(expense?.category || 'groceries');
  // A daily expense titled after its category shows an empty title field (the default)
  const [title, setTitle] = useState(
    daily && expense?.title === getExpenseCategory(expense?.category).label ? '' : (expense?.title || ''));
  const [currency, setCurrency] = useState(expense?.currency || 'IRT');
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [usdRate, setUsdRate] = useState(expense?.usdRate ? String(expense.usdRate) : '');
  const [dateShamsi, setDateShamsi] = useState(() =>
    expense?.date ? gregorianToShamsi(`${expense.date}T00:00:00`) : getTodayShamsi());
  const [notes, setNotes] = useState(expense?.notes || '');
  const [submitError, setSubmitError] = useState('');

  const isUsd = currency === 'USD';
  const amountNum = parseInputNumber(amount);
  const rateNum = parseInputNumber(usdRate);
  const dateIso = shamsiToGregorian(dateShamsi);
  const isValid = (daily || Boolean(title.trim())) && amountNum > 0 && Boolean(dateIso) && (!usdRate || rateNum > 0) && !submitting;
  const tomanPreview = isUsd && amountNum > 0 ? amountNum * (rateNum || usdToman) : 0;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!isValid) return;
    setSubmitError('');
    try {
      await onSubmit({
        ...(group ? { groupId: group.id } : {}),
        ...(daily ? { category } : {}),
        title: title.trim() || getExpenseCategory(category).label,
        amount: amountNum,
        currency,
        usdRate: isUsd && rateNum > 0 ? rateNum : null,
        date: dateIso,
        notes: notes.trim(),
      });
      onClose();
    } catch (err) {
      setSubmitError(err.message || 'خطا در ذخیره هزینه');
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={expense ? 'ویرایش هزینه' : daily ? 'ثبت هزینه روزمره' : 'ثبت هزینه'}
      subtitle={daily ? 'در هزینه‌های روزمره' : `در بخش «${group.name}»`}
      icon={<Receipt size={18} />}
      maxWidth="520px"
      onSubmit={handleSubmit}
      footer={
        <div className="modal-actions">
          <Button variant="secondary" block disabled={submitting} onClick={onClose}>انصراف</Button>
          <Button type="submit" block loading={submitting} disabled={!isValid}>
            {expense ? 'ذخیره تغییرات' : 'ثبت هزینه'}
          </Button>
        </div>
      }
    >
      <div className="income-form-body">
        {submitError && <AlertBanner type="error" message={submitError} />}

        {daily && (
          <div className="ui-input-group">
            <span className="ui-input-label">دسته‌بندی</span>
            <FilterPills
              options={CATEGORY_OPTIONS}
              activeValue={category}
              onChange={setCategory}
              size="sm"
              className="income-category-picker"
            />
          </div>
        )}

        <Input
          id="expense-title"
          label={daily ? 'عنوان (اختیاری)' : 'عنوان هزینه *'}
          placeholder={daily ? `خالی: «${getExpenseCategory(category).label}»` : 'مثلاً: خرید کاشی، دستمزد نقاش'}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={EXPENSE_LIMITS.titleLength}
          autoFocus={!expense && !daily}
          required={!daily}
        />

        <div className="ui-input-group">
          <span className="ui-input-label">ارز</span>
          <FilterPills options={CURRENCY_OPTIONS} activeValue={currency} onChange={setCurrency} size="sm" />
        </div>

        <div className="ui-input-group">
          <label htmlFor="expense-amount" className="ui-input-label">مبلغ ({isUsd ? 'دلار' : 'تومان'}) *</label>
          <div className="ui-input-wrapper">
            <NumericInput
              id="expense-amount"
              value={amount}
              onValueChange={setAmount}
              allowDecimals={isUsd}
              placeholder={isUsd ? 'مثلاً ۲۵۰' : 'مثلاً ۱۵,۰۰۰,۰۰۰'}
              className="ui-input-control"
              required
            />
          </div>
        </div>

        {isUsd && (
          <div className="ui-input-group">
            <label htmlFor="expense-usd-rate" className="ui-input-label expense-rate-label">
              نرخ دلار در روز هزینه (تومان، اختیاری)
              {usdToman > 0 && (
                <button
                  type="button"
                  className="btn-fx-rate-refresh"
                  title="استفاده از نرخ امروز"
                  onClick={() => setUsdRate(String(Math.round(usdToman)))}
                >
                  <RefreshCw size={11} />
                </button>
              )}
            </label>
            <div className="ui-input-wrapper">
              <NumericInput
                id="expense-usd-rate"
                value={usdRate}
                onValueChange={setUsdRate}
                allowDecimals={false}
                placeholder={usdToman > 0 ? `خالی: نرخ امروز (${formatNum(usdToman)})` : 'نرخ هر دلار به تومان'}
                className="ui-input-control"
              />
            </div>
            {tomanPreview > 0 && (
              <p className="expense-form-hint">
                معادل حدود <strong>{formatNum(tomanPreview)}</strong> تومان
                {!rateNum && ' (به نرخ امروز)'}
              </p>
            )}
          </div>
        )}

        <ShamsiDatePicker label="تاریخ هزینه *" value={dateShamsi} onChange={setDateShamsi} />

        <Input
          id="expense-notes"
          as="textarea"
          label="یادداشت (اختیاری)"
          placeholder="فروشنده، شماره فاکتور، توضیحات..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={EXPENSE_LIMITS.notesLength}
          rows={2}
        />
      </div>
    </Modal>
  );
}
