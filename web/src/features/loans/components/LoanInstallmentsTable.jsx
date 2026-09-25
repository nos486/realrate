import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  RotateCcw,
  AlertCircle,
  DollarSign,
  History,
  ListChecks,
} from 'lucide-react';
import { formatShamsiDisplay, getTodayShamsi, shamsiToGregorian } from '../../portfolio/components/ShamsiDatePicker.jsx';
import ShamsiDatePicker from '../../portfolio/components/ShamsiDatePicker.jsx';
import NumericInput from '../../../shared/ui/NumericInput.jsx';
import ExtraPaymentModal from './ExtraPaymentModal.jsx';
import BulkEditInstallmentsModal from './BulkEditInstallmentsModal.jsx';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { todayIso } from '../../../shared/utils/dates.js';

const formatAmount = (v) => Number(v || 0).toLocaleString('fa-IR');

export default function LoanInstallmentsTable({
  loan,
  installments = [],
  extraPayments = [],
  onMarkPaid,
  onUnmarkPaid,
  onAddExtraPayment,
  onBulkDistributeInstallments,
  submitting = false,
  hideValues = false,
}) {
  // Every number formatted here is an amount, so all follow the "hide values" toggle
  const formatNum = (v) => (hideValues ? '****' : formatAmount(v));
  const isDistributedMode = loan?.scheduleMode === 'distributed';

  // Extra payment modal state
  const [isExtraPayOpen, setIsExtraPayOpen] = useState(false);
  // Bulk edit ("ویرایش گروهی اقساط") modal state
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  // Active paying installment dialog state
  const [payingInstId, setPayingInstId] = useState(null);
  const [payDate, setPayDate] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payError, setPayError] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Filter tabs (all, pending, paid)
  const [activeFilter, setActiveFilter] = useState('all');

  const filteredInstallments = installments.filter((inst) => {
    if (activeFilter === 'pending') return !inst.isPaid;
    if (activeFilter === 'paid') return inst.isPaid;
    return true;
  });

  // Success message toast/banner state
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => {
      setSuccessMessage('');
    }, 5000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const handleOpenPayModal = (inst) => {
    setPayingInstId(inst.id);
    setPayDate(getTodayShamsi());
    setPayAmount(String(inst.totalAmount || ''));
    setPayError('');
    setSuccessMessage('');
  };

  const handleConfirmPay = async (inst) => {
    setPayError('');
    setSuccessMessage('');
    const cleanAmt = Number(String(payAmount).replace(/,/g, '').trim());
    if (isNaN(cleanAmt) || cleanAmt <= 0) {
      setPayError('لطفاً مبلغ پرداختی معتبر وارد نمایید.');
      return;
    }

    // Convert selected Shamsi payDate to ISO YYYY-MM-DD
    let isoDate = shamsiToGregorian(payDate);
    if (!isoDate) {
      isoDate = todayIso();
    }

    const priorUnpaid = installments.filter(
      (i) => i.installmentNumber < inst.installmentNumber && !i.isPaid
    );
    const shouldCascade = priorUnpaid.length > 0;

    try {
      setActionLoadingId(inst.id);
      const res = await onMarkPaid?.(inst.id, {
        paidDate: isoDate,
        paidAmount: cleanAmt,
        cascade: shouldCascade,
      });
      setPayingInstId(null);
      if (res?.cascadedCount > 0) {
        setSuccessMessage(`${res.cascadedCount} قسط قبلی نیز پرداخت‌شده ثبت شد.`);
      }
    } catch (err) {
      setPayError(err.message || 'خطا در ثبت پرداخت');
    } finally {
      setActionLoadingId(null);
    }
  };

  const { confirm, toast } = useFeedback();

  const handleUnmark = async (inst) => {
    const confirmed = await confirm({
      title: 'لغو پرداخت قسط',
      message: `آیا از لغو ثبت پرداخت قسط شماره ${inst.installmentNumber} اطمینان دارید؟`,
      confirmLabel: 'لغو پرداخت',
      danger: true,
    });
    if (!confirmed) return;
    try {
      setActionLoadingId(inst.id);
      await onUnmarkPaid?.(inst.id);
    } catch (err) {
      toast.error(err.message || 'خطا در لغو پرداخت');
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="loan-installments-container">
      {/* Top Filter Pills */}
      <div className="loan-inst-filter-row">
        <div className="loan-inst-filter-group">
          <button
            type="button"
            className={`loan-inst-filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            همه اقساط ({installments.length})
          </button>
          <button
            type="button"
            className={`loan-inst-filter-btn ${activeFilter === 'pending' ? 'active' : ''}`}
            onClick={() => setActiveFilter('pending')}
          >
            در انتظار ({installments.filter((i) => !i.isPaid).length})
          </button>
          <button
            type="button"
            className={`loan-inst-filter-btn ${activeFilter === 'paid' ? 'active' : ''}`}
            onClick={() => setActiveFilter('paid')}
          >
            پرداخت شده ({installments.filter((i) => i.isPaid).length})
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {loan && (
            <div className="loan-inst-summary-badge">
              <span>مانده کل:</span>
              <strong>{formatNum(loan.remainingBalance ?? 0)} تومان</strong>
            </div>
          )}

          {loan && Number(loan.remainingBalance ?? 0) > 0 && onBulkDistributeInstallments && (
            <button
              type="button"
              className="btn-extra-payment-trigger"
              onClick={() => setIsBulkEditOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(96, 165, 250, 0.15)',
                border: '1px solid rgba(96, 165, 250, 0.35)',
                color: '#60a5fa',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="مبلغ هر قسط را دستی تنظیم کنید؛ بقیه به‌طور خودکار و مساوی تقسیم می‌شوند"
            >
              <ListChecks size={14} />
              <span>ویرایش گروهی اقساط</span>
            </button>
          )}

          {loan && Number(loan.remainingBalance ?? 0) > 0 && onAddExtraPayment && !isDistributedMode && (
            <button
              type="button"
              className="btn-extra-payment-trigger"
              onClick={() => setIsExtraPayOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                color: '#f59e0b',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <DollarSign size={14} />
              <span>پرداخت اضافه / یکجا</span>
            </button>
          )}
        </div>
      </div>

      {isDistributedMode && (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          background: 'rgba(96, 165, 250, 0.08)',
          border: '1px solid rgba(96, 165, 250, 0.25)',
          borderRadius: '10px',
          padding: '10px 14px',
          margin: '0 0 14px 0',
          fontSize: '0.8rem',
          color: '#93c5fd',
        }}>
          <ListChecks size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>
            این وام با «سفارشی‌سازی و تقسیم مساوی اقساط» ساخته شده است. برای ویرایش مبلغ اقساط از «ویرایش گروهی اقساط» استفاده کنید — هر قسطی که در آن مشخص کنید ثابت می‌ماند و بقیه‌ی اقساطِ دست‌نخورده به‌طور خودکار و مساوی باقیمانده را تقسیم می‌کنند. پرداخت اضافه/یکجا برای این حالت در دسترس نیست.
          </span>
        </div>
      )}

      {successMessage && (
        <div
          style={{
            margin: '0 0 16px 0',
            padding: '10px 16px',
            borderRadius: '8px',
            background: 'rgba(34, 197, 94, 0.15)',
            border: '1px solid rgba(34, 197, 94, 0.35)',
            color: '#22c55e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.88rem',
            fontWeight: 500,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={16} />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage('')}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#22c55e',
              cursor: 'pointer',
              fontSize: '1rem',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Desktop Table View */}
      <div className="loan-inst-table-wrap">
        <table className="loan-inst-table">
          <thead>
            <tr>
              <th style={{ width: '60px' }}>قسط</th>
              <th>وضعیت</th>
              <th>تاریخ سررسید</th>
              <th>مبلغ قسط</th>
              <th>سهم اصل</th>
              <th>سهم سود</th>
              <th>مانده پس از قسط</th>
              <th style={{ minWidth: '150px' }}>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {filteredInstallments.map((inst) => {
              const isActionLoading = actionLoadingId === inst.id || submitting;
              const isPaying = payingInstId === inst.id;

              return (
                <tr
                  key={inst.id}
                  className={`loan-inst-row ${inst.isPaid ? 'is-paid' : 'is-pending'}`}
                >
                  <td className="col-num">
                    <span className="inst-num-badge">#{inst.installmentNumber}</span>
                  </td>

                  <td className="col-status">
                    {inst.isPaid ? (
                      <span className="badge-inst paid">
                        <CheckCircle2 size={13} />
                        پرداخت شده
                      </span>
                    ) : (
                      <span className="badge-inst pending">
                        <Clock size={13} />
                        در انتظار
                      </span>
                    )}
                  </td>

                  <td className="col-date">
                    <span className="shamsi-date">
                      {formatShamsiDisplay(inst.dueDate) || inst.dueDate}
                    </span>
                  </td>

                  <td className="col-total">
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                      <strong className="amount-primary">
                        {formatNum(inst.totalAmount)} <span className="unit">تومان</span>
                      </strong>
                      {Boolean(inst.isManualOverride) && (
                        <span className="badge-manual-override" title="مبلغ این قسط به‌صورت دستی تنظیم شده است">
                          ویرایش‌شده
                        </span>
                      )}
                      {Number(inst.feePortion) > 0 && (
                        <span
                          className="badge-manual-override"
                          title={`شامل ${formatNum(inst.feePortion)} تومان کارمزد سالانه`}
                        >
                          + کارمزد سالانه
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="col-principal">
                    <span className="amount-secondary">
                      {formatNum(inst.principalPortion)} تومان
                    </span>
                  </td>

                  <td className="col-interest">
                    <span className="amount-interest">
                      {inst.interestPortion > 0
                        ? `${formatNum(inst.interestPortion)} تومان`
                        : '۰ (بدون سود)'}
                    </span>
                  </td>

                  <td className="col-balance">
                    <span className="amount-balance">
                      {formatNum(inst.remainingBalanceAfter)} تومان
                    </span>
                  </td>

                  <td className="col-actions">
                    {inst.isPaid ? (
                      <div className="paid-actions-wrap">
                        <div className="paid-meta-text">
                          <span className="paid-date-badge">
                            {inst.paidDate ? formatShamsiDisplay(inst.paidDate) : 'پرداخت شده'}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="btn-unmark-paid"
                          onClick={() => handleUnmark(inst)}
                          disabled={isActionLoading}
                          title="لغو ثبت پرداخت"
                        >
                          <RotateCcw size={13} />
                          لغو
                        </button>
                      </div>
                    ) : (
                      <div className="pending-actions-wrap">
                        {isPaying ? (
                          <div className="inline-pay-box">
                            {payError && (
                              <div className="inline-pay-error">
                                <AlertCircle size={13} />
                                <span>{payError}</span>
                              </div>
                            )}

                            {(() => {
                              const priorUnpaid = installments.filter(
                                (i) => i.installmentNumber < inst.installmentNumber && !i.isPaid
                              );
                              if (priorUnpaid.length === 0) return null;
                              const priorTotal = priorUnpaid.reduce((sum, i) => sum + (Number(i.totalAmount) || 0), 0);
                              return (
                                <div style={{
                                  background: 'rgba(245, 158, 11, 0.12)',
                                  border: '1px solid rgba(245, 158, 11, 0.35)',
                                  borderRadius: '8px',
                                  padding: '8px 10px',
                                  fontSize: '0.74rem',
                                  color: '#fbbf24',
                                  lineHeight: 1.4,
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: '6px',
                                }}>
                                  <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                                  <span>
                                    با ثبت این پرداخت، {priorUnpaid.length} قسط قبلی (مجموعاً {formatNum(priorTotal)} تومان) هم خودکار پرداخت‌شده علامت می‌خورند (بر اساس تاریخ سررسید هرکدام).
                                  </span>
                                </div>
                              );
                            })()}

                            <div className="inline-pay-inputs" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <NumericInput
                                value={payAmount}
                                onValueChange={(val) => setPayAmount(val)}
                                placeholder="مبلغ پرداختی"
                                affix="تومان"
                                className="form-input pay-amount-input"
                              />

                              <ShamsiDatePicker
                                label="تاریخ پرداخت"
                                value={payDate}
                                onChange={(val) => setPayDate(val)}
                              />
                            </div>

                            <div className="inline-pay-buttons">
                              <button
                                type="button"
                                className="btn-pay-confirm"
                                onClick={() => handleConfirmPay(inst)}
                                disabled={isActionLoading}
                              >
                                {isActionLoading ? '...' : 'تأیید'}
                              </button>
                              <button
                                type="button"
                                className="btn-pay-cancel"
                                onClick={() => setPayingInstId(null)}
                                disabled={isActionLoading}
                              >
                                انصراف
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn-mark-paid"
                            onClick={() => handleOpenPayModal(inst)}
                            disabled={isActionLoading}
                          >
                            <CheckCircle2 size={14} />
                            پرداخت شد
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View (<768px) */}
      <div className="loan-inst-cards-mobile">
        {filteredInstallments.map((inst) => {
          const isActionLoading = actionLoadingId === inst.id || submitting;
          const isPaying = payingInstId === inst.id;

          return (
            <div
              key={inst.id}
              className={`loan-inst-mobile-card ${inst.isPaid ? 'paid' : 'pending'}`}
            >
              <div className="mobile-card-header">
                <div className="card-num-group">
                  <span className="inst-num-badge">#{inst.installmentNumber}</span>
                  <span className="shamsi-date">
                    سررسید: {formatShamsiDisplay(inst.dueDate) || inst.dueDate}
                  </span>
                </div>
                <div>
                  {inst.isPaid ? (
                    <span className="badge-inst paid">
                      <CheckCircle2 size={12} /> پرداخت شده
                    </span>
                  ) : (
                    <span className="badge-inst pending">
                      <Clock size={12} /> در انتظار
                    </span>
                  )}
                </div>
              </div>

              <div className="mobile-card-body">
                <div className="mobile-amount-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="label">مبلغ قسط:</span>
                    <strong className="value-highlight">
                      {formatNum(inst.totalAmount)} تومان
                    </strong>
                    {Boolean(inst.isManualOverride) && (
                      <span className="badge-manual-override">ویرایش‌شده</span>
                    )}
                    {Number(inst.feePortion) > 0 && (
                      <span
                        className="badge-manual-override"
                        title={`شامل ${formatNum(inst.feePortion)} تومان کارمزد سالانه`}
                      >
                        + کارمزد سالانه
                      </span>
                    )}
                  </div>
                </div>

                <div className="mobile-breakdown-row">
                  <span>اصل: {formatNum(inst.principalPortion)}</span>
                  <span>•</span>
                  <span>سود: {inst.interestPortion > 0 ? formatNum(inst.interestPortion) : '۰'}</span>
                  <span>•</span>
                  <span>مانده: {formatNum(inst.remainingBalanceAfter)}</span>
                </div>

                {inst.isPaid && (
                  <div className="mobile-paid-info">
                    <span>
                      پرداخت شده در: {inst.paidDate ? formatShamsiDisplay(inst.paidDate) : '—'}
                    </span>
                    <span>مبلغ: {formatNum(inst.paidAmount)} تومان</span>
                  </div>
                )}
              </div>

              <div className="mobile-card-footer">
                {inst.isPaid ? (
                  <button
                    type="button"
                    className="btn-unmark-paid mobile"
                    onClick={() => handleUnmark(inst)}
                    disabled={isActionLoading}
                  >
                    <RotateCcw size={13} />
                    لغو پرداخت
                  </button>
                ) : isPaying ? (
                  <div className="mobile-pay-popover">
                    {payError && (
                      <div className="inline-pay-error">
                        <AlertCircle size={13} />
                        <span>{payError}</span>
                      </div>
                    )}

                    {(() => {
                      const priorUnpaid = installments.filter(
                        (i) => i.installmentNumber < inst.installmentNumber && !i.isPaid
                      );
                      if (priorUnpaid.length === 0) return null;
                      const priorTotal = priorUnpaid.reduce((sum, i) => sum + (Number(i.totalAmount) || 0), 0);
                      return (
                        <div style={{
                          background: 'rgba(245, 158, 11, 0.12)',
                          border: '1px solid rgba(245, 158, 11, 0.35)',
                          borderRadius: '8px',
                          padding: '8px 10px',
                          fontSize: '0.74rem',
                          color: '#fbbf24',
                          lineHeight: 1.4,
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '6px',
                        }}>
                          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                          <span>
                            با ثبت این پرداخت، {priorUnpaid.length} قسط قبلی (مجموعاً {formatNum(priorTotal)} تومان) هم خودکار پرداخت‌شده علامت می‌خورند (بر اساس تاریخ سررسید هرکدام).
                          </span>
                        </div>
                      );
                    })()}

                    <NumericInput
                      value={payAmount}
                      onValueChange={(val) => setPayAmount(val)}
                      placeholder="مبلغ پرداختی"
                      affix="تومان"
                      className="form-input"
                    />

                    <ShamsiDatePicker
                      label="تاریخ پرداخت"
                      value={payDate}
                      onChange={(val) => setPayDate(val)}
                    />

                    <div className="inline-pay-buttons">
                      <button
                        type="button"
                        className="btn-pay-confirm"
                        onClick={() => handleConfirmPay(inst)}
                        disabled={isActionLoading}
                      >
                        {isActionLoading ? 'در حال ثبت...' : 'تأیید پرداخت'}
                      </button>
                      <button
                        type="button"
                        className="btn-pay-cancel"
                        onClick={() => setPayingInstId(null)}
                      >
                        انصراف
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn-mark-paid mobile"
                    onClick={() => handleOpenPayModal(inst)}
                    disabled={isActionLoading}
                  >
                    <CheckCircle2 size={14} />
                    ثبت پرداخت این قسط
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Extra Payments History Section (فاز D) */}
      {extraPayments && extraPayments.length > 0 && (
        <div className="loan-extra-payments-history" style={{
          marginTop: '20px',
          padding: '16px',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <History size={16} className="text-amber-500" />
            <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#f8fafc' }}>
              تاریخچه پرداخت‌های اضافه / یکجا ({extraPayments.length})
            </h4>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {extraPayments.map((ep) => (
              <div
                key={ep.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                  padding: '10px 12px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '8px',
                  fontSize: '0.82rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: '0.92rem' }}>
                    {formatNum(ep.amount)} تومان
                  </span>
                  <span style={{
                    fontSize: '0.72rem',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    background: ep.reductionMode === 'reduce_term' ? 'rgba(192, 132, 252, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                    color: ep.reductionMode === 'reduce_term' ? '#c084fc' : '#38bdf8',
                    border: `1px solid ${ep.reductionMode === 'reduce_term' ? 'rgba(192, 132, 252, 0.3)' : 'rgba(56, 189, 248, 0.3)'}`,
                  }}>
                    {ep.reductionMode === 'reduce_term' ? 'کاهش مدت وام' : 'کاهش مبلغ اقساط'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#94a3b8' }}>
                  {ep.notes && (
                    <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                      «{ep.notes}»
                    </span>
                  )}
                  <span>
                    تاریخ: {ep.paymentDate ? formatShamsiDisplay(ep.paymentDate) : '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Extra Payment Modal */}
      {isExtraPayOpen && (
        <ExtraPaymentModal
          isOpen={isExtraPayOpen}
          onClose={() => setIsExtraPayOpen(false)}
          loan={loan}
          onSubmit={onAddExtraPayment}
          submitting={submitting}
        />
      )}

      {isBulkEditOpen && (
        <BulkEditInstallmentsModal
          isOpen={isBulkEditOpen}
          onClose={() => setIsBulkEditOpen(false)}
          loan={loan}
          onSubmit={onBulkDistributeInstallments}
          submitting={submitting}
        />
      )}
    </div>
  );
}
