/**
 * LoanInstallmentSheet.jsx — «قسط وام»: a bank withdrawal that paid the installments of one or several loans
 *
 * One deduction can cover more than one loan, so the loans are ticked, each with the installment
 * it pays (its next one). The withdrawal is recorded as ONE expense naming every ticked
 * installment, and each loan marks its installment paid at its own amount; nothing else is
 * recorded for them.
 */

import { t, intlLocale } from '../../utils/i18n.js';
import React, { useMemo, useState } from 'react';
import { Landmark, Check } from 'lucide-react';
import { Button, Modal } from '../../shared/ui/index.js';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { useOptionalLoans } from '../loans/context/LoansContext.jsx';
import { recordSmsLoanInstallments } from './smsRecord.js';
import { formatAmount } from '../expenses/utils/format.js';

export default function LoanInstallmentSheet({ item, onClose }) {
  const { toast } = useFeedback();
  const loans = useOptionalLoans().filter((l) => l.nextDueInstallment);
  const [picked, setPicked] = useState([]);
  const [saving, setSaving] = useState(false);
  const { tx } = item;

  const picks = useMemo(
    () => loans.filter((l) => picked.includes(l.id)).map((loan) => ({ loan, installment: loan.nextDueInstallment })),
    [loans, picked],
  );
  const valid = picks.length > 0;

  const toggle = (id) => setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  const handleSave = async () => {
    setSaving(true);
    try {
      await recordSmsLoanInstallments(item, picks);
      toast.success(t('هزینه ثبت شد و {n} قسط پرداخت‌شده علامت خورد.', { n: picks.length.toLocaleString(intlLocale()) }));
      onClose();
    } catch (err) {
      toast.error(err?.message || t('ثبت قسط ممکن نشد.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('این برداشت قسط وام است')}
      subtitle={t('{amount} تومان — وام‌هایی را که این مبلغ قسطشان بوده انتخاب کنید', { amount: formatAmount(tx.amount) })}
      icon={<Landmark size={18} />}
      maxWidth="460px"
    >
      <div className="loan-deposit-body">
        {loans.length === 0 ? (
          <p className="loan-deposit-hint">{t('وامی با قسط پرداخت‌نشده ندارید.')}</p>
        ) : (
          <ul className="loan-deposit-list">
            {loans.map((loan) => {
              const on = picked.includes(loan.id);
              return (
                <li key={loan.id}>
                  <button type="button" className={`loan-deposit-option ${on ? 'is-selected' : ''}`} aria-pressed={on} onClick={() => toggle(loan.id)}>
                    {on ? <Check size={16} /> : <Landmark size={16} />}
                    <span>
                      <strong>{loan.title}</strong>
                      <small>{t('قسط {number}: {amount} تومان', { number: (Number(loan.nextDueInstallment.installmentNumber) || 0).toLocaleString(intlLocale()), amount: formatAmount(loan.nextDueInstallment.totalAmount) })}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="loan-deposit-hint">{t('یک هزینه‌ی «پرداخت قسط» به مبلغ همین برداشت ثبت می‌شود و هر قسط انتخابی با مبلغ خودش پرداخت‌شده علامت می‌خورد؛ وام برای قسط‌ها هزینه‌ای نمی‌سازد.')}</p>
        <Button block icon={<Check size={16} />} onClick={handleSave} loading={saving} disabled={!valid}>
          {t('ثبت')}
        </Button>
      </div>
    </Modal>
  );
}
