/**
 * IncomeForm.jsx — Modal form to record or edit an income
 *
 * An income in «فروش دارایی» can take what was sold out of a portfolio («کم کردن از پورتفو»: the
 * asset and its quantity) — a «sell» there at the income's tomans (PortfolioLinkFields, `soldFrom`).
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
import PortfolioLinkFields from '../../../shared/vault/PortfolioLinkFields.jsx';
import { isLinkComplete } from '../../../utils/portfolioLink.js';
import { newLinkTxId } from '../../../shared/vault/portfolioFunds.js';

/** The category whose incomes can be a sale from a portfolio */
const SALE_CATEGORY = 'asset_sale';

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
  const [dateShamsi, setDateShamsi] = useState(() => {
    const iso = editingIncome?.incomeDate || draft?.incomeDate;
    return iso ? gregorianToShamsi(`${iso}T00:00:00`) : getTodayShamsi();
  });
  const [notes, setNotes] = useState(source?.notes || '');
  const [submitError, setSubmitError] = useState('');
  // «فروش دارایی»: what was sold, out of a portfolio (null: not taken out)
  const [saleLink, setSaleLink] = useState(editingIncome?.soldFrom || null);
  const selling = category === SALE_CATEGORY && Boolean(saleLink);

  const amountNum = parseInputNumber(amount);
  // The Shamsi value is the single source of truth; the stored Gregorian date is derived from it
  // (empty while the user is still typing an incomplete date, which keeps submit disabled).
  const dateIso = shamsiToGregorian(dateShamsi);
  const isAmountValid = amountNum !== null && amountNum > 0;
  const isFormValid = Boolean(title.trim()) && isAmountValid && Boolean(dateIso) && !submitting
    && (!selling || isLinkComplete(saleLink));

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
        soldFrom: selling
          ? {
            portfolioId: saleLink.portfolioId,
            portfolioName: saleLink.portfolioName,
            assetId: saleLink.assetId,
            ...(saleLink.unit ? { unit: saleLink.unit } : {}),
            quantity: Number(saleLink.quantity),
            txId: editingIncome?.soldFrom?.portfolioId === saleLink.portfolioId ? editingIncome.soldFrom.txId : newLinkTxId(),
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
            options={categoryOptions}
            activeValue={category}
            onChange={setCategory}
            size="sm"
            className="income-category-picker"
          />
          <button type="button" className="category-picker-edit" onClick={() => setManaging(true)}>ویرایش و افزودن دسته</button>
        </div>
        {managing && <CategoryManagerModal kind="income" onClose={() => setManaging(false)} />}

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
        {category === SALE_CATEGORY && (
          <PortfolioLinkFields
            mode="sell"
            value={saleLink}
            onChange={setSaleLink}
            toman={amountNum || 0}
            own={editingIncome?.soldFrom || null}
          />
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
