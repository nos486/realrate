/**
 * LoansPage.jsx — Main Loans Dashboard & Installment Tracker
 *
 * Features:
 * - Summary cards: Total remaining debt, active loans, paid installments ratio, next upcoming payment
 * - Interactive loan cards list
 * - Add/Edit modal with live amortization preview
 * - Loan details dialog with interactive full installment schedule & payment toggling
 */

import { t, intlLocale } from '../../../utils/i18n.js';
import React, { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Landmark,
  Plus,
  AlertCircle,
} from 'lucide-react';
import { useLoansContext } from '../context/LoansContext.jsx';
import { useLoanDetail } from '../hooks/useLoanDetail.js';
import LoansTable from './LoansTable.jsx';
import { isLoanCompleted } from '../utils/loanStatus.js';
import AddLoanForm from './AddLoanForm.jsx';
import LoanInstallmentsTable from './LoanInstallmentsTable.jsx';
import LoanCsvExportButton from './LoanCsvExportButton.jsx';
import LoanCsvImportButton from './LoanCsvImportButton.jsx';
import Modal from '../../../shared/ui/Modal.jsx';
import Button from '../../../shared/ui/Button.jsx';
import EmptyState from '../../../shared/ui/EmptyState.jsx';
import FeaturePageHeader from '../../../shared/ui/FeaturePageHeader.jsx';
import SplitPageLayout from '../../../shared/ui/SplitPageLayout.jsx';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { getDisplayRatePct } from '../../../utils/loanCalculator.js';
import { appPath } from '../../../shared/routes.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { SkeletonRows } from '../../../shared/ui/Skeleton.jsx';
import { BankLogo, resolveBank, useCustomBanks } from '../../../shared/banks/index.js';
import LoanBankShareChart from './LoanBankShareChart.jsx';
import LoanFundingCard from './LoanFundingCard.jsx';
import { useQuickAddParam } from '../../../shared/hooks/useQuickAddParam.js';
import { dismissSms } from '../../../shared/native/smsInbox.js';
import VaultUnlockCard from '../../../shared/vault/VaultUnlockCard.jsx';
import { usePrivacyMode } from '../../../hooks/usePrivacyMode.js';
import { useDemo } from '../../demo/index.js';

const formatNum = (v) => Number(v || 0).toLocaleString(intlLocale());
/** Amounts follow the app-wide "hide values" toggle; counts and percentages stay visible */
const formatMoney = (v, hidden) => (hidden ? '****' : formatNum(v));

/** The detail modal's one-line summary: lender, principal, rate and the yearly fee when there is one */
function loanSubtitle(loan, hideValues) {
  const parts = [];
  if (loan.lenderName) parts.push(t('وام‌دهنده: {name}', { name: loan.lenderName }));
  parts.push(t('اصل: {amount} تومان', { amount: formatMoney(loan.principalAmount, hideValues) }));
  parts.push(t('سود: {rate}٪', { rate: getDisplayRatePct(loan) }));
  if (Number(loan.annualFeeAmount) > 0) parts.push(t('کارمزد سالانه: {amount} تومان', { amount: formatMoney(loan.annualFeeAmount, hideValues) }));
  return parts.join(' • ');
}

/**
 * Isolated Modal Wrapper for Single Loan Detail & Schedule
 */
function LoanDetailModal({ loanId, onClose, onRefreshLoans, readOnly = false }) {
  const {
    loan,
    extraPayments,
    loading,
    submitting,
    error,
    markPaid,
    unmarkPaid,
    bulkDistributeInstallments,
    addExtraPayment,
  } = useLoanDetail(loanId);
  const hideValues = usePrivacyMode();

  const handleMarkPaid = async (installmentId, details) => {
    const res = await markPaid(installmentId, details);
    onRefreshLoans?.();
    return res;
  };

  const handleUnmarkPaid = async (installmentId) => {
    await unmarkPaid(installmentId);
    onRefreshLoans?.();
  };

  const handleAddExtraPayment = async (paymentData) => {
    const res = await addExtraPayment(paymentData);
    onRefreshLoans?.();
    return res;
  };

  const handleBulkDistributeInstallments = async (knownAmounts, totalRepaymentAmount) => {
    const res = await bulkDistributeInstallments(knownAmounts, totalRepaymentAmount);
    onRefreshLoans?.();
    return res;
  };

  if (!loanId) return null;

  return (
    <Modal
      isOpen={Boolean(loanId)}
      onClose={onClose}
      title={loan ? loan.title : t('جدول اقساط وام')}
      subtitle={
        loan
          ? loanSubtitle(loan, hideValues)
          : t('در حال دریافت اطلاعات...')
      }
      icon={<Landmark size={20} className="text-amber-500" />}
      maxWidth="min(1320px, 94vw)"
      className="loan-detail-modal-wide"
    >
      {loading && !loan ? (
        <SkeletonRows rows={8} columns={5} label={t('در حال بارگذاری جدول اقساط')} />
      ) : error ? (
        <div className="form-error-banner" style={{ margin: '20px 0' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      ) : loan ? (
        <div style={{ padding: '4px 0' }}>
          <LoanFundingCard loan={loan} hideValues={hideValues} />
          <LoanInstallmentsTable
            loan={loan}
            installments={loan.installments || []}
            extraPayments={extraPayments || []}
            onMarkPaid={handleMarkPaid}
            onUnmarkPaid={handleUnmarkPaid}
            onAddExtraPayment={handleAddExtraPayment}
            onBulkDistributeInstallments={handleBulkDistributeInstallments}
            submitting={submitting}
            hideValues={hideValues}
            readOnly={readOnly}
          />
        </div>
      ) : null}
    </Modal>
  );
}

export default function LoansPage({ initialLoanId = null }) {
  const hideValues = usePrivacyMode();
  const { readOnly } = useDemo();
  const {
    loans,
    vaultLocked,
    loadingLoans,
    submitting,
    error,
    fetchLoans,
    addLoan,
    updateLoan,
    deleteLoan,
  } = useLoansContext();

  const navigate = useNavigate();
  const location = useLocation();

  // Settled loans are hidden by default: the list stays short
  const [showSettled, setShowSettled] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState(null);
  // A new loan from a bank SMS deposit (the SMS page: «وام جدید»), whose message is dropped once saved
  const [loanDraft, setLoanDraft] = useState(null);
  const [selectedLoanId, setSelectedLoanId] = useState(initialLoanId);

  // Follow route changes (/loans/:loanId), adjusted during render instead of in an effect
  const [prevInitialLoanId, setPrevInitialLoanId] = useState(initialLoanId);
  if (initialLoanId !== prevInitialLoanId) {
    setPrevInitialLoanId(initialLoanId);
    setSelectedLoanId(initialLoanId || null);
  }

  useQuickAddParam('loan', ({ amount, date, bank, sms }) => {
    setEditingLoan(null);
    setLoanDraft(amount || date || bank ? {
      principalAmount: Number(amount) > 0 ? Number(amount) : '',
      startDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
      bankId: bank,
      smsFingerprint: sms,
    } : null);
    setIsAddModalOpen(true);
  }, !vaultLocked && !readOnly, ['amount', 'date', 'bank', 'sms']);

  const handleSelectLoan = (loan) => {
    if (!loan?.id) return;
    setSelectedLoanId(loan.id);
    navigate(appPath(`/loans/${loan.id}`));
  };

  const handleCloseDetailModal = () => {
    setSelectedLoanId(null);
    if (location.pathname !== appPath('/loans') || location.search.includes('id=')) {
      navigate(appPath('/loans'));
    }
  };

  // 1. Overall Aggregated Metrics
  const summaryMetrics = useMemo(() => {
    let totalDebt = 0;
    let activeLoans = 0;
    let totalPaidCount = 0;
    let totalCount = 0;
    let nextUpcomingDue = null;
    let totalMonthlyInstallment = 0;
    let totalReceived = 0;

    for (const l of loans) {
      const rem = Number(l.remainingBalance ?? 0);
      totalDebt += rem;
      if (rem > 0) activeLoans++;
      totalPaidCount += Number(l.paidCount ?? 0);
      totalCount += Number(l.totalCount || l.installmentCount || 0);
      totalReceived += Number(l.principalAmount ?? 0);

      if (l.nextDueInstallment && l.nextDueInstallment.dueDate) {
        if (!nextUpcomingDue || l.nextDueInstallment.dueDate < nextUpcomingDue.dueDate) {
          nextUpcomingDue = {
            ...l.nextDueInstallment,
            loanTitle: l.title,
          };
        }
      }

      // Sum of the next unpaid installment's amount per loan, as a proxy for the recurring
      // monthly burden — accurate for the common case (intervalMonths === 1).
      if (l.nextDueInstallment && Number(l.intervalMonths ?? 1) === 1) {
        totalMonthlyInstallment += Number(l.nextDueInstallment.totalAmount || 0);
      }
    }

    const overallProgress = totalCount > 0 ? Math.round((totalPaidCount / totalCount) * 100) : 0;

    return {
      totalDebt,
      activeLoans,
      totalPaidCount,
      totalCount,
      overallProgress,
      nextUpcomingDue,
      totalMonthlyInstallment,
      totalReceived,
    };
  }, [loans]);

  // 2. Group loans by bank — the bank is resolved from the stored bank id (or, for older loans,
  // matched from the free-text lender name) so spelling variations land in the same group.
  // Sorted by remaining balance so the heaviest debts surface first.
  const { customBanks } = useCustomBanks();
  const bankGroups = useMemo(() => {
    const order = [];
    const groups = new Map();
    for (const loan of loans) {
      const bank = resolveBank(loan, customBanks);
      if (!groups.has(bank.key)) {
        const group = { key: bank.key, bank, name: bank.name, items: [] };
        groups.set(bank.key, group);
        order.push(group);
      }
      groups.get(bank.key).items.push(loan);
    }
    return order
      .map((group) => ({
        ...group,
        totalPrincipal: group.items.reduce((acc, l) => acc + Number(l.principalAmount ?? 0), 0),
        totalRemaining: group.items.reduce((acc, l) => acc + Number(l.remainingBalance ?? 0), 0),
        // Sum of each loan's next unpaid installment amount, as the bank's upcoming
        // payment burden — same simplification the overall "monthly installment" stat uses.
        nextMonthTotal: group.items.reduce(
          (acc, l) => acc + (l.nextDueInstallment ? Number(l.nextDueInstallment.totalAmount || 0) : 0),
          0
        ),
      }))
      .sort((a, b) => b.totalRemaining - a.totalRemaining);
  }, [loans, customBanks]);
  // The list hides settled loans by default (the chart and totals keep counting them)
  const visibleGroups = useMemo(
    () => bankGroups
      .map((group) => ({ ...group, items: showSettled ? group.items : group.items.filter((l) => !isLoanCompleted(l)) }))
      .filter((group) => group.items.length > 0),
    [bankGroups, showSettled],
  );
  const settledCount = useMemo(() => loans.filter(isLoanCompleted).length, [loans]);

  // Handlers
  const handleOpenAddModal = () => {
    setEditingLoan(null);
    setLoanDraft(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (loan) => {
    setEditingLoan(loan);
    setIsAddModalOpen(true);
  };

  const { confirm, toast } = useFeedback();

  const handleDeleteLoan = async (loanId) => {
    const loan = loans.find((l) => l.id === loanId);
    const message = loan
      ? t('آیا از حذف وام «{title}» و تمام اقساط آن اطمینان دارید؟ این کار قابل بازگشت نیست.', { title: loan.title })
      : t('آیا از حذف وام این وام و تمام اقساط آن اطمینان دارید؟ این کار قابل بازگشت نیست.');
    const confirmed = await confirm({
      title: t('حذف وام'),
      message,
      confirmLabel: t('حذف وام'),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await deleteLoan(loanId);
      if (selectedLoanId === loanId) {
        handleCloseDetailModal();
      }
    } catch (err) {
      toast.error(err.message || t('خطا در حذف وام'));
    }
  };

  const handleFormSubmit = async (formData) => {
    if (editingLoan) {
      await updateLoan(editingLoan.id, formData);
    } else {
      await addLoan(formData);
      if (loanDraft?.smsFingerprint) dismissSms(loanDraft.smsFingerprint);
    }
  };

  // Login is guaranteed by MainPage's site-wide auth gate before this component renders.

  if (vaultLocked) {
    return (
      <div className="loans-page-container">
        <FeaturePageHeader
          icon={<Landmark size={24} />}
          title={t('وام‌ها و اقساط')}
        help="loans"
          subtitle={t('برنامه استهلاک بانکی، جدول سررسید و ثبت تسویه اقساط')}
        />
        <VaultUnlockCard title={t('وام‌های شما رمزنگاری شده‌اند')} />
      </div>
    );
  }

  return (
    <div className="loans-page-container">
      <FeaturePageHeader
        icon={<Landmark size={24} />}
        title={t('وام‌ها و اقساط')}
        subtitle={t('برنامه استهلاک بانکی، جدول سررسید و ثبت تسویه اقساط')}
        actions={
          <>
            <LoanCsvExportButton loans={loans} disabled={loans.length === 0} />
            <LoanCsvImportButton addLoan={addLoan} disabled={readOnly} />
            <Button
              icon={<Plus size={16} />}
              onClick={handleOpenAddModal}
              disabled={readOnly}
              title={readOnly ? t('در نسخه دمو غیرفعال است') : undefined}
            >
              {t('افزودن وام جدید')}
            </Button>
          </>
        }
      />

      {/* Two Column Split: Right (Loans List, Grouped by Bank), Left (Overview Summary) */}
      <SplitPageLayout
        sidebar={
          <div className="portfolio-overview-grid">

            {/* Card 1: Total Remaining Debt */}
            <div className="portfolio-stat-card main-val">
              <div className="stat-header">
                <span className="stat-label">{t('مجموع بدهی باقیمانده')}</span>
              </div>
              <div className="stat-number gold-gradient-text">
                {formatMoney(summaryMetrics.totalDebt, hideValues)}
                <span className="stat-unit">{t('تومان')}</span>
              </div>
              <div className="stat-sub">{t('{n} وام فعال', { n: summaryMetrics.activeLoans.toLocaleString(intlLocale()) })}</div>
            </div>

            {/* Card 2: Share of each bank in the loans */}
            {loans.length > 0 && <LoanBankShareChart groups={bankGroups} hideValues={hideValues} />}

            {/* Card 2: Total Monthly Installment */}
            <div className="portfolio-stat-card">
              <div className="stat-header">
                <span className="stat-label">{t('مجموع قسط ماهانه')}</span>
              </div>
              <div className="stat-number">
                {formatMoney(summaryMetrics.totalMonthlyInstallment, hideValues)}
                <span className="stat-unit">{t('تومان')}</span>
              </div>
            </div>

            {/* Card 3: Paid Installments Ratio */}
            <div className="portfolio-stat-card">
              <div className="stat-header">
                <span className="stat-label">{t('کل اقساط پرداخت‌شده')}</span>
                <span className="count-pill">{formatNum(summaryMetrics.overallProgress)}{t('٪')}</span>
              </div>
              <div className="stat-number">
                {formatNum(summaryMetrics.totalPaidCount)}
                <span className="stat-unit">{t('از {n} قسط', { n: formatNum(summaryMetrics.totalCount) })}</span>
              </div>
            </div>

            {/* Card 4: Next Upcoming Due */}
            <div className="portfolio-stat-card">
              <div className="stat-header">
                <span className="stat-label">{t('نزدیک‌ترین سررسید')}</span>
              </div>
              {summaryMetrics.nextUpcomingDue ? (
                <>
                  <div className="stat-number">{formatShamsiDisplay(summaryMetrics.nextUpcomingDue.dueDate)}</div>
                  <div className="stat-sub">
                    {summaryMetrics.nextUpcomingDue.loanTitle} • {t('{amount} تومان', { amount: formatMoney(summaryMetrics.nextUpcomingDue.totalAmount, hideValues) })}
                  </div>
                </>
              ) : (
                <div className="stat-sub">{t('سررسید معوقی وجود ندارد')}</div>
              )}
            </div>

            {/* Card 5: Total Principal Received */}
            <div className="portfolio-stat-card">
              <div className="stat-header">
                <span className="stat-label">{t('مجموع مبلغ دریافتی وام‌ها')}</span>
              </div>
              <div className="stat-number">
                {formatMoney(summaryMetrics.totalReceived, hideValues)}
                <span className="stat-unit">{t('تومان')}</span>
              </div>
              <div className="stat-sub">{t('مجموع اصل {n} وام ثبت‌شده', { n: loans.length.toLocaleString(intlLocale()) })}</div>
            </div>
          </div>
        }
      >
        {/* The bank groups are cards of their own: no card around them */}
        <div className="portfolio-table-card is-plain">
          <div className="table-card-body">
          {loadingLoans && loans.length === 0 ? (
            <SkeletonRows rows={4} columns={5} label={t('در حال دریافت لیست وام‌ها')} />
          ) : error && loans.length === 0 ? (
            <div className="loans-error-state">
              <AlertCircle size={20} />
              <span>{error}</span>
              <button type="button" onClick={fetchLoans} className="btn-retry">
                {t('تلاش مجدد')}
              </button>
            </div>
          ) : loans.length === 0 ? (
            <EmptyState
              icon={<Landmark size={48} className="text-amber-500" />}
              title={t('هنوز هیچ وامی ثبت نشده است')}
              description={t('با ثبت اولین وام، سیستم به طور خودکار جدول اقساط را محاسبه کرده و سررسیدها را پیگیری می‌کند.')}
              action={
                <button type="button" className="btn-primary" onClick={handleOpenAddModal}>
                  {t('افزودن اولین وام')}
                </button>
              }
            />
          ) : (
            <div className="loans-bank-groups">
              {settledCount > 0 && (
                <div className="loan-inst-filter-group">
                  <button
                    type="button"
                    className={`loan-inst-filter-btn ${showSettled ? 'active' : ''}`}
                    onClick={() => setShowSettled((v) => !v)}
                  >
                    {showSettled
                      ? t('پنهان کردن وام‌های تسویه‌شده ({n})', { n: settledCount.toLocaleString(intlLocale()) })
                      : t('نمایش وام‌های تسویه‌شده ({n})', { n: settledCount.toLocaleString(intlLocale()) })}
                  </button>
                </div>
              )}
              {visibleGroups.length === 0 && (
                <div className="stat-sub">{t('همه‌ی وام‌ها تسویه شده‌اند.')}</div>
              )}
              {visibleGroups.map((group) => (
                <div key={group.key} className="category-group-card">
                  <div className="category-group-header">
                    <div className="cat-header-identity">
                      <BankLogo bank={group.bank} size={34} />
                      <div className="cat-group-titles">
                        <h4 className="cat-group-name">{group.name}</h4>
                        <span className="cat-group-count">
                          {t('{n} وام', { n: group.items.length.toLocaleString(intlLocale()) })}
                        </span>
                      </div>
                    </div>
                    <div className="cat-header-subtotals">
                      {group.nextMonthTotal > 0 && (
                        <div className="cat-subtotal-val">
                          <span className="subtotal-label">{t('قسط ماه بعد:')}</span>
                          <strong className="subtotal-amount">{formatMoney(group.nextMonthTotal, hideValues)}</strong>
                          <span className="subtotal-unit">{t('تومان')}</span>
                        </div>
                      )}
                      <div className="cat-subtotal-val">
                        <span className="subtotal-label">{t('باقیمانده:')}</span>
                        <strong className="subtotal-amount">{formatMoney(group.totalRemaining, hideValues)}</strong>
                        <span className="subtotal-unit">{t('تومان')}</span>
                      </div>
                    </div>
                  </div>
                  <LoansTable
                    loans={group.items}
                    onSelectLoan={handleSelectLoan}
                    onEditLoan={handleOpenEditModal}
                    onDeleteLoan={handleDeleteLoan}
                    hideValues={hideValues}
                    readOnly={readOnly}
                  />
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      </SplitPageLayout>

      {/* Add / Edit Loan Modal */}
      <AddLoanForm
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingLoan(null);
          setLoanDraft(null);
        }}
        onSubmit={handleFormSubmit}
        editingLoan={editingLoan}
        draft={loanDraft}
        submitting={submitting}
      />

      {/* Loan Detail & Full Amortization Schedule Modal */}
      {selectedLoanId && (
        <LoanDetailModal
          loanId={selectedLoanId}
          onClose={handleCloseDetailModal}
          onRefreshLoans={fetchLoans}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}
