/**
 * IncomeForm.jsx — Modal form to record or edit an income
 *
 * An income's category may link it to a record (utils/categoryLinks.js), picked right under the
 * category (CategoryLinkField): «فروش دارایی» what was sold out of a portfolio («کم کردن از
 * پورتفو»: the asset and its quantity — a «sell» there at the income's tomans, `soldFrom`),
 * «تسویه بدهی اعتباری» the bank credit whose debt it pays (`creditAccountId`, utils/creditAccount.js),
 * «وصول چک» the received cheque it cashed (`chequeId`: saving clears the cheque,
 * shared/vault/recordLinks.js). A choice fills in what it knows (title, amount).
 * A new income in «مدیریت نقدینگی» offers to record it as a transfer between the user's accounts
 * instead (`onCashMove`, CashMoveNotice).
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
import { categoryLinkOf } from '../../../utils/categoryLinks.js';
import { isLinkComplete } from '../../../utils/portfolioLink.js';
import { newLinkTxId } from '../../../shared/vault/portfolioFunds.js';
import CashMoveNotice from '../../accounts/components/CashMoveNotice.jsx';
import { CASH_MANAGEMENT_CATEGORY } from '../../../utils/categoryDocument.js';

export default function IncomeForm({
  onClose,
  onSubmit,
  editingIncome = null,
  submitting = false,
  // A new income filled in from elsewhere (a bank SMS deposit): { title, amount, incomeDate, notes }
  draft = null,
  // «مدیریت نقدینگی»: record it as a transfer instead — called with { amount, date, notes }
  onCashMove = null,
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
  // The record its category links it to (categoryLinks.js), as the income stores it
  const link = categoryLinkOf('income', category);
  const [linkValue, setLinkValue] = useState(() => linkValueOf('income', source?.category, source));
  const changeCategory = (next) => {
    setCategory(next);
    setLinkValue(linkValueOf('income', next, source));
  };
  // «فروش دارایی»: what was sold, out of a portfolio (none: not taken out)
  const selling = link?.target === 'portfolio' && Boolean(linkValue);
  // «تسویه بدهی اعتباری»: the credit it pays is required
  const settling = link?.target === 'credit_account';
  const fill = (fields) => {
    if (editingIncome) return;
    if (fields.title && !title.trim()) setTitle(fields.title);
    if (fields.amount) setAmount(String(fields.amount));
  };

  const amountNum = parseInputNumber(amount);
  // The Shamsi value is the single source of truth; the stored Gregorian date is derived from it
  // (empty while the user is still typing an incomplete date, which keeps submit disabled).
  const dateIso = shamsiToGregorian(dateShamsi);
  const isAmountValid = amountNum !== null && amountNum > 0;
  const isFormValid = Boolean(title.trim()) && isAmountValid && Boolean(dateIso) && !submitting
    && (!selling || isLinkComplete(linkValue))
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
        incomeDate: dateIso,
        notes: notes.trim(),
        // Only its category's link (the store drops the others too)
        creditAccountId: settling ? linkValue : '',
        chequeId: link?.target === 'cheque' ? linkValue || '' : '',
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
            toman={amountNum || 0}
            own={editingIncome?.soldFrom || null}
          />
        )}

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
        {!editingIncome && onCashMove && category === CASH_MANAGEMENT_CATEGORY && (
          <CashMoveNotice onMove={() => onCashMove({ amount: amountNum || 0, date: dateIso || '', notes: notes.trim() || title.trim() })} />
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
