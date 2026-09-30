/**
 * LoanDepositSheet.jsx — «این واریزِ وام است»: a bank deposit that is a received loan, not income
 *
 * Either one of the loans not yet settled — the message leaves the inbox and nothing is recorded
 * (the loan already holds its principal) — or a new loan, opened on the loans page with the
 * deposit's amount, day and bank; the message leaves the inbox once that loan is saved.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Landmark, Plus, ChevronLeft } from 'lucide-react';
import { Button, Modal } from '../../shared/ui/index.js';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { appPath } from '../../shared/routes.js';
import { dismissSms } from '../../shared/native/smsInbox.js';
import { useOptionalLoans } from '../loans/context/LoansContext.jsx';
import { fundingLoanOptions } from '../../utils/loanFunding.js';
import { formatAmount } from '../expenses/utils/format.js';

export default function LoanDepositSheet({ item, onClose }) {
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const loans = fundingLoanOptions(useOptionalLoans());
  const { tx } = item;

  const handleExisting = (loan) => {
    dismissSms(item.fingerprint);
    toast.success(`واریز به‌عنوان دریافت «${loan.title}» کنار رفت؛ درآمد ثبت نشد.`);
    onClose();
  };

  const handleNew = () => {
    const params = new URLSearchParams({ add: 'loan', amount: String(tx.amount), sms: item.fingerprint });
    if (tx.date) params.set('date', tx.date);
    if (tx.bankId) params.set('bank', tx.bankId);
    onClose();
    navigate(`${appPath('/loans')}?${params}`);
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="این واریزِ وام است"
      subtitle={`${formatAmount(tx.amount)} تومان — وام درآمد نیست و در درآمدها ثبت نمی‌شود`}
      icon={<Landmark size={18} />}
      maxWidth="460px"
    >
      <div className="loan-deposit-body">
        {loans.length > 0 && (
          <>
            <p className="loan-deposit-hint">دریافت کدام وام است؟</p>
            <ul className="loan-deposit-list">
              {loans.map((loan) => (
                <li key={loan.id}>
                  <button type="button" className="loan-deposit-option" onClick={() => handleExisting(loan)}>
                    <Landmark size={16} />
                    <span>
                      <strong>{loan.title}</strong>
                      <small>اصل: {formatAmount(loan.principalAmount)} تومان</small>
                    </span>
                    <ChevronLeft size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <Button block variant={loans.length ? 'secondary' : 'primary'} icon={<Plus size={16} />} onClick={handleNew}>
          ثبت وام جدید با این مبلغ
        </Button>
        <p className="loan-deposit-hint">
          آنچه با این پول می‌خرید را با «تأمین از» همین وام ثبت کنید تا در جزئیات وام، مصرفش دیده شود.
        </p>
      </div>
    </Modal>
  );
}
