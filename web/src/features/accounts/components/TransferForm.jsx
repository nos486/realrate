/**
 * TransferForm.jsx — «انتقال بین حساب‌ها»: money moved from one of the user's accounts to another
 *
 * Not an expense or an income (utils/transferDocument.js): from, to, amount, an optional bank
 * fee, the day and a note. Opened from the accounts page, or from a bank SMS (`draft`: amount,
 * day, the matched account on its side, and the message keys it covers).
 */

import React, { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { AlertBanner, Button, FilterPills, Input, Modal, NumericInput } from '../../../shared/ui/index.js';
import ShamsiDatePicker, {
  getTodayShamsi,
  gregorianToShamsi,
  shamsiToGregorian,
} from '../../portfolio/components/ShamsiDatePicker.jsx';
import { TRANSFER_LIMITS } from '../../../utils/transferDocument.js';
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

  const amountNum = digitsOnly(amount);
  const feeNum = digitsOnly(fee);
  const dateIso = shamsiToGregorian(dateShamsi);
  const options = accounts.map((a) => ({ value: a.id, label: accountLabel(a) }));
  const isValid = fromAccountId && toAccountId && fromAccountId !== toAccountId && amountNum > 0 && feeNum <= amountNum && Boolean(dateIso);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!isValid) return;
    setError('');
    try {
      await onSubmit({
        fromAccountId,
        toAccountId,
        amount: amountNum,
        fee: feeNum,
        date: dateIso,
        notes: notes.trim(),
        smsKeys: start.smsKeys || [],
      });
      onClose();
    } catch (err) {
      setError(err.message || 'ذخیره‌ی انتقال ممکن نشد.');
    }
  };

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
        <div className="modal-actions">
          <Button variant="secondary" block disabled={submitting} onClick={onClose}>انصراف</Button>
          <Button type="submit" block loading={submitting} disabled={!isValid}>
            {transfer ? 'ذخیره تغییرات' : 'ثبت انتقال'}
          </Button>
        </div>
      )}
    >
      <div className="income-form-body">
        {error && <AlertBanner type="error" message={error} />}
        {note}
        {accounts.length < 2 ? (
          <AlertBanner type="info" message="برای ثبت انتقال، دست‌کم دو حساب در صفحه‌ی «حساب‌ها» اضافه کنید." />
        ) : (
          <>
            <div className="ui-input-group">
              <span className="ui-input-label">از حساب *</span>
              <FilterPills
                options={options}
                activeValue={fromAccountId}
                onChange={(id) => {
                  setFrom(id);
                  if (id === toAccountId) setTo('');
                }}
                size="sm"
                className="income-category-picker"
              />
            </div>
            <div className="ui-input-group">
              <span className="ui-input-label">به حساب *</span>
              <FilterPills
                options={options.filter((o) => o.value !== fromAccountId)}
                activeValue={toAccountId}
                onChange={setTo}
                size="sm"
                className="income-category-picker"
              />
            </div>
          </>
        )}

        <div className="ui-input-group">
          <label htmlFor="transfer-amount" className="ui-input-label">مبلغ (تومان) *</label>
          <div className="ui-input-wrapper">
            <NumericInput id="transfer-amount" value={amount} onValueChange={setAmount} placeholder="مثلاً ۲۰,۰۰۰,۰۰۰" className="ui-input-control" required />
          </div>
        </div>

        <div className="ui-input-group">
          <label htmlFor="transfer-fee" className="ui-input-label">کارمزد بانک (تومان، اختیاری)</label>
          <div className="ui-input-wrapper">
            <NumericInput id="transfer-fee" value={fee} onValueChange={setFee} placeholder="۰" className="ui-input-control" />
          </div>
          {feeNum > amountNum && amountNum > 0 && <p className="expense-form-hint">کارمزد از مبلغ بیشتر است.</p>}
        </div>

        <ShamsiDatePicker label="تاریخ انتقال *" value={dateShamsi} onChange={setDateShamsi} />

        <Input
          id="transfer-notes"
          as="textarea"
          label="یادداشت (اختیاری)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={TRANSFER_LIMITS.notesLength}
          rows={2}
        />
      </div>
    </Modal>
  );
}
