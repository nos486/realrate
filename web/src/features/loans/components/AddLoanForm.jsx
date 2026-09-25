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
import {
  calculateFixedInstallmentAmount,
  generateAmortizationSchedule,
  solveAnnualRateFromTotalRepayment,
  distributeInstallmentAmounts,
} from '../../../utils/loanCalculator.js';
import { getLoanDetail } from '../api/loanApi.js';
import { BankPicker } from '../../../shared/banks/index.js';
import { todayIso } from '../../../shared/utils/dates.js';

const formatPersianNum = (val) => Number(val || 0).toLocaleString('fa-IR');

export default function AddLoanForm({
  isOpen,
  onClose,
  onSubmit,
  editingLoan = null,
  submitting = false,
}) {
  const [title, setTitle] = useState('');
  // The bank as stored on the loan: a standard/custom bank id, plus the lender name as the
  // display fallback (older loans only have the name)
  const [bank, setBank] = useState({ bankId: '', lenderName: '' });
  const [principalAmount, setPrincipalAmount] = useState('');
  const [annualInterestRate, setAnnualInterestRate] = useState('23');
  const [installmentCount, setInstallmentCount] = useState('12');
  const [intervalMonths, setIntervalMonths] = useState(1);

  // Only used in installmentMode === 'totalRepaymentBased' — the user-known exact total
  // (principal + interest) that gets divided evenly across all installments, with NO notional
  // rate solved or involved. Kept entirely separate from the rate-based modes so editing it can
  // never surprise the user by silently recomputing/overriding the rate (see git history for the
  // confusing back-solve behavior this replaced).
  const [totalRepaymentAmount, setTotalRepaymentAmount] = useState('');
  const [startDateIso, setStartDateIso] = useState(todayIso());
  const [startDateShamsi, setStartDateShamsi] = useState(getTodayShamsi());
  const [annualFeeAmount, setAnnualFeeAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  // How installment amounts are determined at creation time — creation-only, mutually exclusive:
  // 'standard' = pure formula (rate-based), 'totalRepaymentBased' = the user supplies the exact
  // known total repayment instead of a rate. Editing individual installments (custom first,
  // per-installment customization) happens after creation via "ویرایش گروهی اقساط" instead.
  const [installmentMode, setInstallmentMode] = useState('standard');

  // When editing a loan whose scheduleMode is 'distributed' (built via "کل بازپرداخت" or
  // "سفارشی‌سازی تک‌تک اقساط" at creation, or via later بولک-edit), the edit form shows the
  // loan's ACTUAL current total instead of a rate field — a rate is meaningless for such a loan
  // (computeEffectiveSchedule never uses it for distributed loans). This total is fetched fresh
  // (the lightweight loan list objects don't carry installments) and shown read-only: changing
  // installment amounts belongs to "ویرایش گروهی اقساط", not this form.
  const [loadingDistributedTotal, setLoadingDistributedTotal] = useState(false);

  // Populate or reset form whenever modal opens or editingLoan changes
  useEffect(() => {
    if (!isOpen) return;

    setFormError('');
    setInstallmentMode('standard');
    setTotalRepaymentAmount('');
    setLoadingDistributedTotal(false);

    let cancelled = false;
    if (editingLoan && editingLoan.scheduleMode === 'distributed') {
      setInstallmentMode('totalRepaymentBased');
      setLoadingDistributedTotal(true);
      getLoanDetail(editingLoan.id)
        .then((res) => {
          if (cancelled) return;
          const installments = res?.loan?.installments || [];
          const total = installments.reduce((sum, i) => sum + Number(i.totalAmount || 0), 0);
          setTotalRepaymentAmount(total > 0 ? String(total) : '');
        })
        .catch(() => {
          if (!cancelled) setTotalRepaymentAmount('');
        })
        .finally(() => {
          if (!cancelled) setLoadingDistributedTotal(false);
        });
    }

    if (editingLoan) {
      setTitle(editingLoan.title || '');
      setBank({
        bankId: editingLoan.bankId || '',
        lenderName: editingLoan.lenderName || editingLoan.lender_name || '',
      });
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
        editingLoan.startDate || editingLoan.start_date || todayIso();
      setStartDateIso(rawStart);
      setStartDateShamsi(gregorianToShamsi(rawStart));
      setAnnualFeeAmount(
        editingLoan.annualFeeAmount ? String(editingLoan.annualFeeAmount) : ''
      );
      setNotes(editingLoan.notes || '');
    } else {
      setTitle('');
      setBank({ bankId: '', lenderName: '' });
      setPrincipalAmount('');
      setAnnualInterestRate('23');
      setInstallmentCount('12');
      setIntervalMonths(1);

      setStartDateIso(todayIso());
      setStartDateShamsi(getTodayShamsi());
      setAnnualFeeAmount('');
      setNotes('');
    }

    return () => {
      cancelled = true;
    };
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

  const cleanAnnualFee = useMemo(() => {
    const s = String(annualFeeAmount || '').replace(/,/g, '').trim();
    return Number(s) || 0;
  }, [annualFeeAmount]);

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

  // The true total repayment is NOT simply liveInstallment * cleanCount: the real schedule
  // (generateAmortizationSchedule) reconciles the LAST installment to absorb whatever rounding
  // remainder is left so principal sums exactly — naively multiplying the uniform installment
  // amount by the count ignores that and can be off by a few toman (e.g. showing a total
  // slightly ABOVE the principal even at 0% interest, purely from rounding N-1 installments up).
  // Deriving this from the actual schedule generator keeps the preview byte-for-byte consistent
  // with what dbCreateLoan will actually produce.
  const liveTotalRepayment = useMemo(() => {
    if (cleanPrincipal <= 0 || cleanCount <= 0) return 0;
    const schedule = generateAmortizationSchedule({
      principal: cleanPrincipal,
      annualRatePct: cleanRate,
      installmentCount: cleanCount,
      intervalMonths,
      startDateIso: startDateIso || todayIso(),
    });
    return schedule.reduce((sum, inst) => sum + inst.totalAmount, 0);
  }, [cleanPrincipal, cleanRate, cleanCount, intervalMonths, startDateIso]);

  const liveTotalInterest = useMemo(() => {
    if (liveTotalRepayment <= 0 || cleanPrincipal <= 0) return 0;
    return Math.max(0, liveTotalRepayment - cleanPrincipal);
  }, [liveTotalRepayment, cleanPrincipal]);

  const cleanTotalRepaymentInput = useMemo(() => {
    const s = String(totalRepaymentAmount || '').replace(/,/g, '').trim();
    return Number(s) || 0;
  }, [totalRepaymentAmount]);

  // Live preview for installmentMode === 'totalRepaymentBased': the exact total the user typed
  // is divided evenly across all installments (no rate involved at all — see
  // distributeInstallmentAmounts's totalRepaymentOverride).
  const totalBasedResult = useMemo(() => {
    if (installmentMode !== 'totalRepaymentBased' || cleanPrincipal <= 0 || cleanCount <= 0) {
      return { schedule: [], error: null };
    }
    if (cleanTotalRepaymentInput <= 0) {
      return { schedule: [], error: null };
    }
    const loan = {
      principalAmount: cleanPrincipal,
      installmentCount: cleanCount,
      intervalMonths,
      startDate: startDateIso || todayIso(),
    };
    try {
      const schedule = distributeInstallmentAmounts({ loan, totalRepaymentOverride: cleanTotalRepaymentInput });
      // Approximate equivalent annual rate, for the user's own reference only — never sent to
      // the server and never used to compute the actual (flat, exact) installment amounts.
      let approxRatePct = null;
      try {
        approxRatePct = solveAnnualRateFromTotalRepayment({
          principal: cleanPrincipal,
          installmentCount: cleanCount,
          totalRepayment: cleanTotalRepaymentInput,
          intervalMonths,
        }).annualRatePct;
      } catch {
        approxRatePct = null;
      }
      return { schedule, error: null, approxRatePct };
    } catch (err) {
      return { schedule: [], error: err.message || 'محاسبه ممکن نشد.', approxRatePct: null };
    }
  }, [installmentMode, cleanPrincipal, cleanCount, intervalMonths, startDateIso, cleanTotalRepaymentInput]);

  // Check if financial parameters were altered in edit mode
  const isFinancialTermsChanged = useMemo(() => {
    if (!editingLoan) return false;
    const origP = Number(editingLoan.principalAmount ?? editingLoan.principal_amount ?? 0);
    const origRate = Number(editingLoan.annualInterestRate ?? editingLoan.annual_interest_rate ?? 0);
    const origCount = parseInt(editingLoan.installmentCount ?? editingLoan.installment_count ?? 0, 10);
    return cleanPrincipal !== origP || cleanRate !== origRate || cleanCount !== origCount;
  }, [editingLoan, cleanPrincipal, cleanRate, cleanCount]);

  // Number of installments already paid on the loan being edited (0 for a new loan) — used to
  // warn/block edits the server would reject anyway (see dbUpdateLoan's guard rails).
  const editingPaidCount = editingLoan ? Number(editingLoan.paidCount || 0) : 0;
  const isCountBelowPaid = editingPaidCount > 0 && cleanCount < editingPaidCount;
  const isStartDateChangedAfterPaid = useMemo(() => {
    if (!editingLoan || editingPaidCount === 0) return false;
    const origStart = editingLoan.startDate || editingLoan.start_date || '';
    return startDateIso !== origStart;
  }, [editingLoan, editingPaidCount, startDateIso]);

  // In edit mode the total-repayment field is read-only/informational (see the populate effect),
  // never user-submitted, so it must never block the save button — including while it's still
  // being fetched (briefly 0 before the async loan-detail fetch resolves).
  const isTotalRepaymentInvalid = installmentMode === 'totalRepaymentBased' && !editingLoan &&
    (cleanTotalRepaymentInput <= 0 || Boolean(totalBasedResult.error));

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
    if (isCountBelowPaid) {
      setFormError(`تعداد اقساط نمی‌تواند از تعداد اقساط پرداخت‌شده (${editingPaidCount}) کمتر باشد.`);
      return;
    }
    if (isStartDateChangedAfterPaid) {
      setFormError('پس از پرداخت حداقل یک قسط، امکان تغییر تاریخ شروع وام وجود ندارد.');
      return;
    }

    // In edit mode the total-repayment field is read-only/informational — it's never sent, and
    // editing amounts on a distributed loan happens exclusively via "ویرایش گروهی اقساط".
    let totalRepaymentAmountToSubmit = null;
    if (installmentMode === 'totalRepaymentBased' && !editingLoan) {
      if (cleanTotalRepaymentInput <= 0) {
        setFormError('لطفاً مبلغ کل بازپرداخت را وارد نمایید.');
        return;
      }
      if (totalBasedResult.error) {
        setFormError(totalBasedResult.error);
        return;
      }
      totalRepaymentAmountToSubmit = cleanTotalRepaymentInput;
    }

    try {
      await onSubmit?.({
        title: title.trim(),
        bankId: bank.bankId || '',
        lenderName: (bank.lenderName || '').trim(),
        principalAmount: cleanPrincipal,
        annualInterestRate: installmentMode === 'totalRepaymentBased' && !editingLoan ? 0 : cleanRate,
        installmentCount: cleanCount,
        intervalMonths,
        startDate: startDateIso || todayIso(),
        annualFeeAmount: cleanAnnualFee,
        notes: notes.trim(),
        totalRepaymentAmount: totalRepaymentAmountToSubmit,
      });
      onClose();
    } catch (err) {
      setFormError(err.message || 'خطا در ذخیره اطلاعات وام');
    }
  };

  const footerActions = (
    <div className="modal-actions">
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
        className="btn-primary"
        disabled={submitting || cleanPrincipal <= 0 || cleanCount <= 0 || isCountBelowPaid || isStartDateChangedAfterPaid || isTotalRepaymentInvalid}
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
                {editingPaidCount > 0 && (
                  <>
                    {' '}تعداد اقساط نمی‌تواند کمتر از {editingPaidCount} و مبلغ اصل وام نمی‌تواند کمتر از مبلغ اصلِ قبلاً پرداخت‌شده باشد؛
                    همچنین تاریخ شروع وام پس از پرداخت اولین قسط قابل تغییر نیست.
                  </>
                )}
                {editingLoan?.scheduleMode === 'distributed' && (
                  <>
                    {' '}این وام با «ویرایش گروهی اقساط» تقسیم‌بندی شده بود؛ با این تغییر، آن تقسیم‌بندی پاک می‌شود و اقساط باقیمانده دوباره طبق فرمول استاندارد محاسبه می‌شوند.
                  </>
                )}
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
          <BankPicker id="loan-bank" value={bank} onChange={setBank} label="بانک / وام‌دهنده" />
        </div>

        {/* Installment Determination Mode — Only on creation */}
        {!editingLoan && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '16px',
          }}>
            <label className="ui-input-label" style={{ display: 'block', marginBottom: '8px' }}>
              روش تعیین مبلغ اقساط
            </label>
            <select
              value={installmentMode}
              onChange={(e) => {
                setInstallmentMode(e.target.value);
                setTotalRepaymentAmount('');
              }}
              className="form-select"
              style={{ height: '42px', width: '100%' }}
            >
              <option value="standard">نرخ سود سالانه (پیشنهادی)</option>
              <option value="totalRepaymentBased">کل بازپرداخت را می‌دانم (بدون نرخ سود)</option>
            </select>
            {installmentMode === 'totalRepaymentBased' && (
              <span style={{ display: 'block', fontSize: '0.74rem', color: '#94a3b8', marginTop: '8px' }}>
                مبلغ دقیق کل بازپرداختی که بانک اعلام کرده را وارد کنید — بدون نیاز به دانستن نرخ سود، این مبلغ به‌طور مساوی بین همه‌ی اقساط تقسیم می‌شود.
              </span>
            )}
          </div>
        )}

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

        {/* Row 3: Rate (rate-based modes only) & Installment Count */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '14px' }}>
          {installmentMode !== 'totalRepaymentBased' && (
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
          )}

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

          {installmentMode === 'totalRepaymentBased' && (
            <div className="form-item">
              <label className="ui-input-label" style={{ display: 'block', marginBottom: '6px' }}>
                کل بازپرداخت (اصل + سود) {editingLoan ? '' : '*'}
              </label>
              <NumericInput
                value={loadingDistributedTotal ? '' : totalRepaymentAmount}
                onValueChange={(val) => setTotalRepaymentAmount(val)}
                placeholder={loadingDistributedTotal ? 'در حال دریافت مبلغ فعلی...' : 'مبلغ دقیقی که طبق بانک باید در مجموع پس بدهید'}
                affix="تومان"
                className="form-input"
                required={!editingLoan}
                disabled={Boolean(editingLoan)}
              />
              {editingLoan ? (
                <span style={{ display: 'block', fontSize: '0.74rem', color: '#94a3b8', marginTop: '6px' }}>
                  این وام با «ویرایش گروهی اقساط» تنظیم شده — برای تغییر مبلغ اقساط از همان بخش (داخل جدول اقساط وام) استفاده کنید.
                </span>
              ) : (
                <>
                  {totalBasedResult.approxRatePct !== null && totalBasedResult.approxRatePct !== undefined && (
                    <span style={{ display: 'block', fontSize: '0.74rem', color: '#94a3b8', marginTop: '6px' }}>
                      نرخ سود معادل تقریبی: {totalBasedResult.approxRatePct}٪ (فقط اطلاعاتی — در محاسبه اقساط استفاده نمی‌شود)
                    </span>
                  )}
                  {totalBasedResult.error && (
                    <span style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '0.76rem', color: '#f87171', marginTop: '6px' }}>
                      <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                      {totalBasedResult.error}
                    </span>
                  )}
                </>
              )}
            </div>
          )}
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

        {/* Row 5: Optional Annual Fee */}
        <div className="form-item" style={{ marginBottom: '16px' }}>
          <label className="ui-input-label" style={{ display: 'block', marginBottom: '6px' }}>
            کارمزد سالانه (اختیاری)
          </label>
          <NumericInput
            value={annualFeeAmount}
            onValueChange={(val) => setAnnualFeeAmount(val)}
            placeholder="در صورت وجود، مبلغ کارمزدی که بانک هرسال دریافت می‌کند"
            affix="تومان"
            className="form-input"
          />
          <span style={{ display: 'block', fontSize: '0.74rem', color: '#94a3b8', marginTop: '6px' }}>
            هر سال یک‌بار، به مبلغ نزدیک‌ترین قسط به سالگرد دریافت وام اضافه می‌شود.
          </span>
        </div>

        {/* Live Calculation Preview Box — rate-based modes only */}
        {installmentMode !== 'totalRepaymentBased' && (
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

            {/* Total Repayment (read-only preview, computed from the real schedule generator) */}
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px', borderRadius: '8px' }}>
              <span style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                کل بازپرداخت (اصل + سود):
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
        )}

        {/* Live Preview — totalRepaymentBased mode: a flat, equal division of the exact known
            total, guaranteed to reconcile to it exactly (no rate/formula involved). Creation-only:
            in edit mode the field above is read-only/informational and this would misleadingly
            show a fresh equal split even when the loan's real installments aren't uniform (e.g.
            it was customized per-installment via "ویرایش گروهی اقساط"). */}
        {!editingLoan && installmentMode === 'totalRepaymentBased' && totalBasedResult.schedule.length > 0 && (
          <div style={{
            background: 'var(--bg-card-dark, rgba(15, 23, 42, 0.7))',
            border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
            borderRadius: '12px',
            padding: '14px 16px',
            marginBottom: '14px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary, #94a3b8)', fontSize: '0.85rem', marginBottom: '10px' }}>
              <Calculator size={16} className="text-amber-400" />
              <span style={{ fontWeight: 600 }}>پیش‌نمایش زنده اقساط (تقسیم مساوی کل بازپرداخت)</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px', borderRadius: '8px' }}>
                <span style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                  مبلغ هر قسط:
                </span>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: '#f59e0b' }}>
                  {formatPersianNum(totalBasedResult.schedule[0].totalAmount)} تومان
                </span>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px', borderRadius: '8px' }}>
                <span style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                  کل بازپرداخت (اصل + سود):
                </span>
                <span style={{ fontSize: '0.92rem', fontWeight: 600, color: '#e2e8f0' }}>
                  {formatPersianNum(cleanTotalRepaymentInput)} تومان
                </span>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px', borderRadius: '8px' }}>
                <span style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                  مجموع سود وام:
                </span>
                <span style={{ fontSize: '0.92rem', fontWeight: 600, color: '#e2e8f0' }}>
                  {formatPersianNum(Math.max(0, cleanTotalRepaymentInput - cleanPrincipal))} تومان
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Row 6: Notes */}
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
