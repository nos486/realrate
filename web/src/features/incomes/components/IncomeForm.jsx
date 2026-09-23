/**
 * IncomeForm.jsx — Modal form to record or edit an income
 *
 * Mounted only while open (keyed by the edited income), so its state is initialized straight
 * from props instead of being reset in an effect.
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
import { INCOME_CATEGORIES, DEFAULT_INCOME_CATEGORY } from '../constants/incomeCategories.js';

const CATEGORY_OPTIONS = INCOME_CATEGORIES.map(({ value, label, Icon }) => ({
  value,
  label,
  icon: <Icon size={14} strokeWidth={2} />,
}));

export default function IncomeForm({
  onClose,
  onSubmit,
  editingIncome = null,
  submitting = false,
}) {
  const [title, setTitle] = useState(editingIncome?.title || '');
  const [category, setCategory] = useState(editingIncome?.category || DEFAULT_INCOME_CATEGORY);
  const [amount, setAmount] = useState(editingIncome ? String(editingIncome.amount) : '');
  const [dateShamsi, setDateShamsi] = useState(() =>
    editingIncome ? gregorianToShamsi(`${editingIncome.incomeDate}T00:00:00`) : getTodayShamsi()
  );
  const [notes, setNotes] = useState(editingIncome?.notes || '');
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
      await onSubmit({
        title: title.trim(),
        category,
        amount: amountNum,
        incomeDate: dateIso,
        notes: notes.trim(),
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
      subtitle="مبالغ به تومان ثبت می‌شوند"
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
