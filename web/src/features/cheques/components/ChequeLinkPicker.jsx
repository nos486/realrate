/**
 * ChequeLinkPicker.jsx — «کدام چک»: the cheque an expense was paid with (an issued one) or an
 * income received with (a received one) — a way of paying, whatever the record's category
 * (utils/categoryLinks.js PAYMENT_LINKS, `chequeId`)
 *
 * Offers the open cheques of that direction (not yet recorded by another income or expense),
 * soonest due first, and the one the record already names. Picking one fills the amount, the
 * title, and the account it is drawn on; saving the record clears the cheque
 * (shared/vault/recordLinks.js).
 */

import React from 'react';
import { PickerRow } from '../../../shared/form/index.js';
import { CHEQUE_DIRECTION_OF } from '../../../utils/categoryLinks.js';
import { compareChequesByDue, isChequeOpen } from '../../../utils/chequeDocument.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { useOptionalCheques } from '../context/ChequesContext.jsx';

const fa = (n) => Math.round(Number(n) || 0).toLocaleString('fa-IR');

/** «علی رضایی — ۵٬۰۰۰٬۰۰۰ تومان», due «سررسید ۱۴۰۵/۰۸/۰۱» under it */
const chequeChoice = (cheque) => ({
  value: cheque.id,
  label: `${cheque.counterparty} — ${fa(cheque.amount)} تومان`,
  hint: `سررسید ${formatShamsiDisplay(`${cheque.dueDate}T00:00:00`)}`,
});

/** The title a record of this cheque's money gets */
const chequeRecordTitle = (cheque) => `چک ${cheque.counterparty}`;

/**
 * @param {{ side: 'expense'|'income', value: string, onChange: (id: string) => void,
 *   onFill?: (fields: object) => void, recordId?: string }} props
 */
export default function ChequeLinkPicker({ side, value, onChange, onFill, recordId = '' }) {
  const all = useOptionalCheques();
  const direction = CHEQUE_DIRECTION_OF[side];
  const choices = all
    .filter((c) => c.direction === direction)
    .filter((c) => c.id === value || (isChequeOpen(c) && (!c.settlement || c.settlement.id === recordId)))
    .sort(compareChequesByDue);

  const pick = (id) => {
    onChange(id);
    const cheque = choices.find((c) => c.id === id);
    if (cheque) onFill?.({ title: chequeRecordTitle(cheque), amount: cheque.amount, currency: 'IRT', accountId: cheque.accountId || '' });
  };

  return (
    choices.length > 0 ? (
      <PickerRow
        label={side === 'income' ? 'کدام چک دریافتی' : 'کدام چک صادره'}
        value={value || ''}
        options={[{ value: '', label: 'هیچ‌کدام' }, ...choices.map(chequeChoice)]}
        onChange={pick}
      >
        {value && <p className="expense-form-hint">با ثبت، این چک «پاس شده» می‌شود و به همین {side === 'income' ? 'درآمد' : 'هزینه'} وصل می‌ماند.</p>}
      </PickerRow>
    ) : (
      <p className="expense-form-hint">چک {side === 'income' ? 'دریافتی' : 'صادره'}ِ پاس‌نشده‌ای ندارید؛ چک را در صفحه‌ی «چک‌ها» ثبت کنید.</p>
    )
  );
}
