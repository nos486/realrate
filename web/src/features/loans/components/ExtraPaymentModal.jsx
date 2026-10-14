/**
 * ExtraPaymentModal.jsx — Modal for registering lump-sum / extra payments on a loan
 *
 * Supports two reduction modes:
 * 1. reduce_amount: Keeps remaining term length, reduces monthly installment amounts
 * 2. reduce_term: Keeps monthly installment amount, shortens total repayment period
 *
 * Laid out as an entry form (shared/form/, docs/en/DESIGN.md «Entry forms»): the amount first and
 * large (in words under it), the day paid («امروز»/«دیروز»/«روز دیگر»), the reduction mode as a
 * segmented choice with what it does under it, and the note under «جزئیات بیشتر».
 */

import { t, intlLocale } from '../../../utils/i18n.js';
import React, { useState } from 'react';
import { DollarSign, Sparkles, CheckCircle2 } from 'lucide-react';
import { AlertBanner, Button, FilterPills, Input, Modal } from '../../../shared/ui/index.js';
import { AmountField, DateField, EntryFormActions, MoreDetails } from '../../../shared/form/index.js';
import {
  getTodayShamsi,
  shamsiToGregorian,
} from '../../portfolio/components/ShamsiDatePicker.jsx';
import { todayIso } from '../../../shared/utils/dates.js';
import { BASE_CURRENCY } from '../../../utils/currencies.js';

const formatNum = (v) => Number(v || 0).toLocaleString(intlLocale());

/** The reduction modes, and what each does to the remaining installments */
const REDUCTION_MODES = [
  {
    value: 'reduce_amount',
    label: t('کاهش مبلغ اقساط'),
    hint: t('تعداد اقساط باقیمانده بدون تغییر می‌ماند، ولی مبلغ پرداختی هر قسط سبک‌تر و کمتر می‌شود.'),
  },
  {
    value: 'reduce_term',
    label: t('کاهش تعداد اقساط'),
    hint: t('مبلغ هر قسط ثابت می‌ماند، ولی مدت زمان وام کوتاه‌تر شده و وام زودتر تسویه می‌شود.'),
  },
];

/**
 * @param {{ isOpen: boolean, onClose: () => void, loan: object|null,
 *   onSubmit: (payment: { amount: number, paymentDate: string, reductionMode: string, notes: string }) => Promise<object|void>,
 *   submitting?: boolean }} props
 */
export default function ExtraPaymentModal({
  isOpen,
  onClose,
  loan,
  onSubmit,
  submitting = false,
}) {
  const [amount, setAmount] = useState('');
  const [paymentDateShamsi, setPaymentDateShamsi] = useState(getTodayShamsi());
  const [paymentDateIso, setPaymentDateIso] = useState(todayIso());
  const [reductionMode, setReductionMode] = useState('reduce_amount');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [payoffSuccessInfo, setPayoffSuccessInfo] = useState(null);

  const remainingBalance = Number(loan?.remainingBalance ?? loan?.principalAmount ?? 0);

  const cleanAmount = Number(String(amount || '').replace(/,/g, '').trim()) || 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setPayoffSuccessInfo(null);

    if (cleanAmount <= 0) {
      setFormError(t('لطفاً مبلغ معتبری برای پرداخت اضافه وارد نمایید.'));
      return;
    }

    try {
      const res = await onSubmit?.({
        amount: cleanAmount,
        paymentDate: paymentDateIso || todayIso(),
        reductionMode,
        notes: notes.trim(),
      });

      if (res?.fullyPaidOff) {
        setPayoffSuccessInfo(res);
      } else {
        onClose();
      }
    } catch (err) {
      setFormError(err.message || t('خطا در ثبت پرداخت اضافه'));
    }
  };

  const handleClose = () => {
    setPayoffSuccessInfo(null);
    setAmount('');
    setNotes('');
    setFormError('');
    onClose();
  };

  if (!isOpen) return null;

  // Fully Paid Off Celebration Screen
  if (payoffSuccessInfo) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={t('تبریک! وام تسویه شد')}
        subtitle={t('با این پرداخت مازاد، کل بدهی این وام تسویه گردید.')}
        icon={<Sparkles size={22} />}
        maxWidth="480px"
        footer={
          <div className="modal-actions">
            <Button block onClick={handleClose}>{t('متوجه شدم، مشاهده وام')}</Button>
          </div>
        }
      >
        <div className="loan-payoff-done">
          <span className="loan-payoff-done-icon"><CheckCircle2 size={36} /></span>
          <h3>{t('وام با موفقیت تسویه شد!')}</h3>
          <p>{t('تمام اقساط باقیمانده حذف شدند و مانده بدهی شما برای این وام به صفر رسید.')}</p>
        </div>
      </Modal>
    );
  }

  const mode = REDUCTION_MODES.find((m) => m.value === reductionMode) || REDUCTION_MODES[0];

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('پرداخت اضافه / یکجا')}
      subtitle={
        loan
          ? t('وام: {title} • مانده فعلی: {amount} تومان', { title: loan.title, amount: formatNum(remainingBalance) })
          : t('ثبت مبلغ مازاد برای کاهش اقساط یا مدت بازپرداخت')
      }
      icon={<DollarSign size={20} />}
      footer={
        <EntryFormActions
          submitLabel={t('ثبت پرداخت اضافه')}
          valid={cleanAmount > 0}
          submitting={submitting}
          onCancel={handleClose}
          onNext={null}
        />
      }
      onSubmit={handleSubmit}
      maxWidth="520px"
    >
      <div className="entry-form-body extra-payment-form">
        {formError && <AlertBanner type="error" message={formError} />}

        <AmountField
          id="extra-payment-amount"
          label={t('مبلغ پرداخت')}
          value={amount}
          onValueChange={setAmount}
          currency={BASE_CURRENCY}
          placeholder={t('مثلاً ۲۰,۰۰۰,۰۰۰')}
          autoFocus
        >
          {cleanAmount > 0 && remainingBalance > 0 && cleanAmount >= remainingBalance && (
            <p className="loan-form-payoff-hint">{t('✓ این مبلغ کل مانده را تسویه خواهد کرد.')}</p>
          )}
        </AmountField>

        <DateField
          label={t('تاریخ واریز وجه *')}
          value={paymentDateShamsi}
          onChange={(val) => {
            setPaymentDateShamsi(val);
            const iso = shamsiToGregorian(val);
            if (iso) setPaymentDateIso(iso);
          }}
        />

        <div className="ui-input-group">
          <span className="ui-input-label">{t('نحوه اعمال بر اقساط باقیمانده')}</span>
          <FilterPills
            variant="segmented"
            size="sm"
            options={REDUCTION_MODES}
            activeValue={reductionMode}
            onChange={setReductionMode}
          />
          <p className="expense-form-hint">{mode.hint}</p>
        </div>

        <MoreDetails filled={notes.trim() ? [t('یادداشت')] : []}>
          <Input
            id="extra-payment-notes"
            label={t('توضیحات یا منبع واریزی')}
            placeholder={t('مثلاً: پاداش، فروش طلا، تسویه پیش از موعد...')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </MoreDetails>
      </div>
    </Modal>
  );
}
