/**
 * TransferForm.jsx — «انتقال بین حساب‌ها»: money moved from one of the user's accounts to another
 *
 * Not an expense or an income (utils/transferDocument.js): from, to, amount, an optional bank
 * fee, the day and a note. Opened from the accounts page, or from a bank SMS (`draft`: amount,
 * day, the matched account on its side, and the message keys it covers).
 *
 * Laid out as an entry form (shared/form/, docs/en/DESIGN.md «Entry forms»): the amount first
 * (in tomans, in words under it), «از حساب» and «به حساب» as picker rows, the day
 * («امروز»/«دیروز»/«روز دیگر»), and the fee and note under «جزئیات بیشتر». A new transfer can be
 * saved with «ثبت و بعدی»: the form stays open for the next one, keeping its accounts and day.
 */

import React, { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { AlertBanner, Input, Modal, NumericInput } from '../../../shared/ui/index.js';
import { AmountField, DateField, EntryFormActions, MoreDetails, PickerRow } from '../../../shared/form/index.js';
import {
  getTodayShamsi,
  gregorianToShamsi,
  shamsiToGregorian,
} from '../../portfolio/components/ShamsiDatePicker.jsx';
import { TRANSFER_LIMITS } from '../../../utils/transferDocument.js';
import { accountHolds, isCreditAccount } from '../../../utils/accountDocument.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { getIncomes } from '../../../shared/vault/vaultIncomes.js';
import { findDuplicatePayment } from '../../../utils/creditAccount.js';
import { formatAmount } from '../../expenses/utils/format.js';
import { accountLabel } from '../constants/accountDisplay.js';

const digitsOnly = (v) => Number(String(v || '').replace(/[^\d]/g, '')) || 0;

export default function TransferForm({ transfer = null, draft = null, accounts = [], onSubmit, onClose, submitting = false, note = null }) {
  const start = transfer || draft || {};
  const [fromAccountId, setFrom] = useState(start.fromAccountId || '');
  const [toAccountId, setTo] = useState(start.toAccountId || '');
  const [amount, setAmount] = useState(start.amount ? String(start.amount) : '');
  const [fee, setFee] = useState(start.fee ? String(start.fee) : '');
  const [dateShamsi, setDateShamsi] = useState(() => (start.date ? gregorianToShamsi(`${start.date}T00:00:00`) : getTodayShamsi()));
  const [notes, setNotes] = useState(start.notes || '');
  const [error, setError] = useState('');
  // «ثبت و بعدی»: what was saved last, and a new round for the amount field (focused again)
  const [saved, setSaved] = useState('');
  const [round, setRound] = useState(0);

  const amountNum = digitsOnly(amount);
  const feeNum = digitsOnly(fee);
  const dateIso = shamsiToGregorian(dateShamsi);
  // A transfer is in tomans: the accounts that hold them (and the two it already names)
  const usable = accounts.filter((a) => accountHolds(a, 'IRT') || a.id === start.fromAccountId || a.id === start.toAccountId);
  const options = usable.map((a) => ({ value: a.id, label: accountLabel(a) }));
  const isValid = Boolean(fromAccountId && toAccountId && fromAccountId !== toAccountId && amountNum > 0 && feeNum <= amountNum && dateIso);

  // The next transfer keeps its accounts and day
  const startNext = () => {
    setSaved(formatAmount(amountNum));
    setAmount('');
    setFee('');
    setNotes('');
    setRound((r) => r + 1);
  };

  const { confirm } = useFeedback();
  const handleSubmit = async (e, next = false) => {
    e?.preventDefault?.();
    if (!isValid) return;
    setError('');
    setSaved('');
    try {
      // A «تسویه بدهی اعتباری» deposit of the same amount that day: probably the same payment
      if (!transfer && isCreditAccount(accounts.find((a) => a.id === toAccountId))) {
        const { incomes } = await getIncomes({ from: dateIso, to: dateIso }).catch(() => ({ incomes: [] }));
        if (findDuplicatePayment({ creditId: toAccountId, amount: amountNum - feeNum, date: dateIso }, { incomes })) {
          const proceed = await confirm({
            title: 'پرداخت تکراری؟',
            message: 'برای همین اعتبار در همین روز درآمدی با دسته‌ی «تسویه بدهی اعتباری» و همین مبلغ ثبت شده است. اگر این همان پرداخت است، ثبت دوباره بدهی را دو بار کم می‌کند. باز هم ثبت شود؟',
            confirmLabel: 'ثبت شود',
          });
          if (!proceed) return;
        }
      }
      await onSubmit({
        fromAccountId,
        toAccountId,
        amount: amountNum,
        fee: feeNum,
        date: dateIso,
        notes: notes.trim(),
        smsKeys: start.smsKeys || [],
      });
      if (next) startNext();
      else onClose();
    } catch (err) {
      setError(err.message || 'ذخیره‌ی انتقال ممکن نشد.');
    }
  };

  const detailsFilled = [
    ...(feeNum > 0 ? ['کارمزد'] : []),
    ...(notes.trim() ? ['یادداشت'] : []),
  ];

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={transfer ? 'ویرایش انتقال' : 'انتقال بین حساب‌ها'}
      subtitle="جابه‌جایی پول بین حساب‌های خودتان؛ جزو هزینه و درآمد حساب نمی‌شود"
      icon={<ArrowLeftRight size={18} />}
      maxWidth="520px"
      onSubmit={handleSubmit}
      footer={(
        <EntryFormActions
          submitLabel={transfer ? 'ذخیره تغییرات' : 'ثبت انتقال'}
          valid={isValid}
          submitting={submitting}
          onCancel={onClose}
          onNext={transfer || draft ? null : () => handleSubmit(null, true)}
        />
      )}
    >
      <div className="entry-form-body">
        {error && <AlertBanner type="error" message={error} />}
        {saved && <p className="entry-form-saved" role="status">انتقال {saved} تومان ثبت شد؛ انتقال بعدی را وارد کنید.</p>}
        {note}

        <AmountField
          key={round}
          id="transfer-amount"
          value={amount}
          onValueChange={setAmount}
          currency="IRT"
          placeholder="مثلاً ۲۰,۰۰۰,۰۰۰"
          autoFocus={!transfer && !draft}
        />

        {usable.length < 2 ? (
          <AlertBanner type="info" message="برای ثبت انتقال (به تومان)، دست‌کم دو حساب تومانی در صفحه‌ی «حساب‌ها» لازم است." />
        ) : (
          <div className="entry-form-section">
            <PickerRow
              label="از حساب"
              value={fromAccountId}
              options={options}
              onChange={(id) => {
                setFrom(id);
                if (id === toAccountId) setTo('');
              }}
            />
            <PickerRow
              label="به حساب"
              value={toAccountId}
              options={options.filter((o) => o.value !== fromAccountId)}
              onChange={setTo}
            />
          </div>
        )}
        {isCreditAccount(accounts.find((x) => x.id === toAccountId)) && (
          <p className="expense-form-hint">پرداخت بدهی اعتبار از حساب خودتان است. اگر پول از بیرون واریز شده، به‌جای انتقال درآمد «تسویه بدهی اعتباری» ثبت کنید؛ هر دو برای یک پرداخت بدهی را دو بار کم می‌کنند.</p>
        )}

        <DateField label="تاریخ انتقال *" value={dateShamsi} onChange={setDateShamsi} />

        <MoreDetails filled={detailsFilled}>
          <div className="ui-input-group">
            <label htmlFor="transfer-fee" className="ui-input-label">کارمزد بانک (تومان، اختیاری)</label>
            <div className="ui-input-wrapper">
              <NumericInput id="transfer-fee" value={fee} onValueChange={setFee} placeholder="۰" className="ui-input-control" />
            </div>
            {feeNum > amountNum && amountNum > 0 && <p className="expense-form-hint">کارمزد از مبلغ بیشتر است.</p>}
          </div>

          <Input
            id="transfer-notes"
            as="textarea"
            label="یادداشت (اختیاری)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={TRANSFER_LIMITS.notesLength}
            rows={2}
          />
        </MoreDetails>
      </div>
    </Modal>
  );
}
