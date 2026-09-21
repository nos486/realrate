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
import {
  Landmark,
  Plus,
  CheckCircle2,
  Clock,
  AlertCircle,
  Calendar,
  RefreshCw,
  Wallet,
  Lock,
  Cloud,
} from 'lucide-react';
import { useAuth } from '../../auth/index.js';
import { useLoans } from '../hooks/useLoans.js';
import { useLoanDetail } from '../hooks/useLoanDetail.js';
import LoansTable from './LoansTable.jsx';
import AddLoanForm from './AddLoanForm.jsx';
import LoanInstallmentsTable from './LoanInstallmentsTable.jsx';
import Modal from '../../../shared/ui/Modal.jsx';
import EmptyState from '../../../shared/ui/EmptyState.jsx';
import { gregorianToShamsi } from '../../portfolio/components/ShamsiDatePicker.jsx';

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
    setInstallmentAmount,
    addExtraPayment,
  } = useLoanDetail(loanId);

  const handleMarkPaid = async (installmentId, details) => {
    await markPaid(installmentId, details);
    onRefreshLoans?.();
  };

  const handleUnmarkPaid = async (installmentId) => {
    await unmarkPaid(installmentId);
    onRefreshLoans?.();
  };

  const handleSetInstallmentAmount = async (installmentId, newAmount) => {
    const res = await setInstallmentAmount(installmentId, newAmount);
    onRefreshLoans?.();
    return res;
  };

  const handleAddExtraPayment = async (paymentData) => {
    const res = await addExtraPayment(paymentData);
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
          ? `${loan.lenderName ? `وام‌دهنده: ${loan.lenderName} • ` : ''}اصل: ${formatNum(loan.principalAmount)} تومان • سود: ${loan.annualInterestRate === 0 ? 'قرض‌الحسنه' : `${loan.annualInterestRate}٪`}`
          : 'در حال دریافت اطلاعات...'
      }
      icon={<Landmark size={20} className="text-amber-500" />}
      maxWidth="900px"
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
            onSetInstallmentAmount={handleSetInstallmentAmount}
            onAddExtraPayment={handleAddExtraPayment}
            submitting={submitting}
          />
        </div>
      ) : null}
    </Modal>
  );
}

export default function LoansPage({ initialLoanId = null }) {
  const { user, loading: authLoading, triggerLogin } = useAuth();
  const {
    loans,
    loadingLoans,
    submitting,
    error,
    fetchLoans,
    addLoan,
    updateLoan,
    deleteLoan,
  } = useLoans();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState(null);
  const [selectedLoanId, setSelectedLoanId] = useState(initialLoanId);

  useEffect(() => {
    if (initialLoanId) {
      setSelectedLoanId(initialLoanId);
    }
  }, [initialLoanId]);

  // 1. Overall Aggregated Metrics
  const summaryMetrics = useMemo(() => {
    let totalDebt = 0;
    let activeLoans = 0;
    let totalPaidCount = 0;
    let totalCount = 0;
    let nextUpcomingDue = null;

    for (const l of loans) {
      const rem = Number(l.remainingBalance ?? 0);
      totalDebt += rem;
      if (rem > 0) activeLoans++;
      totalPaidCount += Number(l.paidCount ?? 0);
      totalCount += Number(l.totalCount || l.installmentCount || 0);

      if (l.nextDueInstallment && l.nextDueInstallment.dueDate) {
        if (!nextUpcomingDue || l.nextDueInstallment.dueDate < nextUpcomingDue.dueDate) {
          nextUpcomingDue = {
            ...l.nextDueInstallment,
            loanTitle: l.title,
          };
        }
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
    };
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

  // ─── AUTH GATE (Required Login Screen for Guests) ────────────────────────
  if (authLoading) {
    return (
      <div className="portfolio-loading-state">
        <div className="spinner-glow"></div>
        <p>در حال بارگذاری اطلاعات کاربری...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="portfolio-auth-gate">
        <div className="auth-gate-card">
          <div className="auth-gate-badge">
            <span className="lock-icon">
              <Lock size={15} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
            </span>
            <span className="badge-text">نیازمند ورود به حساب کاربری</span>
          </div>

          <h3 className="auth-gate-title">مدیریت هوشمند وام‌ها و اقساط</h3>
          <p className="auth-gate-desc">
            اطلاعات وام‌ها و جدول استهلاک اقساط به صورت امن در حساب کاربری شما ذخیره شده و سررسید اقساط پیش‌رو به طور هوشمند یادآوری می‌شود.
          </p>

          <div className="auth-gate-features">
            <div className="gate-feature-item">
              <span className="feature-icon"><Landmark size={18} /></span>
              <div className="feature-info">
                <strong>محاسبه استهلاک بانکی</strong>
                <span>محاسبه دقیق اقساط، سهم اصل و سود با فرمول استاندارد</span>
              </div>
            </div>
            <div className="gate-feature-item">
              <span className="feature-icon"><Calendar size={18} /></span>
              <div className="feature-info">
                <strong>یادآوری خودکار سررسید</strong>
                <span>هشدار اقساط نزدیک در ۷ روز آینده و اقساط معوق</span>
              </div>
            </div>
            <div className="gate-feature-item">
              <span className="feature-icon"><CheckCircle2 size={18} /></span>
              <div className="feature-info">
                <strong>ثبت و پیگیری پرداخت‌ها</strong>
                <span>ثبت آسان وضعیت تسویه هر قسط و مشاهده مانده کل بدهی</span>
              </div>
            </div>
            <div className="gate-feature-item">
              <span className="feature-icon"><Cloud size={18} /></span>
              <div className="feature-info">
                <strong>ذخیره ابری و امن</strong>
                <span>دسترسی همیشگی به برنامه‌ی اقساط از تمام دستگاه‌ها</span>
              </div>
            </div>
          </div>

          <div className="auth-gate-actions">
            <button className="btn-google-gate-login" onClick={triggerLogin}>
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>ورود با گوگل</span>
            </button>
            <span className="gate-privacy-note">
              <Lock size={12} style={{ verticalAlign: 'middle', marginLeft: '4px', display: 'inline' }} />
              اطلاعات وام‌های شما کاملاً شخصی و محرمانه است.
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="loans-page-container">
      {/* Top Header & Action Row */}
      <div className="loans-header-bar">
        <div className="loans-header-title-wrap">
          <div className="loans-header-icon">
            <Landmark size={24} />
          </div>
          <div>
            <h1 className="loans-page-title">مدیریت وام‌ها و اقساط</h1>
            <p className="loans-page-subtitle">
              برنامه استهلاک بانکی، جدول سررسید و ثبت تسویه اقساط
            </p>
          </div>
        </div>

        <div className="loans-header-actions">
          <button
            type="button"
            className="btn-add-loan"
            onClick={handleOpenAddModal}
          >
            <Plus size={18} />
            <span>افزودن وام جدید</span>
          </button>
        </div>
      </div>

      {/* Overview Statistics Cards */}
      <div className="loans-stats-grid">
        {/* Card 1: Total Remaining Debt */}
        <div className="loan-stat-card primary">
          <div className="stat-icon-wrap debt">
            <Wallet size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">مجموع بدهی باقیمانده</span>
            <strong className="stat-value highlight">
              {formatNum(summaryMetrics.totalDebt)}{' '}
              <span className="stat-unit">تومان</span>
            </strong>
          </div>
        </div>

        {/* Card 2: Active Loans Count */}
        <div className="loan-stat-card">
          <div className="stat-icon-wrap count">
            <Landmark size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">تعداد وام‌های فعال</span>
            <strong className="stat-value">
              {formatNum(summaryMetrics.activeLoans)}{' '}
              <span className="stat-sub">از {formatNum(loans.length)} وام</span>
            </strong>
          </div>
        </div>

        {/* Card 3: Paid Installments Ratio */}
        <div className="loan-stat-card">
          <div className="stat-icon-wrap progress">
            <CheckCircle2 size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">کل اقساط پرداخت شده</span>
            <strong className="stat-value">
              {formatNum(summaryMetrics.totalPaidCount)}{' '}
              <span className="stat-sub">از {formatNum(summaryMetrics.totalCount)} قسط ({formatNum(summaryMetrics.overallProgress)}٪)</span>
            </strong>
          </div>
        </div>

        {/* Card 4: Next Upcoming Due */}
        <div className="loan-stat-card">
          <div className="stat-icon-wrap due">
            <Clock size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">نزدیک‌ترین سررسید</span>
            {summaryMetrics.nextUpcomingDue ? (
              <div className="stat-due-details">
                <strong className="stat-value due">
                  {gregorianToShamsi(summaryMetrics.nextUpcomingDue.dueDate)}
                </strong>
                <span className="stat-due-sub">
                  {summaryMetrics.nextUpcomingDue.loanTitle} • {formatNum(summaryMetrics.nextUpcomingDue.totalAmount)} تومان
                </span>
              </div>
            ) : (
              <span className="stat-empty-text">سررسید معوقی وجود ندارد</span>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
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
          actionText="افزودن اولین وام"
          onAction={handleOpenAddModal}
        />
      ) : (
        <LoansTable
          loans={loans}
          onSelectLoan={(l) => setSelectedLoanId(l.id)}
          onEditLoan={handleOpenEditModal}
          onDeleteLoan={handleDeleteLoan}
        />
      )}

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
          onClose={() => setSelectedLoanId(null)}
          onRefreshLoans={fetchLoans}
        />
      )}
    </div>
  );
}
