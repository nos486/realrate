/**
 * IncomeForm.jsx — Modal form to record or edit an income, or a fixed (recurring) income
 *
 * With "درآمد ثابت" on, the entry becomes a rule that adds itself every period from the chosen
 * date on (the first one right away when that date has passed). `editingRule` edits such a rule.
 * Mounted only while open (keyed by what it edits), so its state is initialized straight from
 * props instead of being reset in an effect.
 */

import React, { useState } from 'react';
import { Wallet, Repeat } from 'lucide-react';
import { AlertBanner, Button, FilterPills, Input, Modal, NumericInput } from '../../../shared/ui/index.js';
import ShamsiDatePicker, {
  getTodayShamsi,
  gregorianToShamsi,
  shamsiToGregorian,
} from '../../portfolio/components/ShamsiDatePicker.jsx';
import { parseInputNumber } from '../../portfolio/utils/holdingHelpers.js';
import { INCOME_CATEGORIES, DEFAULT_INCOME_CATEGORY } from '../constants/incomeCategories.js';
import { RECURRING_INTERVALS } from '../../../utils/recurringIncome.js';

const INTERVAL_OPTIONS = RECURRING_INTERVALS.map(({ months, label }) => ({ value: String(months), label }));

const CATEGORY_OPTIONS = INCOME_CATEGORIES.map(({ value, label, Icon }) => ({
  value,
  label,
  icon: <Icon size={14} strokeWidth={2} />,
}));

export default function IncomeForm({
  onClose,
  onSubmit,
  onSubmitRecurring = null,
  editingIncome = null,
  editingRule = null,
  startRecurring = false,
  submitting = false,
}) {
  const source = editingRule || editingIncome;
  const [title, setTitle] = useState(source?.title || '');
  const [category, setCategory] = useState(source?.category || DEFAULT_INCOME_CATEGORY);
  const [amount, setAmount] = useState(source ? String(source.amount) : '');
  const [dateShamsi, setDateShamsi] = useState(() => {
    const iso = editingRule?.startDate || editingIncome?.incomeDate;
    return iso ? gregorianToShamsi(`${iso}T00:00:00`) : getTodayShamsi();
  });
  const [notes, setNotes] = useState(source?.notes || '');
  // A single entry can be turned into a fixed income only when it is new
  const canChooseRecurring = Boolean(onSubmitRecurring) && !editingIncome;
  const [recurring, setRecurring] = useState(Boolean(editingRule) || startRecurring);
  const [intervalMonths, setIntervalMonths] = useState(String(editingRule?.intervalMonths || 1));
  const [submitError, setSubmitError] = useState('');

  const amountNum = parseInputNumber(amount);
  // The Shamsi value is the single source of truth; the stored Gregorian date is derived from it
  // (empty while the user is still typing an incomplete date, which keeps submit disabled).
  const dateIso = shamsiToGregorian(dateShamsi);
  const isAmountValid = amountNum !== null && amountNum > 0;
  const isFormValid = Boolean(title.trim()) && isAmountValid && Boolean(dateIso) && !submitting;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!isFormValid) return;

    setSubmitError('');
    try {
      if (recurring) {
        await onSubmitRecurring({
          title: title.trim(),
          category,
          amount: amountNum,
          startDate: dateIso,
          intervalMonths: Number(intervalMonths),
          notes: notes.trim(),
        });
      } else {
        await onSubmit({
          title: title.trim(),
          category,
          amount: amountNum,
          incomeDate: dateIso,
          notes: notes.trim(),
        });
      }
      onClose();
    } catch (err) {
      setSubmitError(err.message || 'خطا در ذخیره درآمد');
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={editingRule ? 'ویرایش درآمد ثابت' : editingIncome ? 'ویرایش درآمد' : 'ثبت درآمد جدید'}
      subtitle={recurring ? 'هر دوره خودکار در لیست درآمدها ثبت می‌شود' : 'مبالغ به تومان ثبت می‌شوند'}
      icon={recurring ? <Repeat size={18} /> : <Wallet size={18} />}
      maxWidth="540px"
      onSubmit={handleSubmit}
      footer={
        <div className="modal-actions">
          <Button variant="secondary" block disabled={submitting} onClick={onClose}>
            انصراف
          </Button>
          <Button type="submit" block loading={submitting} disabled={!isFormValid}>
            {editingIncome || editingRule ? 'ذخیره تغییرات' : recurring ? 'ثبت درآمد ثابت' : 'ثبت درآمد'}
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
            options={CATEGORY_OPTIONS}
            activeValue={category}
            onChange={setCategory}
            size="sm"
            className="income-category-picker"
          />
        </div>

        <div className="ui-input-group">
          <label htmlFor="income-amount" className="ui-input-label">مبلغ (تومان) *</label>
          <div className="ui-input-wrapper">
            <NumericInput
              id="income-amount"
              value={amount}
              onValueChange={setAmount}
              placeholder="مثلاً ۲۵,۰۰۰,۰۰۰"
              className="ui-input-control"
              required
            />
          </div>
        </div>

        {canChooseRecurring && (
          <label className="income-recurring-toggle">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              disabled={Boolean(editingRule)}
            />
            <span>
              <strong>درآمد ثابت</strong>
              <small>مثل حقوق یا اجاره: هر دوره خودکار ثبت می‌شود و لازم نیست هر بار وارد کنید.</small>
            </span>
          </label>
        )}

        {recurring && (
          <div className="ui-input-group">
            <span className="ui-input-label">تکرار</span>
            <FilterPills options={INTERVAL_OPTIONS} activeValue={intervalMonths} onChange={setIntervalMonths} size="sm" />
          </div>
        )}

        <ShamsiDatePicker
          label={recurring ? 'تاریخ اولین دریافت *' : 'تاریخ دریافت *'}
          value={dateShamsi}
          onChange={setDateShamsi}
        />
        {recurring && (
          <p className="income-recurring-hint">
            روز همین تاریخ، روز دریافت در هر دوره است. دوره‌هایی که تا امروز گذشته‌اند هم ثبت می‌شوند.
          </p>
        )}

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
