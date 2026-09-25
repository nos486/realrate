/**
 * ChequeForm.jsx — Modal form to register or edit a cheque
 *
 * Mounted only while open (keyed by the edited cheque), so its state is initialized straight from
 * props. The status is chosen here only when registering (e.g. an already cleared cheque); later
 * changes go through the tracking modal so each one is logged with its date.
 */

import React, { useState } from 'react';
import { ReceiptText } from 'lucide-react';
import { AlertBanner, Button, FilterPills, Input, Modal, NumericInput } from '../../../shared/ui/index.js';
import ShamsiDatePicker, {
  getTodayShamsi,
  gregorianToShamsi,
  shamsiToGregorian,
} from '../../portfolio/components/ShamsiDatePicker.jsx';
import { parseInputNumber } from '../../portfolio/utils/holdingHelpers.js';
import { BankPicker } from '../../../shared/banks/index.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { CHEQUE_DIRECTIONS, CHEQUE_LIMITS, statusesFor, toAsciiDigits } from '../../../utils/chequeDocument.js';
import { getDirectionDisplay, getStatusDisplay } from '../constants/chequeDisplay.js';

const DIRECTION_OPTIONS = CHEQUE_DIRECTIONS.map(({ value, label }) => {
  const { Icon } = getDirectionDisplay(value);
  return { value, label: `چک ${label}`, icon: <Icon size={14} strokeWidth={2} /> };
});

const statusOptions = (direction) =>
  statusesFor(direction).map(({ value, label }) => {
    const { Icon } = getStatusDisplay(value);
    return { value, label, icon: <Icon size={13} strokeWidth={2} /> };
  });

const digitsOnly = (v) => toAsciiDigits(v).replace(/[^\d]/g, '');

export default function ChequeForm({ onClose, onSubmit, editingCheque = null, submitting = false }) {
  const [direction, setDirection] = useState(editingCheque?.direction || 'received');
  const [status, setStatus] = useState(editingCheque?.status || 'pending');
  const [amount, setAmount] = useState(editingCheque ? String(editingCheque.amount) : '');
  const [counterparty, setCounterparty] = useState(editingCheque?.counterparty || '');
  const [dueShamsi, setDueShamsi] = useState(() =>
    editingCheque ? gregorianToShamsi(`${editingCheque.dueDate}T00:00:00`) : getTodayShamsi()
  );
  const [bank, setBank] = useState({ bankId: editingCheque?.bankId || '', lenderName: editingCheque?.bankName || '' });
  const [chequeNumber, setChequeNumber] = useState(editingCheque?.chequeNumber || '');
  const [sayadId, setSayadId] = useState(editingCheque?.sayadId || '');
  const [notes, setNotes] = useState(editingCheque?.notes || '');
  const [submitError, setSubmitError] = useState('');

  const directionDisplay = getDirectionDisplay(direction);
  const amountNum = parseInputNumber(amount);
  const dueIso = shamsiToGregorian(dueShamsi);
  const sayadDigits = digitsOnly(sayadId);
  const sayadInvalid = sayadDigits.length > 0 && sayadDigits.length !== 16;
  const isFormValid = Boolean(counterparty.trim()) && amountNum !== null && amountNum > 0
    && Boolean(dueIso) && !sayadInvalid && !submitting;

  const changeDirection = (next) => {
    setDirection(next);
    // Keep the chosen status only when it exists for the new direction
    if (!statusesFor(next).some((s) => s.value === status)) setStatus('pending');
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!isFormValid) return;
    setSubmitError('');
    const payload = {
      direction,
      amount: amountNum,
      dueDate: dueIso,
      counterparty: counterparty.trim(),
      bankId: bank.bankId || '',
      bankName: bank.lenderName || '',
      chequeNumber: toAsciiDigits(chequeNumber).trim(),
      sayadId: sayadDigits,
      notes: notes.trim(),
    };
    try {
      if (editingCheque) {
        // Status and tracking log are unchanged by an edit (the direction may make the status
        // invalid, in which case the server says so)
        await onSubmit({
          ...payload,
          status: editingCheque.status,
          issueDate: editingCheque.issueDate || '',
          history: editingCheque.history,
        });
      } else {
        // The registration opens the tracking log, dated in the user's own time zone
        await onSubmit({ ...payload, status, history: [{ status, date: todayIso(), note: '' }] });
      }
      onClose();
    } catch (err) {
      setSubmitError(err.message || 'خطا در ذخیره چک');
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={editingCheque ? 'ویرایش چک' : 'ثبت چک جدید'}
      subtitle="مبالغ به تومان ثبت می‌شوند"
      icon={<ReceiptText size={18} />}
      maxWidth="560px"
      onSubmit={handleSubmit}
      footer={
        <div className="modal-actions">
          <Button variant="secondary" block disabled={submitting} onClick={onClose}>
            انصراف
          </Button>
          <Button type="submit" block loading={submitting} disabled={!isFormValid}>
            {editingCheque ? 'ذخیره تغییرات' : 'ثبت چک'}
          </Button>
        </div>
      }
    >
      <div className="cheque-form-body">
        {submitError && <AlertBanner type="error" message={submitError} />}

        <div className="ui-input-group">
          <span className="ui-input-label">نوع چک</span>
          <FilterPills options={DIRECTION_OPTIONS} activeValue={direction} onChange={changeDirection} size="sm" />
        </div>

        <div className="cheque-form-row">
          <div className="ui-input-group">
            <label htmlFor="cheque-amount" className="ui-input-label">مبلغ (تومان) *</label>
            <div className="ui-input-wrapper">
              <NumericInput
                id="cheque-amount"
                value={amount}
                onValueChange={setAmount}
                placeholder="مثلاً ۵۰,۰۰۰,۰۰۰"
                className="ui-input-control"
                required
              />
            </div>
          </div>
          <ShamsiDatePicker label="تاریخ سررسید *" value={dueShamsi} onChange={setDueShamsi} />
        </div>

        <Input
          id="cheque-counterparty"
          label={`${directionDisplay.counterpartyLabel} *`}
          placeholder={direction === 'issued' ? 'چک در وجه چه کسی است؟' : 'چک را چه کسی صادر کرده است؟'}
          value={counterparty}
          onChange={(e) => setCounterparty(e.target.value)}
          maxLength={CHEQUE_LIMITS.counterpartyLength}
          autoFocus={!editingCheque}
          required
        />

        <BankPicker id="cheque-bank" value={bank} onChange={setBank} label="بانک" />

        <div className="cheque-form-row">
          <Input
            id="cheque-number"
            label="شماره چک"
            placeholder="اختیاری"
            value={chequeNumber}
            onChange={(e) => setChequeNumber(e.target.value)}
            maxLength={CHEQUE_LIMITS.chequeNumberLength}
            inputMode="numeric"
            dir="ltr"
          />
          <Input
            id="cheque-sayad"
            label="شناسه صیادی (۱۶ رقم)"
            placeholder="اختیاری"
            value={sayadId}
            onChange={(e) => setSayadId(e.target.value)}
            maxLength={24}
            inputMode="numeric"
            dir="ltr"
            error={sayadInvalid ? 'شناسه صیادی باید ۱۶ رقم باشد.' : undefined}
          />
        </div>

        {!editingCheque && (
          <div className="ui-input-group">
            <span className="ui-input-label">وضعیت فعلی</span>
            <FilterPills options={statusOptions(direction)} activeValue={status} onChange={setStatus} size="sm" />
          </div>
        )}

        <Input
          id="cheque-notes"
          as="textarea"
          label="یادداشت (اختیاری)"
          placeholder="بابت چه چیزی، شرایط، شماره حساب و..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={CHEQUE_LIMITS.notesLength}
          rows={2}
        />
      </div>
    </Modal>
  );
}
