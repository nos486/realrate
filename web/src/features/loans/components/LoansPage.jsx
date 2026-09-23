/**
 * LoansPage.jsx — Main Loans Dashboard & Installment Tracker
 *
 * Features:
 * - Summary cards: Total remaining debt, active loans, paid installments ratio, next upcoming payment
 * - Interactive loan cards list
 * - Add/Edit modal with live amortization preview
 * - Loan details dialog with interactive full installment schedule & payment toggling
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Landmark,
  Plus,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useLoansContext } from '../context/LoansContext.jsx';
import { useLoanDetail } from '../hooks/useLoanDetail.js';
import LoansTable from './LoansTable.jsx';
import AddLoanForm from './AddLoanForm.jsx';
import LoanInstallmentsTable from './LoanInstallmentsTable.jsx';
import LoanCsvExportButton from './LoanCsvExportButton.jsx';
import LoanCsvImportButton from './LoanCsvImportButton.jsx';
import Modal from '../../../shared/ui/Modal.jsx';
import EmptyState from '../../../shared/ui/EmptyState.jsx';
import FeaturePageHeader from '../../../shared/ui/FeaturePageHeader.jsx';
import SplitPageLayout from '../../../shared/ui/SplitPageLayout.jsx';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { getDisplayRatePct } from '../../../utils/loanCalculator.js';
import { appPath } from '../../../shared/routes.js';

const formatNum = (v) => Number(v || 0).toLocaleString('fa-IR');

/**
 * Isolated Modal Wrapper for Single Loan Detail & Schedule
 */
function LoanDetailModal({ loanId, onClose, onRefreshLoans }) {
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
      title={loan ? loan.title : 'جدول اقساط وام'}
      subtitle={
        loan
          ? `${loan.lenderName ? `وام‌دهنده: ${loan.lenderName} • ` : ''}اصل: ${formatNum(loan.principalAmount)} تومان • سود: ${getDisplayRatePct(loan)}٪${Number(loan.annualFeeAmount) > 0 ? ` • کارمزد سالانه: ${formatNum(loan.annualFeeAmount)} تومان` : ''}`
          : 'در حال دریافت اطلاعات...'
      }
      icon={<Landmark size={20} className="text-amber-500" />}
      maxWidth="min(1320px, 94vw)"
      className="loan-detail-modal-wide"
    >
      {loading && !loan ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
          در حال بارگذاری جدول اقساط...
        </div>
      ) : error ? (
        <div className="form-error-banner" style={{ margin: '20px 0' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      ) : loan ? (
        <div style={{ padding: '4px 0' }}>
          <LoanInstallmentsTable
            loan={loan}
            installments={loan.installments || []}
            extraPayments={extraPayments || []}
            onMarkPaid={handleMarkPaid}
            onUnmarkPaid={handleUnmarkPaid}
            onAddExtraPayment={handleAddExtraPayment}
            onBulkDistributeInstallments={handleBulkDistributeInstallments}
            submitting={submitting}
          />
        </div>
      ) : null}
    </Modal>
  );
}

export default function LoansPage({ initialLoanId = null }) {
  const {
    loans,
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

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState(null);
  const [selectedLoanId, setSelectedLoanId] = useState(initialLoanId);

  useEffect(() => {
    setSelectedLoanId(initialLoanId || null);
  }, [initialLoanId]);

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

  // 2. Group loans by bank/lender — loans sharing the same lender name are shown
  // together under one header; loans with no lender name fall into a shared bucket.
  // Sorted by remaining balance so the heaviest debts surface first.
  const bankGroups = useMemo(() => {
    const order = [];
    const groups = new Map();
    for (const loan of loans) {
      const bankName = (loan.lenderName || '').trim();
      const key = bankName || '__none__';
      if (!groups.has(key)) {
        const group = { key, name: bankName || 'بدون بانک مشخص', items: [] };
        groups.set(key, group);
        order.push(group);
      }
      groups.get(key).items.push(loan);
    }
    return order
      .map((group) => ({
        ...group,
        totalRemaining: group.items.reduce((acc, l) => acc + Number(l.remainingBalance ?? 0), 0),
        // Sum of each loan's next unpaid installment amount, as the bank's upcoming
        // payment burden — same simplification the overall "monthly installment" stat uses.
        nextMonthTotal: group.items.reduce(
          (acc, l) => acc + (l.nextDueInstallment ? Number(l.nextDueInstallment.totalAmount || 0) : 0),
          0
        ),
      }))
      .sort((a, b) => b.totalRemaining - a.totalRemaining);
  }, [loans]);

  // Handlers
  const handleOpenAddModal = () => {
    setEditingLoan(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (loan) => {
    setEditingLoan(loan);
    setIsAddModalOpen(true);
  };

  const handleDeleteLoan = async (loanId) => {
    const loan = loans.find((l) => l.id === loanId);
    const name = loan ? `«${loan.title}»` : 'این وام';
    if (!window.confirm(`آیا از حذف وام ${name} و تمام اقساط آن اطمینان دارید؟`)) {
      return;
    }
    try {
      await deleteLoan(loanId);
      if (selectedLoanId === loanId) {
        handleCloseDetailModal();
      }
    } catch (err) {
      alert(err.message || 'خطا در حذف وام');
    }
  };

  const handleFormSubmit = async (formData) => {
    if (editingLoan) {
      await updateLoan(editingLoan.id, formData);
    } else {
      await addLoan(formData);
    }
  };

  // Login is guaranteed by MainPage's site-wide auth gate before this component renders.

  return (
    <div className="loans-page-container">
      <FeaturePageHeader
        icon={<Landmark size={24} />}
        title="مدیریت وام‌ها و اقساط"
        subtitle="برنامه استهلاک بانکی، جدول سررسید و ثبت تسویه اقساط"
        actions={
          <>
            <LoanCsvExportButton loans={loans} disabled={loans.length === 0} />
            <LoanCsvImportButton addLoan={addLoan} />
            <button type="button" className="btn-add-loan" onClick={handleOpenAddModal}>
              <Plus size={18} />
              <span>افزودن وام جدید</span>
            </button>
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
                <span className="stat-label">مجموع بدهی باقیمانده</span>
              </div>
              <div className="stat-number gold-gradient-text">
                {formatNum(summaryMetrics.totalDebt)}
                <span className="stat-unit">تومان</span>
              </div>
              <div className="stat-sub">{summaryMetrics.activeLoans.toLocaleString('fa-IR')} وام فعال</div>
            </div>

            {/* Card 2: Total Monthly Installment */}
            <div className="portfolio-stat-card">
              <div className="stat-header">
                <span className="stat-label">مجموع قسط ماهانه</span>
              </div>
              <div className="stat-number">
                {formatNum(summaryMetrics.totalMonthlyInstallment)}
                <span className="stat-unit">تومان</span>
              </div>
            </div>

            {/* Card 3: Paid Installments Ratio */}
            <div className="portfolio-stat-card">
              <div className="stat-header">
                <span className="stat-label">کل اقساط پرداخت‌شده</span>
                <span className="count-pill">{formatNum(summaryMetrics.overallProgress)}٪</span>
              </div>
              <div className="stat-number">
                {formatNum(summaryMetrics.totalPaidCount)}
                <span className="stat-unit">از {formatNum(summaryMetrics.totalCount)} قسط</span>
              </div>
            </div>

            {/* Card 4: Next Upcoming Due */}
            <div className="portfolio-stat-card">
              <div className="stat-header">
                <span className="stat-label">نزدیک‌ترین سررسید</span>
              </div>
              {summaryMetrics.nextUpcomingDue ? (
                <>
                  <div className="stat-number">{formatShamsiDisplay(summaryMetrics.nextUpcomingDue.dueDate)}</div>
                  <div className="stat-sub">
                    {summaryMetrics.nextUpcomingDue.loanTitle} • {formatNum(summaryMetrics.nextUpcomingDue.totalAmount)} تومان
                  </div>
                </>
              ) : (
                <div className="stat-sub">سررسید معوقی وجود ندارد</div>
              )}
            </div>

            {/* Card 5: Total Principal Received */}
            <div className="portfolio-stat-card">
              <div className="stat-header">
                <span className="stat-label">مجموع مبلغ دریافتی وام‌ها</span>
              </div>
              <div className="stat-number">
                {formatNum(summaryMetrics.totalReceived)}
                <span className="stat-unit">تومان</span>
              </div>
              <div className="stat-sub">مجموع اصل {loans.length.toLocaleString('fa-IR')} وام ثبت‌شده</div>
            </div>
          </div>
        }
      >
        <div className="portfolio-table-card">
          <div className="portfolio-table-header">
            <div className="table-title">
              <div className="table-title-main">
                <h3>لیست وام‌ها</h3>
              </div>
            </div>
          </div>
          <div className="table-card-body">
          {loadingLoans && loans.length === 0 ? (
            <div className="loans-loading-state">
              <RefreshCw size={24} className="animate-spin text-amber-500" />
              <span>در حال دریافت لیست وام‌ها...</span>
            </div>
          ) : error && loans.length === 0 ? (
            <div className="loans-error-state">
              <AlertCircle size={20} />
              <span>{error}</span>
              <button type="button" onClick={fetchLoans} className="btn-retry">
                تلاش مجدد
              </button>
            </div>
          ) : loans.length === 0 ? (
            <EmptyState
              icon={<Landmark size={48} className="text-amber-500" />}
              title="هنوز هیچ وامی ثبت نشده است"
              description="با ثبت اولین وام، سیستم به طور خودکار جدول اقساط را محاسبه کرده و سررسیدها را پیگیری می‌کند."
              action={
                <button type="button" className="btn-primary" onClick={handleOpenAddModal}>
                  افزودن اولین وام
                </button>
              }
            />
          ) : (
            <div className="loans-bank-groups">
              {bankGroups.map((group) => (
                <div key={group.key} className="category-group-card">
                  <div className="category-group-header">
                    <div className="cat-header-identity">
                      <span className="cat-group-icon">
                        <Landmark size={20} />
                      </span>
                      <div className="cat-group-titles">
                        <h4 className="cat-group-name">{group.name}</h4>
                        <span className="cat-group-count">
                          {group.items.length.toLocaleString('fa-IR')} وام
                        </span>
                      </div>
                    </div>
                    <div className="cat-header-subtotals">
                      {group.nextMonthTotal > 0 && (
                        <div className="cat-subtotal-val">
                          <span className="subtotal-label">قسط ماه بعد:</span>
                          <strong className="subtotal-amount">{formatNum(group.nextMonthTotal)}</strong>
                          <span className="subtotal-unit">تومان</span>
                        </div>
                      )}
                      <div className="cat-subtotal-val">
                        <span className="subtotal-label">باقیمانده:</span>
                        <strong className="subtotal-amount">{formatNum(group.totalRemaining)}</strong>
                        <span className="subtotal-unit">تومان</span>
                      </div>
                    </div>
                  </div>
                  <LoansTable
                    loans={group.items}
                    onSelectLoan={handleSelectLoan}
                    onEditLoan={handleOpenEditModal}
                    onDeleteLoan={handleDeleteLoan}
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
        }}
        onSubmit={handleFormSubmit}
        editingLoan={editingLoan}
        submitting={submitting}
      />

      {/* Loan Detail & Full Amortization Schedule Modal */}
      {selectedLoanId && (
        <LoanDetailModal
          loanId={selectedLoanId}
          onClose={handleCloseDetailModal}
          onRefreshLoans={fetchLoans}
        />
      )}
    </div>
  );
}
