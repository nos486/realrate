/**
 * ReimbursementsModal.jsx — «دریافتی‌ها»: what came back for a shared expense («دنگ»)
 *
 * The expense's total, the user's share and what others owe; each amount received (on its day,
 * into an account) is added to the expense itself — never recorded as income — in as many
 * pieces as it comes back. Saved through `onSave(input, expense)` (the views' saveExpense,
 * resolving to the saved expense).
 */

import React, { useState } from 'react';
import { HandCoins, Trash2, Plus } from 'lucide-react';
import { AlertBanner, Button, FilterPills, Input, Modal, NumericInput } from '../../../shared/ui/index.js';
import ShamsiDatePicker, {
  getTodayShamsi,
  formatShamsiDisplay,
  shamsiToGregorian,
} from '../../portfolio/components/ShamsiDatePicker.jsx';
import { parseInputNumber } from '../../portfolio/utils/holdingHelpers.js';
import { EXPENSE_LIMITS, expenseReceivable } from '../../../utils/expenseDocument.js';
import { newReimbursement } from '../../../shared/vault/vaultExpenses.js';
import { accountLabel } from '../../accounts/constants/accountDisplay.js';
import { formatAmount } from '../utils/format.js';

export default function ReimbursementsModal({ expense: initial, accounts = [], onSave, onClose, readOnly = false }) {
  // The saved copy after each change (the opener's object is not refreshed)
  const [expense, setExpense] = useState(initial);
  const { owed, received, remaining } = expenseReceivable(expense);
  const unit = expense.currency === 'USD' ? 'دلار' : 'تومان';
  const money = (v) => formatAmount(v, expense.currency);
  const accountById = new Map(accounts.map((a) => [a.id, a]));
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
      setError(err?.message || 'ذخیره ممکن نشد.');
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
      title="دریافتی‌های دنگ"
      subtitle={`«${expense.title}» — دریافتی‌ها درآمد حساب نمی‌شوند`}
      icon={<HandCoins size={18} />}
      maxWidth="500px"
      onSubmit={handleAdd}
      footer={
        <div className="modal-actions">
          <Button variant="secondary" block onClick={onClose}>بستن</Button>
          {remaining > 0 && !readOnly && (
            <Button type="submit" block icon={<Plus size={16} />} loading={busy} disabled={!canAdd}>ثبت دریافت</Button>
          )}
        </div>
      }
    >
      <div className="income-form-body">
        {error && <AlertBanner type="error" message={error} />}

        <dl className="expense-share-facts">
          <div><dt>کل پرداختی</dt><dd>{money(expense.amount)} <small>{unit}</small></dd></div>
          <div><dt>سهم شما (هزینه)</dt><dd>{money(expense.myShare)} <small>{unit}</small></dd></div>
          <div><dt>سهم دیگران</dt><dd>{money(owed)} <small>{unit}</small></dd></div>
          <div><dt>دریافت‌شده</dt><dd className="text-profit">{money(received)} <small>{unit}</small></dd></div>
          <div className="is-total">
            <dt>مانده‌ی طلب</dt>
            <dd className={remaining > 0 ? 'text-loss' : 'text-profit'}>{remaining > 0 ? <>{money(remaining)} <small>{unit}</small></> : 'تسویه شد'}</dd>
          </div>
        </dl>

        {list.length > 0 && (
          <ul className="expense-reimbursement-list" aria-label="دریافتی‌ها">
            {list.map((r) => (
              <li key={r.id}>
                <span>
                  <strong>{money(r.amount)} <small>{unit}</small></strong>
                  <small>
                    {formatShamsiDisplay(`${r.date}T00:00:00`)}
                    {r.accountId && ` · ${accountLabel(accountById.get(r.accountId))}`}
                    {r.source === 'sms' && ' · از پیامک'}
                    {r.notes && ` · ${r.notes}`}
                  </small>
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    className="btn-table-action delete"
                    title="حذف این دریافتی"
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
            <div className="ui-input-group">
              <label htmlFor="reimbursement-amount" className="ui-input-label">مبلغ دریافتی ({unit}) *</label>
              <div className="ui-input-wrapper">
                <NumericInput
                  id="reimbursement-amount"
                  value={amount}
                  onValueChange={setAmount}
                  allowDecimals={expense.currency === 'USD'}
                  className="ui-input-control"
                />
              </div>
              {amountNum > remaining + 1e-6 && <p className="expense-form-hint">بیشتر از مانده‌ی طلب ({money(remaining)}) است.</p>}
            </div>

            {accounts.length > 0 && (
              <div className="ui-input-group">
                <span className="ui-input-label">واریز به</span>
                <FilterPills
                  options={[{ value: '', label: 'نامشخص / نقد' }, ...accounts.map((a) => ({ value: a.id, label: accountLabel(a) }))]}
                  activeValue={accountId}
                  onChange={setAccountId}
                  size="sm"
                  className="income-category-picker"
                />
              </div>
            )}

            <ShamsiDatePicker label="تاریخ دریافت *" value={dateShamsi} onChange={setDateShamsi} />

            <Input
              id="reimbursement-notes"
              label="توضیح (اختیاری)"
              placeholder="مثلاً: سهم علی"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={EXPENSE_LIMITS.reimbursementNotesLength}
            />
          </>
        )}
      </div>
    </Modal>
  );
}
