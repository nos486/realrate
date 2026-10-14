/**
 * AddLoanForm.jsx — Modal Form for Creating and Editing Loans
 *
 * Includes:
 * - Live PMT calculation preview using calculateFixedInstallmentAmount
 * - The day the loan was received, kept as Shamsi and ISO together
 * - Rebuild alert for paid vs pending installments in edit mode
 * - Clean NumericInput integration with Persian digits formatting
 *
 * Laid out as an entry form (shared/form/, docs/en/DESIGN.md «Entry forms»): the principal first
 * and large (in words under it), the title, the bank, the day received («امروز»/«دیروز»/«روز دیگر»),
 * the terms — how installments are set (a segmented choice, on creation), the rate and count (or
 * the known total), the payment interval as a picker row — then the live preview, and what is
 * rarely needed (the annual fee, notes, reminders) under «جزئیات بیشتر».
 */

import { intlLocale } from '../../../utils/i18n.js';
import React, { useState, useEffect, useMemo } from 'react';
import { Landmark, AlertCircle, Calculator } from 'lucide-react';
import { AlertBanner, FilterPills, Input, Modal, NumericInput } from '../../../shared/ui/index.js';
import { AmountField, DateField, EntryFormActions, MoreDetails, PickerRow } from '../../../shared/form/index.js';
import { BASE_CURRENCY } from '../../../utils/currencies.js';
import {
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

const formatPersianNum = (val) => Number(val || 0).toLocaleString(intlLocale());

/** How installment amounts are set, on creation (see installmentMode) */
const INSTALLMENT_MODES = [
  { value: 'standard', label: 'نرخ سود سالانه' },
  { value: 'totalRepaymentBased', label: 'کل بازپرداخت را می‌دانم' },
];

/** The payment interval, in months (a picker row: its value is the month count as a string) */
const INTERVAL_OPTIONS = [
  { value: '1', label: 'ماهانه (هر ۱ ماه)' },
  { value: '2', label: 'دو ماه یک‌بار' },
  { value: '3', label: 'فصلی (هر ۳ ماه)' },
  { value: '6', label: 'شش‌ماهه (هر ۶ ماه)' },
  { value: '12', label: 'سالانه (هر ۱۲ ماه)' },
];

export default function AddLoanForm({
  isOpen,
  onClose,
  onSubmit,
  editingLoan = null,
  draft = null,
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
  const [remindersEnabled, setRemindersEnabled] = useState(true);
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
  // Bumped each time the form is filled for an opening: the body remounts with those values
  const [round, setRound] = useState(0);

  // Populate or reset form whenever modal opens or editingLoan changes
  useEffect(() => {
    if (!isOpen) return;

    setRound((r) => r + 1);
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
      setRemindersEnabled(editingLoan.remindersMuted !== true);
    } else {
      // A new loan, empty or from a `draft` (a bank SMS deposit: amount, day, bank)
      const start = draft?.startDate || todayIso();
      setTitle('');
      setBank({ bankId: draft?.bankId || '', lenderName: '' });
      setPrincipalAmount(draft?.principalAmount ? String(draft.principalAmount) : '');
      setAnnualInterestRate('23');
      setInstallmentCount('12');
      setIntervalMonths(1);

      setStartDateIso(start);
      setStartDateShamsi(draft?.startDate ? gregorianToShamsi(start) : getTodayShamsi());
      setAnnualFeeAmount('');
      setNotes('');
      setRemindersEnabled(true);
    }

    return () => {
      cancelled = true;
    };
  }, [isOpen, editingLoan, draft]);

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
        remindersMuted: !remindersEnabled,
        totalRepaymentAmount: totalRepaymentAmountToSubmit,
      });
      onClose();
    } catch (err) {
      setFormError(err.message || 'خطا در ذخیره اطلاعات وام');
    }
  };

  const canSubmit = cleanPrincipal > 0 && cleanCount > 0 && !isCountBelowPaid && !isStartDateChangedAfterPaid && !isTotalRepaymentInvalid;
  const detailsFilled = [
    ...(cleanAnnualFee > 0 ? ['کارمزد'] : []),
    ...(notes.trim() ? ['یادداشت'] : []),
    ...(!remindersEnabled ? ['بدون یادآوری'] : []),
  ];
  const tomans = (n) => `${formatPersianNum(n)} تومان`;

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
      icon={<Landmark size={20} />}
      footer={
        <EntryFormActions
          submitLabel={editingLoan ? 'به‌روزرسانی وام' : 'افزودن و ساخت اقساط'}
          valid={canSubmit}
          submitting={submitting}
          onCancel={onClose}
          onNext={null}
        />
      }
      onSubmit={handleSubmit}
      maxWidth="560px"
    >
      {/* Remounted once the opening values are in, so what starts folded or open follows them */}
      <div className="entry-form-body loan-form" key={round}>
        {formError && <AlertBanner type="error" message={formError} />}

        {/* Edit mode financial alteration alert */}
        {isFinancialTermsChanged && (
          <AlertBanner type="warning" title="توجه به تغییر شرایط مالی:">
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
          </AlertBanner>
        )}

        <AmountField
          id="loan-principal"
          label="مبلغ وام"
          value={principalAmount}
          onValueChange={setPrincipalAmount}
          currency={BASE_CURRENCY}
          placeholder="مثلاً ۱۰۰,۰۰۰,۰۰۰"
          autoFocus={!editingLoan}
        />

        <Input
          id="loan-title"
          label="نام یا عنوان وام *"
          placeholder="مثلاً: وام مسکن، خرید خودرو"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <BankPicker id="loan-bank" value={bank} onChange={setBank} label="بانک / وام‌دهنده" />

        <DateField
          label="تاریخ دریافت وام *"
          value={startDateShamsi}
          onChange={(val) => {
            setStartDateShamsi(val);
            const iso = shamsiToGregorian(val);
            if (iso) setStartDateIso(iso);
          }}
        />

        <div className="entry-form-section">
          {/* Installment Determination Mode — Only on creation */}
          {!editingLoan && (
            <div className="ui-input-group">
              <span className="ui-input-label">روش تعیین مبلغ اقساط</span>
              <FilterPills
                variant="segmented"
                size="sm"
                options={INSTALLMENT_MODES}
                activeValue={installmentMode}
                onChange={(mode) => {
                  setInstallmentMode(mode);
                  setTotalRepaymentAmount('');
                }}
              />
              <p className="expense-form-hint">
                {installmentMode === 'totalRepaymentBased'
                  ? 'مبلغ دقیق کل بازپرداختی که بانک اعلام کرده را وارد کنید — بدون نیاز به دانستن نرخ سود، این مبلغ به‌طور مساوی بین همه‌ی اقساط تقسیم می‌شود.'
                  : 'مبلغ هر قسط از نرخ سود سالانه با فرمول بانکی حساب می‌شود (پیشنهادی).'}
              </p>
            </div>
          )}

          <div className="loan-form-terms">
            {installmentMode !== 'totalRepaymentBased' && (
              <div className="ui-input-group">
                <div className="loan-form-label-row">
                  <label className="ui-input-label" htmlFor="loan-rate">نرخ سود سالانه (٪)</label>
                  {cleanRate === 0 && <span className="loan-form-badge">قرض‌الحسنه</span>}
                </div>
                <NumericInput
                  id="loan-rate"
                  value={annualInterestRate}
                  onValueChange={setAnnualInterestRate}
                  placeholder="۰ برای بدون سود"
                  affix="٪"
                  allowDecimals
                  className="form-input"
                />
              </div>
            )}

            <div className="ui-input-group">
              <label className="ui-input-label" htmlFor="loan-count">تعداد کل اقساط *</label>
              <NumericInput
                id="loan-count"
                value={installmentCount}
                onValueChange={setInstallmentCount}
                placeholder="مثلاً: ۱۲، ۲۴، ۳۶"
                affix="قسط"
                className="form-input"
                required
              />
            </div>
          </div>

          {installmentMode === 'totalRepaymentBased' && (
            <div className="ui-input-group">
              <label className="ui-input-label" htmlFor="loan-total-repayment">
                کل بازپرداخت (اصل + سود) {editingLoan ? '' : '*'}
              </label>
              <NumericInput
                id="loan-total-repayment"
                value={loadingDistributedTotal ? '' : totalRepaymentAmount}
                onValueChange={setTotalRepaymentAmount}
                placeholder={loadingDistributedTotal ? 'در حال دریافت مبلغ فعلی...' : 'مبلغ دقیقی که طبق بانک باید در مجموع پس بدهید'}
                affix="تومان"
                className="form-input"
                required={!editingLoan}
                disabled={Boolean(editingLoan)}
              />
              {editingLoan ? (
                <p className="expense-form-hint">
                  این وام با «ویرایش گروهی اقساط» تنظیم شده — برای تغییر مبلغ اقساط از همان بخش (داخل جدول اقساط وام) استفاده کنید.
                </p>
              ) : (
                <>
                  {totalBasedResult.approxRatePct !== null && totalBasedResult.approxRatePct !== undefined && (
                    <p className="expense-form-hint">
                      نرخ سود معادل تقریبی: {totalBasedResult.approxRatePct}٪ (فقط اطلاعاتی — در محاسبه اقساط استفاده نمی‌شود)
                    </p>
                  )}
                  {totalBasedResult.error && (
                    <p className="loan-form-error">
                      <AlertCircle size={14} aria-hidden="true" />
                      {totalBasedResult.error}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <PickerRow
            label="دوره پرداخت اقساط"
            value={String(intervalMonths)}
            options={INTERVAL_OPTIONS}
            onChange={(v) => setIntervalMonths(parseInt(v, 10) || 1)}
          />
        </div>

        {/* Live preview — rate-based: the bank formula (from the real schedule generator) */}
        {installmentMode !== 'totalRepaymentBased' && (
          <LoanPreview
            title="پیش‌نمایش زنده اقساط (فرمول بانکی)"
            installment={liveInstallment > 0 ? tomans(liveInstallment) : '—'}
            total={liveTotalRepayment > 0 ? tomans(liveTotalRepayment) : '—'}
            interest={cleanRate === 0 ? '۰ (بدون سود)' : liveTotalInterest > 0 ? tomans(liveTotalInterest) : '—'}
            interestFree={cleanRate === 0}
          />
        )}

        {/* Live Preview — totalRepaymentBased mode: a flat, equal division of the exact known
            total, guaranteed to reconcile to it exactly (no rate/formula involved). Creation-only:
            in edit mode the field above is read-only/informational and this would misleadingly
            show a fresh equal split even when the loan's real installments aren't uniform (e.g.
            it was customized per-installment via "ویرایش گروهی اقساط"). */}
        {!editingLoan && installmentMode === 'totalRepaymentBased' && totalBasedResult.schedule.length > 0 && (
          <LoanPreview
            title="پیش‌نمایش زنده اقساط (تقسیم مساوی کل بازپرداخت)"
            installment={tomans(totalBasedResult.schedule[0].totalAmount)}
            total={tomans(cleanTotalRepaymentInput)}
            interest={tomans(Math.max(0, cleanTotalRepaymentInput - cleanPrincipal))}
          />
        )}

        <MoreDetails filled={detailsFilled}>
          <div className="ui-input-group">
            <label className="ui-input-label" htmlFor="loan-annual-fee">کارمزد سالانه</label>
            <NumericInput
              id="loan-annual-fee"
              value={annualFeeAmount}
              onValueChange={setAnnualFeeAmount}
              placeholder="در صورت وجود، مبلغ کارمزدی که بانک هرسال دریافت می‌کند"
              affix="تومان"
              className="form-input"
            />
            <p className="expense-form-hint">هر سال یک‌بار، به مبلغ نزدیک‌ترین قسط به سالگرد دریافت وام اضافه می‌شود.</p>
          </div>

          <Input
            id="loan-notes"
            as="textarea"
            label="توضیحات و شرایط"
            placeholder="شماره قرارداد، ضامن‌ها، وثیقه‌ها، نحوه پرداخت..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />

          <label className="income-recurring-toggle">
            <input
              type="checkbox"
              checked={remindersEnabled}
              onChange={(e) => setRemindersEnabled(e.target.checked)}
            />
            <span>
              <strong>یادآوری برای این مورد</strong>
              <small>در صورت فعال بودن، در زمان سررسید اقساط این وام اعلان یا ایمیل یادآوری ارسال می‌شود.</small>
            </span>
          </label>
        </MoreDetails>
      </div>
    </Modal>
  );
}

/**
 * The live installment preview: each installment, the total repaid and the total interest
 * @param {{ title: string, installment: string, total: string, interest: string, interestFree?: boolean }} props
 */
function LoanPreview({ title, installment, total, interest, interestFree = false }) {
  return (
    <div className="loan-form-preview" aria-live="polite">
      <div className="loan-form-preview-head">
        <Calculator size={15} aria-hidden="true" />
        <span>{title}</span>
      </div>
      <div className="loan-form-preview-grid">
        <div className="loan-form-preview-cell">
          <span>مبلغ هر قسط</span>
          <strong className="is-main">{installment}</strong>
        </div>
        <div className="loan-form-preview-cell">
          <span>کل بازپرداخت (اصل + سود)</span>
          <strong>{total}</strong>
        </div>
        <div className="loan-form-preview-cell">
          <span>مجموع سود وام</span>
          <strong className={interestFree ? 'is-positive' : ''}>{interest}</strong>
        </div>
      </div>
    </div>
  );
}
