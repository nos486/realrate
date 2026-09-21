/**
 * AddLoanForm.jsx — Modal Form for Creating and Editing Loans
 *
 * Includes:
 * - Live PMT calculation preview using calculateFixedInstallmentAmount
 * - ShamsiDatePicker integrated with ISO date synchronization
 * - Rebuild alert for paid vs pending installments in edit mode
 * - Clean NumericInput integration with Persian digits formatting
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Landmark, AlertCircle, Calculator, CheckCircle2 } from 'lucide-react';
import Modal from '../../../shared/ui/Modal.jsx';
import Input from '../../../shared/ui/Input.jsx';
import NumericInput from '../../../shared/ui/NumericInput.jsx';
import ShamsiDatePicker, {
  getTodayShamsi,
  gregorianToShamsi,
  shamsiToGregorian,
} from '../../portfolio/components/ShamsiDatePicker.jsx';
import { calculateFixedInstallmentAmount } from '../../../utils/loanCalculator.js';

const formatPersianNum = (val) => Number(val || 0).toLocaleString('fa-IR');

export default function AddLoanForm({
  isOpen,
  onClose,
  onSubmit,
  editingLoan = null,
  submitting = false,
}) {
  const [title, setTitle] = useState('');
  const [lenderName, setLenderName] = useState('');
  const [principalAmount, setPrincipalAmount] = useState('');
  const [annualInterestRate, setAnnualInterestRate] = useState('23');
  const [installmentCount, setInstallmentCount] = useState('12');
  const [intervalMonths, setIntervalMonths] = useState(1);
  const [startDateIso, setStartDateIso] = useState(new Date().toISOString().split('T')[0]);
  const [startDateShamsi, setStartDateShamsi] = useState(getTodayShamsi());
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  // Custom first installment amount states (فاز C)
  const [hasCustomFirstInstallment, setHasCustomFirstInstallment] = useState(false);
  const [firstInstallmentAmount, setFirstInstallmentAmount] = useState('');

  // Populate or reset form whenever modal opens or editingLoan changes
  useEffect(() => {
    if (!isOpen) return;

    setFormError('');
    setHasCustomFirstInstallment(false);
    setFirstInstallmentAmount('');

    if (editingLoan) {
      setTitle(editingLoan.title || '');
      setLenderName(editingLoan.lenderName || editingLoan.lender_name || '');
      setPrincipalAmount(
        editingLoan.principalAmount ? String(editingLoan.principalAmount) : ''
      );
      setAnnualInterestRate(
        editingLoan.annualInterestRate !== undefined
          ? String(editingLoan.annualInterestRate)
          : '0'
      );
      setInstallmentCount(
        editingLoan.installmentCount ? String(editingLoan.installmentCount) : '12'
      );
      setIntervalMonths(editingLoan.intervalMonths || 1);

      const rawStart =
        editingLoan.startDate || editingLoan.start_date || new Date().toISOString().split('T')[0];
      setStartDateIso(rawStart);
      setStartDateShamsi(gregorianToShamsi(rawStart));
      setNotes(editingLoan.notes || '');
    } else {
      setTitle('');
      setLenderName('');
      setPrincipalAmount('');
      setAnnualInterestRate('23');
      setInstallmentCount('12');
      setIntervalMonths(1);

      const todayIso = new Date().toISOString().split('T')[0];
      setStartDateIso(todayIso);
      setStartDateShamsi(getTodayShamsi());
      setNotes('');
    }
  }, [isOpen, editingLoan]);

  // Clean numeric values for calculations
  const cleanPrincipal = useMemo(() => {
    const s = String(principalAmount || '').replace(/,/g, '').trim();
    return Number(s) || 0;
  }, [principalAmount]);

  const cleanRate = useMemo(() => {
    const s = String(annualInterestRate || '').replace(/,/g, '').trim();
    return Number(s) || 0;
  }, [annualInterestRate]);

  const cleanCount = useMemo(() => {
    const s = String(installmentCount || '').replace(/,/g, '').trim();
    return parseInt(s, 10) || 0;
  }, [installmentCount]);

  // Live calculation of fixed periodic payment (PMT)
  const liveInstallment = useMemo(() => {
    if (cleanPrincipal <= 0 || cleanCount <= 0) return 0;
    return calculateFixedInstallmentAmount({
      principal: cleanPrincipal,
      annualRatePct: cleanRate,
      installmentCount: cleanCount,
      intervalMonths,
    });
  }, [cleanPrincipal, cleanRate, cleanCount, intervalMonths]);

  const liveTotalRepayment = useMemo(() => {
    if (liveInstallment <= 0 || cleanCount <= 0) return 0;
    return liveInstallment * cleanCount;
  }, [liveInstallment, cleanCount]);

  const liveTotalInterest = useMemo(() => {
    if (liveTotalRepayment <= 0 || cleanPrincipal <= 0) return 0;
    return Math.max(0, liveTotalRepayment - cleanPrincipal);
  }, [liveTotalRepayment, cleanPrincipal]);

  // Check if financial parameters were altered in edit mode
  const isFinancialTermsChanged = useMemo(() => {
    if (!editingLoan) return false;
    const origP = Number(editingLoan.principalAmount ?? editingLoan.principal_amount ?? 0);
    const origRate = Number(editingLoan.annualInterestRate ?? editingLoan.annual_interest_rate ?? 0);
    const origCount = parseInt(editingLoan.installmentCount ?? editingLoan.installment_count ?? 0, 10);
    return cleanPrincipal !== origP || cleanRate !== origRate || cleanCount !== origCount;
  }, [editingLoan, cleanPrincipal, cleanRate, cleanCount]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!title.trim()) {
      setFormError('لطفاً عنوان یا نام وام را وارد نمایید.');
      return;
    }
    if (cleanPrincipal <= 0) {
      setFormError('مبلغ اصل وام باید مقداری بزرگتر از صفر باشد.');
      return;
    }
    if (cleanCount <= 0) {
      setFormError('تعداد اقساط باید حداقل ۱ قسط باشد.');
      return;
    }

    const cleanFirstInst = hasCustomFirstInstallment
      ? Number(String(firstInstallmentAmount || '').replace(/,/g, '').trim())
      : null;

    if (hasCustomFirstInstallment && (!cleanFirstInst || cleanFirstInst <= 0)) {
      setFormError('لطفاً مبلغ معتبر برای قسط اول وارد نمایید.');
      return;
    }

    try {
      await onSubmit?.({
        title: title.trim(),
        lenderName: lenderName.trim(),
        principalAmount: cleanPrincipal,
        annualInterestRate: cleanRate,
        installmentCount: cleanCount,
        intervalMonths,
        startDate: startDateIso || new Date().toISOString().split('T')[0],
        notes: notes.trim(),
        customFirstInstallmentAmount: cleanFirstInst,
      });
      onClose();
    } catch (err) {
      setFormError(err.message || 'خطا در ذخیره اطلاعات وام');
    }
  };

  const footerActions = (
    <div style={{ display: 'flex', gap: '10px', width: '100%', justifyContent: 'flex-end' }}>
      <button
        type="button"
        className="btn-cancel"
        onClick={onClose}
        disabled={submitting}
      >
        انصراف
      </button>
      <button
        type="submit"
        className="btn-submit"
        disabled={submitting || cleanPrincipal <= 0 || cleanCount <= 0}
        style={{ minWidth: '130px' }}
      >
        {submitting ? (
          'در حال ذخیره...'
        ) : editingLoan ? (
          'به‌روزرسانی وام'
        ) : (
          'افزودن و ساخت اقساط'
        )}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingLoan ? 'ویرایش اطلاعات وام' : 'افزودن وام جدید'}
      subtitle={
        editingLoan
          ? 'تغییر عنوان، شرایط مالی و بازسازی خودکار اقساط معوق'
          : 'مشخصات وام را وارد کنید تا جدول استهلاک و اقساط به صورت خودکار ایجاد شود'
      }
      icon={<Landmark size={20} className="text-amber-500" />}
      footer={footerActions}
      onSubmit={handleSubmit}
      maxWidth="560px"
    >
      <div className="add-holding-form" style={{ padding: '4px 0' }}>
        {formError && (
          <div className="form-error-banner" style={{
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '10px',
            padding: '10px 14px',
            color: '#f87171',
            fontSize: '0.85rem',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={16} />
            <span>{formError}</span>
          </div>
        )}

        {/* Edit mode financial alteration alert */}
        {isFinancialTermsChanged && (
          <div style={{
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: '10px',
            padding: '11px 14px',
            color: '#fbbf24',
            fontSize: '0.85rem',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            lineHeight: 1.5,
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>توجه به تغییر شرایط مالی:</strong>
              <p style={{ margin: '2px 0 0 0', opacity: 0.95 }}>
                اقساط پرداخت‌شده دست‌نخورده می‌مونن، فقط اقساط باقیمانده بازمحاسبه می‌شن.
              </p>
            </div>
          </div>
        )}

        {/* Row 1: Title & Lender Name */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '14px' }}>
          <Input
            label="نام یا عنوان وام *"
            placeholder="مثلاً: وام مسکن، خرید خودرو"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <Input
            label="نام وام‌دهنده / بانک (اختیاری)"
            placeholder="مثلاً: بانک مسکن، بانک رسالت"
            value={lenderName}
            onChange={(e) => setLenderName(e.target.value)}
          />
        </div>

        {/* Row 2: Principal Amount */}
        <div className="form-item" style={{ marginBottom: '14px' }}>
          <label className="ui-input-label" style={{ display: 'block', marginBottom: '6px' }}>
            مبلغ اصل وام (تومان) *
          </label>
          <NumericInput
            value={principalAmount}
            onValueChange={(val) => setPrincipalAmount(val)}
            placeholder="مثلاً ۱۰۰,۰۰۰,۰۰۰"
            affix="تومان"
            className="form-input"
            required
          />
        </div>

        {/* Row 3: Rate & Installment Count */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '14px' }}>
          <div className="form-item">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label className="ui-input-label">نرخ سود سالانه (٪)</label>
              {cleanRate === 0 && (
                <span style={{
                  fontSize: '0.75rem',
                  padding: '1px 8px',
                  borderRadius: '12px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  fontWeight: 600,
                }}>
                  قرض‌الحسنه
                </span>
              )}
            </div>
            <NumericInput
              value={annualInterestRate}
              onValueChange={(val) => setAnnualInterestRate(val)}
              placeholder="۰ برای بدون سود"
              affix="٪"
              allowDecimals={true}
              className="form-input"
            />
          </div>

          <div className="form-item">
            <label className="ui-input-label" style={{ display: 'block', marginBottom: '6px' }}>
              تعداد کل اقساط *
            </label>
            <NumericInput
              value={installmentCount}
              onValueChange={(val) => setInstallmentCount(val)}
              placeholder="مثلاً: ۱۲، ۲۴، ۳۶"
              affix="قسط"
              className="form-input"
              required
            />
          </div>
        </div>

        {/* Row 4: Start Date & Payment Interval */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '16px' }}>
          <ShamsiDatePicker
            label="تاریخ دریافت وام *"
            value={startDateShamsi}
            onChange={(val) => {
              setStartDateShamsi(val);
              const iso = shamsiToGregorian(val);
              if (iso) setStartDateIso(iso);
            }}
            onChangeIso={(iso) => setStartDateIso(iso)}
          />

          <div className="form-item">
            <label className="ui-input-label" style={{ display: 'block', marginBottom: '6px' }}>
              دوره پرداخت اقساط
            </label>
            <select
              value={intervalMonths}
              onChange={(e) => setIntervalMonths(parseInt(e.target.value, 10) || 1)}
              className="form-select"
              style={{ height: '42px' }}
            >
              <option value={1}>ماهانه (هر ۱ ماه)</option>
              <option value={2}>دو ماه یک‌بار</option>
              <option value={3}>فصلی (هر ۳ ماه)</option>
              <option value={6}>شش‌ماهه (هر ۶ ماه)</option>
              <option value={12}>سالانه (هر ۱۲ ماه)</option>
            </select>
          </div>
        </div>

        {/* Custom First Installment Checkbox (فاز C) — Only on creation */}
        {!editingLoan && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '16px',
          }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer',
              userSelect: 'none',
              fontSize: '0.88rem',
              color: '#e2e8f0',
            }}>
              <input
                type="checkbox"
                checked={hasCustomFirstInstallment}
                onChange={(e) => {
                  setHasCustomFirstInstallment(e.target.checked);
                  if (!e.target.checked) setFirstInstallmentAmount('');
                }}
                style={{ width: '16px', height: '16px', accentColor: '#f59e0b', cursor: 'pointer' }}
              />
              <span style={{ fontWeight: 600 }}>مبلغ قسط اول متفاوت است</span>
            </label>

            {hasCustomFirstInstallment && (
              <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed rgba(255, 255, 255, 0.08)' }}>
                <label className="ui-input-label" style={{ display: 'block', marginBottom: '6px' }}>
                  مبلغ دلخواه قسط اول (تومان) *
                </label>
                <NumericInput
                  value={firstInstallmentAmount}
                  onValueChange={(val) => setFirstInstallmentAmount(val)}
                  placeholder="مثلاً: مبلغ پیش‌پرداخت یا قسط اول"
                  affix="تومان"
                  className="form-input"
                  required
                />
                <span style={{ display: 'block', fontSize: '0.74rem', color: '#94a3b8', marginTop: '6px' }}>
                  اقساط بعدی (۲ تا {cleanCount || '...'}) پس از ساخت وام، به صورت خودکار بر اساس مانده باقیمانده بازمحاسبه می‌شوند.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Live Calculation Preview Box */}
        <div style={{
          background: 'var(--bg-card-dark, rgba(15, 23, 42, 0.7))',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          borderRadius: '12px',
          padding: '14px 16px',
          marginBottom: '14px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary, #94a3b8)', fontSize: '0.85rem' }}>
              <Calculator size={16} className="text-amber-400" />
              <span style={{ fontWeight: 600 }}>پیش‌نمایش زنده اقساط (فرمول بانکی)</span>
            </div>
            {liveInstallment > 0 && (
              <span style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={13} />
                محاسبه آنی
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
            {/* Installment Amount */}
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px', borderRadius: '8px' }}>
              <span style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                مبلغ هر قسط:
              </span>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: '#f59e0b' }}>
                {liveInstallment > 0 ? `${formatPersianNum(liveInstallment)} تومان` : '—'}
              </span>
            </div>

            {/* Total Repayment */}
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px', borderRadius: '8px' }}>
              <span style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                کل بازپرداخت:
              </span>
              <span style={{ fontSize: '0.92rem', fontWeight: 600, color: '#e2e8f0' }}>
                {liveTotalRepayment > 0 ? `${formatPersianNum(liveTotalRepayment)} تومان` : '—'}
              </span>
            </div>

            {/* Total Interest */}
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px', borderRadius: '8px' }}>
              <span style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                مجموع سود وام:
              </span>
              <span style={{ fontSize: '0.92rem', fontWeight: 600, color: cleanRate === 0 ? '#34d399' : '#e2e8f0' }}>
                {cleanRate === 0
                  ? '۰ (بدون سود)'
                  : liveTotalInterest > 0
                  ? `${formatPersianNum(liveTotalInterest)} تومان`
                  : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Row 5: Notes */}
        <Input
          as="textarea"
          label="توضیحات و شرایط (اختیاری)"
          placeholder="شماره قرارداد، ضامن‌ها، وثیقه‌ها، نحوه پرداخت..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
      </div>
    </Modal>
  );
}
