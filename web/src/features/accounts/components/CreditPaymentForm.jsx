/**
 * CreditPaymentForm.jsx — «پرداخت بدهی»: paying a bank credit back from another of the user's
 * accounts
 *
 * Filled with the next payment (utils/creditAccount.js): the part that pays the credit back is
 * a transfer into it — never an expense, the purchases already were — and the settlement fee or
 * the installment's profit is an expense of its own («کارمزد و سود اعتبار», with the credit's id),
 * paid from the same account. Either amount can be changed to what was really paid.
 */

import React, { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { AlertBanner, Button, FilterPills, Modal, NumericInput } from '../../../shared/ui/index.js';
import ShamsiDatePicker, { getTodayShamsi, gregorianToShamsi, shamsiToGregorian } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { CREDIT_COST_CATEGORY } from '../../../utils/creditAccount.js';
import { getExpenseGroups, ensureDailyGroup, saveExpense } from '../../../shared/vault/vaultExpenses.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { formatAmount } from '../../expenses/utils/format.js';
import { accountLabel } from '../constants/accountDisplay.js';

const digitsOnly = (v) => Number(String(v || '').replace(/[^\d]/g, '')) || 0;

/**
 * @param {{ account: object, status: object, payers: object[], saveTransfer: (input: object) => Promise<object>,
 *   onPaid?: () => void, onClose: () => void }} props - payers: the accounts it can be paid from
 */
export default function CreditPaymentForm({ account, status, payers = [], saveTransfer, onPaid, onClose }) {
  const next = status?.next || null;
  const [fromAccountId, setFrom] = useState(payers.length === 1 ? payers[0].id : '');
  const [principal, setPrincipal] = useState(next ? String(next.principal) : '');
  const [cost, setCost] = useState(next?.cost ? String(next.cost) : '');
  // Paid only on the due day: that day, when it is today or still ahead
  const dueDay = account.credit.payMode === 'due_day' && next && next.dueDate >= todayIso() ? next.dueDate : '';
  const [dateShamsi, setDateShamsi] = useState(() => (dueDay ? gregorianToShamsi(`${dueDay}T00:00:00`) : getTodayShamsi()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const principalNum = digitsOnly(principal);
  const costNum = digitsOnly(cost);
  const dateIso = shamsiToGregorian(dateShamsi);
  const isValid = Boolean(fromAccountId) && principalNum > 0 && Boolean(dateIso) && !submitting;
  const costLabel = next?.kind === 'installment' ? 'سود قسط' : 'کارمزد تسویه';

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!isValid) return;
    setSubmitting(true);
    setError('');
    try {
      const what = next?.label || 'پرداخت';
      await saveTransfer({ fromAccountId, toAccountId: account.id, amount: principalNum, fee: 0, date: dateIso, notes: `${what} — ${account.name}` });
      if (costNum > 0) {
        const group = await ensureDailyGroup((await getExpenseGroups()).groups || []);
        await saveExpense({
          groupId: group.id,
          title: `${costLabel} ${account.name}`,
          amount: costNum,
          currency: 'IRT',
          date: dateIso,
          category: CREDIT_COST_CATEGORY,
          accountId: fromAccountId,
          creditAccountId: account.id,
        });
      }
      onPaid?.();
      onClose();
    } catch (err) {
      setError(err.message || 'ثبت پرداخت ممکن نشد.');
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`پرداخت بدهی «${account.name}»`}
      subtitle="بازپرداخت اعتبار انتقال به همین حساب است و دوباره هزینه حساب نمی‌شود؛ فقط کارمزد یا سود، هزینه است"
      icon={<CreditCard size={18} />}
      maxWidth="520px"
      onSubmit={handleSubmit}
      footer={(
        <div className="modal-actions">
          <Button variant="secondary" block disabled={submitting} onClick={onClose}>انصراف</Button>
          <Button type="submit" block loading={submitting} disabled={!isValid}>ثبت پرداخت</Button>
        </div>
      )}
    >
      <div className="income-form-body">
        {error && <AlertBanner type="error" message={error} />}
        {next && (
          <AlertBanner
            type="info"
            message={`${next.label}: ${formatAmount(next.amount)} تومان${dueDay ? ' — این اعتبار فقط در روز سررسید پرداخت می‌شود' : ''}`}
          />
        )}
        {payers.length === 0 ? (
          <AlertBanner type="info" message="برای پرداخت، حسابی که از آن پرداخت می‌کنید را در صفحه‌ی «حساب‌ها» اضافه کنید." />
        ) : (
          <div className="ui-input-group">
            <span className="ui-input-label">پرداخت از *</span>
            <FilterPills
              options={payers.map((a) => ({ value: a.id, label: accountLabel(a) }))}
              activeValue={fromAccountId}
              onChange={setFrom}
              size="sm"
              className="income-category-picker"
            />
          </div>
        )}

        <div className="ui-input-group">
          <label htmlFor="credit-pay-principal" className="ui-input-label">بازپرداخت اعتبار (تومان) *</label>
          <div className="ui-input-wrapper">
            <NumericInput id="credit-pay-principal" value={principal} onValueChange={setPrincipal} className="ui-input-control" required />
          </div>
        </div>

        <div className="ui-input-group">
          <label htmlFor="credit-pay-cost" className="ui-input-label">{costLabel} (تومان، اختیاری)</label>
          <div className="ui-input-wrapper">
            <NumericInput id="credit-pay-cost" value={cost} onValueChange={setCost} placeholder="۰" className="ui-input-control" />
          </div>
          <p className="expense-form-hint">به‌عنوان هزینه با دسته‌ی «کارمزد و سود اعتبار» ثبت می‌شود.</p>
        </div>

        <ShamsiDatePicker label="تاریخ پرداخت *" value={dateShamsi} onChange={setDateShamsi} />
      </div>
    </Modal>
  );
}
