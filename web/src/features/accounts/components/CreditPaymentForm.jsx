/**
 * CreditPaymentForm.jsx — Paying a bank credit back from another of the user's accounts, by hand
 *
 * Two uses:
 *  - «تسویه بدهی»: the debt settled and what was actually paid for it. What was paid is a
 *    transfer into the credit (never an expense — the purchases already were), the part beyond
 *    the debt settled its `fee`: the settlement fee, shown as it is typed (amount and percent) and
 *    recorded as an expense of its own («کارمزد و سود اعتبار», with the credit's id), paid from
 *    the same account.
 *  - an installment (`installment`): its amount, paid into the credit; the page then marks it paid.
 * (utils/creditAccount.js)
 */

import React, { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { AlertBanner, Button, FilterPills, Modal, NumericInput } from '../../../shared/ui/index.js';
import ShamsiDatePicker, { getTodayShamsi, shamsiToGregorian, formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { CREDIT_COST_CATEGORY, settlementOf } from '../../../utils/creditAccount.js';
import { getExpenseGroups, ensureDailyGroup, saveExpense } from '../../../shared/vault/vaultExpenses.js';
import { formatAmount } from '../../expenses/utils/format.js';
import { accountLabel } from '../constants/accountDisplay.js';

const digitsOnly = (v) => Number(String(v || '').replace(/[^\d]/g, '')) || 0;
const faPct = (v) => Number(v).toLocaleString('fa-IR', { maximumFractionDigits: 2 });

/**
 * @param {{ account: object, debt?: number, installment?: { n: number, count: number, dueDate: string, amount: number }|null,
 *   payers: object[], saveTransfer: (input: object) => Promise<object>, onPaid?: (transfer: object, date: string) => unknown,
 *   onClose: () => void }} props - payers: the accounts it can be paid from; debt: what is owed
 *   outside the installments (the settlement's starting amount)
 */
export default function CreditPaymentForm({ account, debt = 0, installment = null, payers = [], saveTransfer, onPaid, onClose }) {
  const start = installment ? installment.amount : debt;
  const [fromAccountId, setFrom] = useState(payers.length === 1 ? payers[0].id : '');
  const [settled, setSettled] = useState(start ? String(start) : '');
  const [paid, setPaid] = useState(start ? String(start) : '');
  const [dateShamsi, setDateShamsi] = useState(getTodayShamsi);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const dateIso = shamsiToGregorian(dateShamsi);
  const settledNum = digitsOnly(settled);
  // An installment is paid as it is; a settlement may cost a fee
  const result = installment ? { fee: 0, pct: 0 } : settlementOf(settledNum, digitsOnly(paid));
  const isValid = Boolean(fromAccountId) && settledNum > 0 && !result.error && Boolean(dateIso) && !submitting;
  const what = installment ? `قسط ${faPct(installment.n)} از ${faPct(installment.count)}` : 'تسویه‌ی بدهی';

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!isValid) return;
    setSubmitting(true);
    setError('');
    try {
      const transfer = await saveTransfer({
        fromAccountId,
        toAccountId: account.id,
        // What left the account; the fee is the part of it that didn't pay the debt (transferDocument.js)
        amount: settledNum + result.fee,
        fee: result.fee,
        date: dateIso,
        notes: `${what} — ${account.name}`,
      });
      if (result.fee > 0) {
        const group = await ensureDailyGroup((await getExpenseGroups()).groups || []);
        await saveExpense({
          groupId: group.id,
          title: `کارمزد تسویه ${account.name}`,
          amount: result.fee,
          currency: 'IRT',
          date: dateIso,
          category: CREDIT_COST_CATEGORY,
          accountId: fromAccountId,
          creditAccountId: account.id,
          notes: `${faPct(result.pct)}٪ از ${formatAmount(settledNum)} تومان`,
        });
      }
      await onPaid?.(transfer, dateIso);
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
      title={installment ? `پرداخت ${what}` : `تسویه بدهی «${account.name}»`}
      subtitle={installment
        ? `سررسید ${formatShamsiDisplay(`${installment.dueDate}T00:00:00`)}`
        : 'بدهی تسویه‌شده انتقال به همین حساب است و دوباره هزینه حساب نمی‌شود؛ مابه‌التفاوت، کارمزد تسویه است'}
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
          <label htmlFor="credit-pay-settled" className="ui-input-label">{installment ? 'مبلغ قسط (تومان) *' : 'بدهی تسویه‌شده (تومان) *'}</label>
          <div className="ui-input-wrapper">
            <NumericInput id="credit-pay-settled" value={settled} onValueChange={setSettled} className="ui-input-control" required />
          </div>
        </div>

        {!installment && (
          <div className="ui-input-group">
            <label htmlFor="credit-pay-paid" className="ui-input-label">مبلغ پرداختی (تومان) *</label>
            <div className="ui-input-wrapper">
              <NumericInput id="credit-pay-paid" value={paid} onValueChange={setPaid} className="ui-input-control" required />
            </div>
            <p className="expense-form-hint">
              {result.error || (result.fee > 0
                ? `کارمزد تسویه: ${formatAmount(result.fee)} تومان (${faPct(result.pct)}٪) — جدا به‌عنوان هزینه ثبت می‌شود`
                : 'بدون کارمزد')}
            </p>
          </div>
        )}

        <ShamsiDatePicker label="تاریخ پرداخت *" value={dateShamsi} onChange={setDateShamsi} />
      </div>
    </Modal>
  );
}
