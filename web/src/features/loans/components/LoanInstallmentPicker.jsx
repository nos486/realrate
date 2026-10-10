/**
 * LoanInstallmentPicker.jsx — «کدام وام»: the loan installment an expense in «پرداخت قسط» pays
 * (utils/categoryLinks.js, `loanInstallment: { loanId, installmentId }`)
 *
 * Offers the loans with an installment still to pay — the next one of each — and the one the
 * expense already names. Picking a loan fills the installment's amount and the loan's title;
 * saving the expense marks that installment paid (shared/vault/recordLinks.js).
 */

import React from 'react';
import { FilterPills } from '../../../shared/ui/index.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { useOptionalLoans } from '../context/LoansContext.jsx';

const fa = (n) => Math.round(Number(n) || 0).toLocaleString('fa-IR');
/** An installment's id as the loan store takes it (a schedule row may only have its number) */
const installmentIdOf = (inst) => String(inst?.id || inst?.installmentNumber || '');

/**
 * @param {{ value: { loanId: string, installmentId: string }|null, onChange: (value: object|null) => void,
 *   onFill?: (fields: object) => void }} props
 */
export default function LoanInstallmentPicker({ value, onChange, onFill }) {
  const loans = useOptionalLoans();
  const choices = loans.filter((l) => l.nextDueInstallment || l.id === value?.loanId);

  const pick = (loanId) => {
    if (!loanId) return onChange(null);
    const loan = choices.find((l) => l.id === loanId);
    const inst = loan?.nextDueInstallment;
    // The one it already pays stays; another loan: its next installment
    if (value?.loanId === loanId) return onChange(value);
    if (!inst) return onChange(null);
    onChange({ loanId, installmentId: installmentIdOf(inst) });
    onFill?.({ title: `قسط ${loan.title}`, amount: Number(inst.totalAmount) || 0, currency: 'IRT' });
  };

  const chosen = choices.find((l) => l.id === value?.loanId);
  const next = chosen?.nextDueInstallment;
  return (
    <div className="ui-input-group">
      <span className="ui-input-label">قسط کدام وام</span>
      {choices.length > 0 ? (
        <FilterPills
          options={[{ value: '', label: 'هیچ‌کدام' }, ...choices.map((l) => ({ value: l.id, label: l.title }))]}
          activeValue={value?.loanId || ''}
          onChange={pick}
          size="sm"
          className="income-category-picker"
        />
      ) : (
        <p className="expense-form-hint">وامی با قسط پرداخت‌نشده ندارید.</p>
      )}
      {chosen && next && installmentIdOf(next) === value?.installmentId && (
        <p className="expense-form-hint">
          قسط {fa(next.installmentNumber)} به مبلغ {fa(next.totalAmount)} تومان، سررسید {formatShamsiDisplay(`${next.dueDate}T00:00:00`)} — با ثبت، پرداخت‌شده علامت می‌خورد.
        </p>
      )}
    </div>
  );
}
