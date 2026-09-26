/**
 * ExtraPaymentModal.jsx — Modal for registering lump-sum / extra payments on a loan
 *
 * Supports two reduction modes:
 * 1. reduce_amount: Keeps remaining term length, reduces monthly installment amounts
 * 2. reduce_term: Keeps monthly installment amount, shortens total repayment period
 */

import React, { useState } from 'react';
import { DollarSign, AlertCircle, Sparkles, CheckCircle2, TrendingDown, Clock } from 'lucide-react';
import Modal from '../../../shared/ui/Modal.jsx';
import NumericInput from '../../../shared/ui/NumericInput.jsx';
import ShamsiDatePicker, {
  getTodayShamsi,
  shamsiToGregorian,
} from '../../portfolio/components/ShamsiDatePicker.jsx';
import { todayIso } from '../../../shared/utils/dates.js';

const formatNum = (v) => Number(v || 0).toLocaleString('fa-IR');

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
      setFormError('لطفاً مبلغ معتبری برای پرداخت اضافه وارد نمایید.');
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
      setFormError(err.message || 'خطا در ثبت پرداخت اضافه');
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
        title="تبریک! وام تسویه شد"
        subtitle="با این پرداخت مازاد، کل بدهی این وام تسویه گردید."
        icon={<Sparkles size={22} className="text-emerald-400" />}
        maxWidth="480px"
        footer={
          <div className="modal-actions" style={{ width: '100%' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={handleClose}
              style={{ width: '100%' }}
            >
              متوجه شدم، مشاهده وام
            </button>
          </div>
        }
      >
        <div style={{ textAlign: 'center', padding: '24px 10px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.15)',
            color: 'var(--color-positive-text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
          }}>
            <CheckCircle2 size={36} />
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
            وام با موفقیت تسویه شد!
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, maxWidth: '360px', margin: '0 auto' }}>
            تمام اقساط باقیمانده حذف شدند و مانده بدهی شما برای این وام به صفر رسید.
          </p>
        </div>
      </Modal>
    );
  }

  const footerActions = (
    <div className="modal-actions">
      <button
        type="button"
        className="btn-cancel"
        onClick={handleClose}
        disabled={submitting}
      >
        انصراف
      </button>
      <button
        type="submit"
        className="btn-primary"
        disabled={submitting || cleanAmount <= 0}
        style={{ minWidth: '130px' }}
      >
        {submitting ? 'در حال ثبت...' : 'ثبت پرداخت اضافه'}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="پرداخت اضافه / یکجا"
      subtitle={
        loan
          ? `وام: ${loan.title} • مانده فعلی: ${formatNum(remainingBalance)} تومان`
          : 'ثبت مبلغ مازاد برای کاهش اقساط یا مدت بازپرداخت'
      }
      icon={<DollarSign size={20} className="text-amber-500" />}
      footer={footerActions}
      onSubmit={handleSubmit}
      maxWidth="520px"
    >
      <div className="extra-payment-form" style={{ padding: '4px 0' }}>
        {formError && (
          <div className="form-error-banner" style={{
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '10px',
            padding: '10px 14px',
            color: 'var(--color-negative-text)',
            fontSize: '0.85rem',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <AlertCircle size={16} />
            <span>{formError}</span>
          </div>
        )}

        {/* Row 1: Amount */}
        <div className="form-item" style={{ marginBottom: '14px' }}>
          <label className="ui-input-label" style={{ display: 'block', marginBottom: '6px' }}>
            مبلغ پرداخت مازاد (تومان) *
          </label>
          <NumericInput
            value={amount}
            onValueChange={(val) => setAmount(val)}
            placeholder="مثلاً: ۲۰,۰۰۰,۰۰۰"
            affix="تومان"
            className="form-input"
            required
          />
          {cleanAmount > 0 && remainingBalance > 0 && cleanAmount >= remainingBalance && (
            <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--color-positive-text)', marginTop: '6px', fontWeight: 600 }}>
              ✓ این مبلغ کل مانده را تسویه خواهد کرد.
            </span>
          )}
        </div>

        {/* Row 2: Date */}
        <div style={{ marginBottom: '16px' }}>
          <ShamsiDatePicker
            label="تاریخ واریز وجه *"
            value={paymentDateShamsi}
            onChange={(val) => {
              setPaymentDateShamsi(val);
              const iso = shamsiToGregorian(val);
              if (iso) setPaymentDateIso(iso);
            }}
            onChangeIso={(iso) => setPaymentDateIso(iso)}
          />
        </div>

        {/* Row 3: Reduction Mode Selection */}
        <div className="form-item" style={{ marginBottom: '16px' }}>
          <label className="ui-input-label" style={{ display: 'block', marginBottom: '8px' }}>
            نحوه اعمال بر اقساط باقیمانده:
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Mode 1: reduce_amount */}
            <label style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '12px 14px',
              borderRadius: '10px',
              background: reductionMode === 'reduce_amount' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255, 255, 255, 0.03)',
              border: reductionMode === 'reduce_amount' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}>
              <input
                type="radio"
                name="reductionMode"
                value="reduce_amount"
                checked={reductionMode === 'reduce_amount'}
                onChange={() => setReductionMode('reduce_amount')}
                style={{ marginTop: '3px', accentColor: 'var(--color-warning)', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <strong style={{ fontSize: '0.88rem', color: reductionMode === 'reduce_amount' ? 'var(--color-warning-text)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <TrendingDown size={15} />
                  کاهش مبلغ اقساط باقیمانده
                </strong>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  تعداد اقساط باقیمانده بدون تغییر می‌ماند، ولی مبلغ پرداختی هر قسط سبک‌تر و کمتر می‌شود.
                </span>
              </div>
            </label>

            {/* Mode 2: reduce_term */}
            <label style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '12px 14px',
              borderRadius: '10px',
              background: reductionMode === 'reduce_term' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255, 255, 255, 0.03)',
              border: reductionMode === 'reduce_term' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}>
              <input
                type="radio"
                name="reductionMode"
                value="reduce_term"
                checked={reductionMode === 'reduce_term'}
                onChange={() => setReductionMode('reduce_term')}
                style={{ marginTop: '3px', accentColor: 'var(--color-warning)', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <strong style={{ fontSize: '0.88rem', color: reductionMode === 'reduce_term' ? 'var(--color-warning-text)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={15} />
                  کاهش تعداد اقساط (مبلغ هر قسط ثابت بمونه)
                </strong>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  مبلغ هر قسط ثابت می‌ماند، ولی مدت زمان وام کوتاه‌تر شده و وام زودتر تسویه می‌شود.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Row 4: Notes */}
        <div className="form-item">
          <label className="ui-input-label" style={{ display: 'block', marginBottom: '6px' }}>
            توضیحات یا منبع واریزی (اختیاری)
          </label>
          <input
            type="text"
            className="form-input"
            placeholder="مثلاً: پاداش، فروش طلا، تسویه پیش از موعد..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
      </div>
    </Modal>
  );
}
