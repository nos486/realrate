/**
 * ReimbursementsModal.jsx — «دریافتی‌ها»: what came back for a shared expense («دنگ»)
 *
 * The expense's total, the user's share and what others owe; each amount received (on its day,
 * into an account) is added to the expense itself — never recorded as income — in as many
 * pieces as it comes back. Saved through `onSave(input, expense)` (the views' saveExpense,
 * resolving to the saved expense).
 *
 * The form for the next amount is laid out as an entry form (shared/form/): the amount first and
 * large (in the expense's currency, in words under it), «واریز به» as a picker row, the day
 * («امروز»/«دیروز»/«روز دیگر») and the note under «جزئیات بیشتر». Each amount is saved as it is
 * added, so the footer closes («بستن») rather than cancels.
 */

import React, { useState } from 'react';
import { HandCoins, Trash2, Plus } from 'lucide-react';
import { t } from '../../../utils/i18n.js';
import { AlertBanner, Button, Input, Modal } from '../../../shared/ui/index.js';
import { AmountField, DateField, MoreDetails, PickerRow } from '../../../shared/form/index.js';
import {
  getTodayShamsi,
  formatShamsiDisplay,
  shamsiToGregorian,
} from '../../portfolio/components/ShamsiDatePicker.jsx';
import { parseInputNumber } from '../../portfolio/utils/holdingHelpers.js';
import { EXPENSE_LIMITS, expenseReceivable } from '../../../utils/expenseDocument.js';
import { newReimbursement } from '../../../shared/vault/vaultExpenses.js';
import { accountLabel } from '../../accounts/constants/accountDisplay.js';
import { accountsForCurrency } from '../../../utils/accountDocument.js';
import { formatAmount } from '../utils/format.js';
import { currencyLabel } from '../../../utils/currencies.js';

export default function ReimbursementsModal({ expense: initial, accounts = [], onSave, onClose, readOnly = false }) {
  // The saved copy after each change (the opener's object is not refreshed)
  const [expense, setExpense] = useState(initial);
  const { owed, received, remaining } = expenseReceivable(expense);
  const unit = currencyLabel(expense.currency);
  const money = (v) => formatAmount(v, expense.currency);
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  // Money comes back in the expense's currency: into an account that holds it
  const payInto = accountsForCurrency(accounts, expense.currency);
  const list = expense.reimbursements || [];

  const [amount, setAmount] = useState(remaining > 0 ? String(remaining) : '');
  const [dateShamsi, setDateShamsi] = useState(getTodayShamsi());
  const [accountId, setAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const amountNum = parseInputNumber(amount);
  const dateIso = shamsiToGregorian(dateShamsi);
  const canAdd = !readOnly && remaining > 0 && amountNum > 0 && amountNum <= remaining + 1e-6 && Boolean(dateIso) && !busy;

  const save = async (reimbursements) => {
    setBusy(true);
    setError('');
    try {
      const saved = await onSave({ reimbursements }, expense);
      setExpense(saved || { ...expense, reimbursements });
      return true;
    } catch (err) {
      setError(err?.message || t('ذخیره ممکن نشد.'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async (e) => {
    e?.preventDefault?.();
    if (!canAdd) return;
    const ok = await save([...list, newReimbursement({ amount: amountNum, date: dateIso, accountId, notes: notes.trim() })]);
    if (ok) {
      const left = remaining - amountNum;
      setAmount(left > 0 ? String(left) : '');
      setNotes('');
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('دریافتی‌های دنگ')}
      subtitle={t('«{title}» — دریافتی‌ها درآمد حساب نمی‌شوند', { title: expense.title })}
      icon={<HandCoins size={18} />}
      maxWidth="500px"
      onSubmit={handleAdd}
      footer={
        <div className="modal-actions">
          <Button variant="secondary" block onClick={onClose}>{t('بستن')}</Button>
          {remaining > 0 && !readOnly && (
            <Button type="submit" block icon={<Plus size={16} />} loading={busy} disabled={!canAdd}>{t('ثبت دریافت')}</Button>
          )}
        </div>
      }
    >
      <div className="entry-form-body">
        {error && <AlertBanner type="error" message={error} />}

        <dl className="expense-share-facts">
          <div><dt>{t('کل پرداختی')}</dt><dd>{money(expense.amount)} <small>{unit}</small></dd></div>
          <div><dt>{t('سهم شما (هزینه)')}</dt><dd>{money(expense.myShare)} <small>{unit}</small></dd></div>
          <div><dt>{t('سهم دیگران')}</dt><dd>{money(owed)} <small>{unit}</small></dd></div>
          <div><dt>{t('دریافت‌شده')}</dt><dd className="text-profit">{money(received)} <small>{unit}</small></dd></div>
          <div className="is-total">
            <dt>{t('مانده‌ی طلب')}</dt>
            <dd className={remaining > 0 ? 'text-loss' : 'text-profit'}>{remaining > 0 ? <>{money(remaining)} <small>{unit}</small></> : t('تسویه شد')}</dd>
          </div>
        </dl>

        {list.length > 0 && (
          <ul className="expense-reimbursement-list" aria-label={t('دریافتی‌ها')}>
            {list.map((r) => (
              <li key={r.id}>
                <span>
                  <strong>{money(r.amount)} <small>{unit}</small></strong>
                  <small>
                    {formatShamsiDisplay(`${r.date}T00:00:00`)}
                    {r.accountId && ` · ${accountLabel(accountById.get(r.accountId))}`}
                    {r.source === 'sms' && ` · ${t('از پیامک')}`}
                    {r.notes && ` · ${r.notes}`}
                  </small>
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    className="btn-table-action delete"
                    title={t('حذف این دریافتی')}
                    disabled={busy}
                    onClick={() => save(list.filter((x) => x.id !== r.id))}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {remaining > 0 && !readOnly && (
          <>
            <AmountField id="reimbursement-amount" label={t('مبلغ دریافتی')} value={amount} onValueChange={setAmount} currency={expense.currency}>
              {amountNum > remaining + 1e-6 && <p className="expense-form-hint">{t('بیشتر از مانده‌ی طلب ({amount}) است.', { amount: money(remaining) })}</p>}
            </AmountField>

            {payInto.length > 0 && (
              <PickerRow
                label={t('واریز به')}
                value={accountId}
                options={[{ value: '', label: t('نامشخص / نقد') }, ...payInto.map((a) => ({ value: a.id, label: accountLabel(a) }))]}
                onChange={setAccountId}
              />
            )}

            <DateField label={t('تاریخ دریافت *')} value={dateShamsi} onChange={setDateShamsi} />

            <MoreDetails filled={notes.trim() ? [t('توضیح')] : []}>
              <Input
                id="reimbursement-notes"
                label={t('توضیح (اختیاری)')}
                placeholder={t('مثلاً: سهم علی')}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={EXPENSE_LIMITS.reimbursementNotesLength}
              />
            </MoreDetails>
          </>
        )}
      </div>
    </Modal>
  );
}
