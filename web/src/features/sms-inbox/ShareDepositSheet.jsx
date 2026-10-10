/**
 * ShareDepositSheet.jsx — «این واریزِ دنگ است»: a bank deposit that is someone's share of an
 * expense the user paid (a shared expense, «دنگ»), not income
 *
 * The open shared expenses are listed (OpenSharesModal's list); picking one adds the deposit to
 * that expense's reimbursements — with the account it reached and the transaction's key, so the
 * message is known as recorded on any device — and the message leaves the inbox.
 */

import React, { useState } from 'react';
import { HandCoins } from 'lucide-react';
import { AlertBanner, EmptyState, Modal } from '../../shared/ui/index.js';
import { SkeletonRows } from '../../shared/ui/Skeleton.jsx';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { markSmsHandled } from '../../shared/native/smsInbox.js';
import { bumpVaultEpoch } from '../../shared/vault/vaultStore.js';
import * as expensesApi from '../../shared/vault/vaultExpenses.js';
import { OpenSharesList } from '../expenses/components/OpenSharesModal.jsx';
import { useOpenShares } from '../expenses/hooks/useOpenShares.js';
import { smsReimbursement } from './smsDrafts.js';
import { formatAmount } from '../expenses/utils/format.js';
import { isForeignCurrency } from '../../utils/currencies.js';

export default function ShareDepositSheet({ item, accounts = [], onClose }) {
  const { toast } = useFeedback();
  const { tx } = item;
  const { loading, error, expenses } = useOpenShares();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  // A foreign expense can't take a toman deposit
  const candidates = expenses.filter((e) => !isForeignCurrency(e.currency));

  const handlePick = async (expense) => {
    setSaving(true);
    setSaveError('');
    try {
      const reimbursement = expensesApi.newReimbursement(smsReimbursement(tx, accounts));
      await expensesApi.saveExpense({ reimbursements: [...(expense.reimbursements || []), reimbursement] }, expense);
      markSmsHandled(item.fingerprint);
      bumpVaultEpoch();
      toast.success(`واریز به‌عنوان دنگ «${expense.title}» ثبت شد؛ درآمد حساب نشد.`);
      onClose();
    } catch (err) {
      setSaveError(err?.message || 'ثبت ممکن نشد.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="این واریزِ دنگ است"
      subtitle={`${formatAmount(tx.amount)} تومان — سهم دیگران از هزینه‌ای که پرداختید؛ درآمد نیست`}
      icon={<HandCoins size={18} />}
      maxWidth="460px"
    >
      <div className="loan-deposit-body">
        {(error || saveError) && <AlertBanner type="error" message={error || saveError} />}
        {loading && !expenses.length ? (
          <SkeletonRows rows={3} columns={2} label="در حال دریافت طلب‌ها" />
        ) : candidates.length === 0 ? (
          <EmptyState
            icon={<HandCoins size={36} strokeWidth={1.5} />}
            title="طلب بازی نیست"
            description="ابتدا هزینه را با «سهم: با دیگران (دنگ)» ثبت کنید (یا ویرایش کنید)، سپس این واریز را به آن بزنید."
          />
        ) : (
          <>
            <p className="loan-deposit-hint">دنگ کدام هزینه است؟</p>
            <div aria-busy={saving}>
              <OpenSharesList expenses={candidates} onPick={saving ? () => {} : handlePick} amountLimit={tx.amount} />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
