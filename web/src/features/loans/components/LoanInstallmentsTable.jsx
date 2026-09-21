/**
 * LoanInstallmentsTable.jsx — Full Amortization Schedule & Installment Payments Table
 */

import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  RotateCcw,
  Calendar,
  CreditCard,
  ChevronDown,
  X,
  AlertCircle,
} from 'lucide-react';
import { gregorianToShamsi, getTodayShamsi } from '../../portfolio/components/ShamsiDatePicker.jsx';
import NumericInput from '../../../shared/ui/NumericInput.jsx';

const formatNum = (v) => Number(v || 0).toLocaleString('fa-IR');

export default function LoanInstallmentsTable({
  loan,
  installments = [],
  onMarkPaid,
  onUnmarkPaid,
  submitting = false,
}) {
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

  const handleOpenPayModal = (inst) => {
    setPayingInstId(inst.id);
    setPayDate(getTodayShamsi());
    setPayAmount(String(inst.totalAmount || ''));
    setPayError('');
  };

  const handleConfirmPay = async (inst) => {
    setPayError('');
    const cleanAmt = Number(String(payAmount).replace(/,/g, '').trim());
    if (isNaN(cleanAmt) || cleanAmt <= 0) {
      setPayError('لطفاً مبلغ پرداختی معتبر وارد نمایید.');
      return;
    }

    try {
      setActionLoadingId(inst.id);
      const isoDate = new Date().toISOString().split('T')[0];
      await onMarkPaid?.(inst.id, {
        paidDate: isoDate,
        paidAmount: cleanAmt,
      });
      setPayingInstId(null);
    } catch (err) {
      setPayError(err.message || 'خطا در ثبت پرداخت');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleUnmark = async (inst) => {
    if (!window.confirm(`آیا از لغو ثبت پرداخت قسط شماره ${inst.installmentNumber} اطمینان دارید؟`)) {
      return;
    }
    try {
      setActionLoadingId(inst.id);
      await onUnmarkPaid?.(inst.id);
    } catch (err) {
      alert(err.message || 'خطا در لغو پرداخت');
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

        {loan && (
          <div className="loan-inst-summary-badge">
            <span>مانده کل:</span>
            <strong>{formatNum(loan.remainingBalance ?? 0)} تومان</strong>
          </div>
        )}
      </div>

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
                      {gregorianToShamsi(inst.dueDate) || inst.dueDate}
                    </span>
                  </td>

                  <td className="col-total">
                    <strong className="amount-primary">
                      {formatNum(inst.totalAmount)} <span className="unit">تومان</span>
                    </strong>
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
                            {inst.paidDate ? gregorianToShamsi(inst.paidDate) : 'پرداخت شده'}
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
                            <div className="inline-pay-inputs">
                              <NumericInput
                                value={payAmount}
                                onValueChange={(val) => setPayAmount(val)}
                                placeholder="مبلغ پرداختی"
                                affix="تومان"
                                className="form-input pay-amount-input"
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
                    سررسید: {gregorianToShamsi(inst.dueDate) || inst.dueDate}
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
                <div className="mobile-amount-row">
                  <span className="label">مبلغ قسط:</span>
                  <strong className="value-highlight">
                    {formatNum(inst.totalAmount)} تومان
                  </strong>
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
                      پرداخت شده در: {inst.paidDate ? gregorianToShamsi(inst.paidDate) : '—'}
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
                    <NumericInput
                      value={payAmount}
                      onValueChange={(val) => setPayAmount(val)}
                      placeholder="مبلغ پرداختی"
                      affix="تومان"
                      className="form-input"
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
    </div>
  );
}
