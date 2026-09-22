/**
 * BulkEditInstallmentsModal.jsx — Re-plan every PENDING installment's amount at once
 *
 * Any subset of pending installments may be given a known/fixed amount; every other pending
 * installment — both before and after the touched ones — equally divides whatever's left of the
 * loan's expected total repayment (see distributeInstallmentAmounts). Already-paid installments
 * are shown as frozen/read-only and excluded from the split. Saving switches the loan into
 * "distributed" schedule mode (dbBulkDistributeInstallments), after which the ordinary single
 * pencil-icon edit and extra-payment flows are disabled in favor of reopening this panel.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, ListChecks } from 'lucide-react';
import Modal from '../../../shared/ui/Modal.jsx';
import NumericInput from '../../../shared/ui/NumericInput.jsx';
import { gregorianToShamsi } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { distributeInstallmentAmounts } from '../../../utils/loanCalculator.js';

const formatNum = (v) => Number(v || 0).toLocaleString('fa-IR');

export default function BulkEditInstallmentsModal({
  isOpen,
  onClose,
  loan,
  onSubmit,
  submitting = false,
}) {
  const [customAmounts, setCustomAmounts] = useState({});
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setCustomAmounts({});
    setFormError('');
  }, [isOpen, loan?.id]);

  const paidInstallments = useMemo(
    () => (loan?.installments || []).filter((i) => i.isPaid),
    [loan]
  );

  const result = useMemo(() => {
    if (!loan) return { schedule: [], error: null };
    const knownAmounts = Object.entries(customAmounts).reduce((map, [num, val]) => {
      const amt = Number(String(val || '').replace(/,/g, '').trim());
      if (amt > 0) map[num] = amt;
      return map;
    }, {});
    try {
      return {
        schedule: distributeInstallmentAmounts({ loan, paidInstallments, knownAmounts }),
        error: null,
      };
    } catch (err) {
      return { schedule: [], error: err.message || 'محاسبه ممکن نشد.' };
    }
  }, [loan, paidInstallments, customAmounts]);

  const pendingRows = result.schedule.filter((i) => !i.isPaid);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (result.error) {
      setFormError(result.error);
      return;
    }
    if (pendingRows.length === 0) {
      setFormError('هیچ قسط در‌انتظاری برای ویرایش وجود ندارد.');
      return;
    }

    const knownAmounts = Object.entries(customAmounts).reduce((map, [num, val]) => {
      const amt = Number(String(val || '').replace(/,/g, '').trim());
      if (amt > 0) map[num] = amt;
      return map;
    }, {});

    try {
      await onSubmit?.(knownAmounts);
      onClose();
    } catch (err) {
      setFormError(err.message || 'خطا در ثبت ویرایش گروهی اقساط');
    }
  };

  if (!loan) return null;

  const footerActions = (
    <div className="modal-actions">
      <button type="button" className="btn-cancel" onClick={onClose} disabled={submitting}>
        انصراف
      </button>
      <button
        type="submit"
        className="btn-primary"
        disabled={submitting || Boolean(result.error) || pendingRows.length === 0}
        style={{ minWidth: '130px' }}
      >
        {submitting ? 'در حال ذخیره...' : 'ذخیره‌ی برنامه‌ی جدید اقساط'}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="ویرایش گروهی اقساط"
      subtitle="مبلغ هر قسطی که می‌خواهید را تغییر دهید — بقیه‌ی اقساط دست‌نخورده (چه قبل چه بعد) به‌طور خودکار و مساوی از باقیمانده سهم می‌گیرند"
      icon={<ListChecks size={20} className="text-amber-500" />}
      footer={footerActions}
      onSubmit={handleSubmit}
      maxWidth="720px"
    >
      <div style={{ padding: '4px 0' }}>
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
            gap: '8px',
          }}>
            <AlertCircle size={16} />
            <span>{formError}</span>
          </div>
        )}

        <div style={{
          maxHeight: '420px',
          overflowY: 'auto',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '8px',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, background: 'rgba(15, 23, 42, 0.95)' }}>
                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#94a3b8', fontWeight: 600 }}>قسط</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#94a3b8', fontWeight: 600 }}>سررسید</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#94a3b8', fontWeight: 600 }}>مبلغ (تومان)</th>
              </tr>
            </thead>
            <tbody>
              {paidInstallments.map((inst) => (
                <tr key={inst.id} style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', opacity: 0.55 }}>
                  <td style={{ padding: '5px 8px', color: '#e2e8f0' }}>{formatNum(inst.installmentNumber)}</td>
                  <td style={{ padding: '5px 8px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                    {gregorianToShamsi(inst.dueDate)}
                  </td>
                  <td style={{ padding: '5px 8px', color: '#94a3b8' }}>
                    {formatNum(inst.totalAmount)} <span style={{ fontSize: '0.72rem' }}>(پرداخت‌شده)</span>
                  </td>
                </tr>
              ))}
              {pendingRows.map((inst) => (
                <tr key={inst.installmentNumber} style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <td style={{ padding: '5px 8px', color: '#e2e8f0' }}>{formatNum(inst.installmentNumber)}</td>
                  <td style={{ padding: '5px 8px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                    {gregorianToShamsi(inst.dueDate)}
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <NumericInput
                      value={customAmounts[inst.installmentNumber] ?? String(inst.totalAmount)}
                      onValueChange={(val) =>
                        setCustomAmounts((prev) => {
                          const next = { ...prev };
                          if (val) next[inst.installmentNumber] = val;
                          else delete next[inst.installmentNumber];
                          return next;
                        })
                      }
                      className={`form-input${customAmounts[inst.installmentNumber] !== undefined ? ' input-touched' : ''}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pendingRows.length === 0 && !result.error && (
          <span style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginTop: '10px' }}>
            هیچ قسط در‌انتظاری برای ویرایش وجود ندارد.
          </span>
        )}
      </div>
    </Modal>
  );
}
