/**
 * ChequeForm.jsx — Modal form to register or edit a cheque
 *
 * Mounted only while open (keyed by the edited cheque), so its state is initialized straight from
 * props. The status is chosen here only when registering (e.g. an already cleared cheque); later
 * changes go through the tracking modal so each one is logged with its date.
 * A cheque is a way of paying: «بابت» is what it pays for (an expense category, issued) or brings
 * in (an income category, received), and «حساب» the account it is drawn on or paid into — its
 * expense or income, recorded when it clears, takes both (shared/vault/recordLinks.js).
 *
 * Laid out as an entry form (shared/form/, like the expense and income forms): the amount first
 * (tomans, in words under it), received or issued as a segmented choice, the other party, the due
 * day (often ahead, so the full Shamsi picker), «بابت» as category tiles of the matching kind,
 * the account as a picker row, the status (a new cheque only), and the rarely needed — the bank,
 * the cheque number, the Sayad id, the note — folded under «جزئیات بیشتر». A new cheque can be
 * saved with «ثبت و بعدی» (a stack of cheques): the form stays open, keeping the direction, the
 * other party, the bank, «بابت», the account and the status. A cheque filled from an AI scan
 * keeps its low-confidence warnings on the fields it filled.
 */

import React, { useState } from 'react';
import { t } from '../../../utils/i18n.js';
import { CircleDashed, ReceiptText } from 'lucide-react';
import { AlertBanner, FilterPills, Input, Modal } from '../../../shared/ui/index.js';
import { AmountField, CategoryGrid, EntryFormActions, MoreDetails, PickerRow } from '../../../shared/form/index.js';
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
import { useCategories } from '../../../shared/categories/useCategories.js';
import { useAccounts } from '../../accounts/hooks/useAccounts.js';
import { accountLabel } from '../../accounts/constants/accountDisplay.js';
import { accountsForCurrency } from '../../../utils/accountDocument.js';

const DIRECTION_OPTIONS = CHEQUE_DIRECTIONS.map(({ value }) => {
  const { Icon, label } = getDirectionDisplay(value);
  return { value, label: t('چک {kind}', { kind: label }), icon: <Icon size={14} strokeWidth={2} /> };
});

const statusOptions = (direction) =>
  statusesFor(direction).map(({ value }) => {
    const { Icon, label } = getStatusDisplay(value);
    return { value, label, icon: <Icon size={13} strokeWidth={2} /> };
  });

/** «بابت» left open: the cheque pays for / brings in nothing in particular */
const NO_CATEGORY = { value: '', label: t('نامشخص'), Icon: CircleDashed };

const digitsOnly = (v) => toAsciiDigits(v).replace(/[^\d]/g, '');

const SCAN_HINT = t('از اسکن — لطفاً بررسی کنید');

export default function ChequeForm({
  onClose,
  onSubmit,
  editingCheque = null,
  submitting = false,
  initialValues = null,
  confidence = null,
}) {
  const [direction, setDirection] = useState(editingCheque?.direction || 'received');
  const [status, setStatus] = useState(editingCheque?.status || 'pending');
  const [amount, setAmount] = useState(() => {
    if (editingCheque) return String(editingCheque.amount);
    if (initialValues?.amount) return String(initialValues.amount);
    return '';
  });
  const [counterparty, setCounterparty] = useState(
    editingCheque?.counterparty || initialValues?.counterparty || ''
  );
  const [dueShamsi, setDueShamsi] = useState(() => {
    if (editingCheque?.dueDate) return gregorianToShamsi(`${editingCheque.dueDate}T00:00:00`);
    if (initialValues?.dueDate) {
      if (initialValues.dueDate.includes('/')) return initialValues.dueDate;
      return gregorianToShamsi(`${initialValues.dueDate}T00:00:00`);
    }
    return getTodayShamsi();
  });
  const [bank, setBank] = useState({
    bankId: editingCheque?.bankId || initialValues?.bankId || '',
    lenderName: editingCheque?.bankName || initialValues?.bankName || '',
  });
  const [chequeNumber, setChequeNumber] = useState(
    editingCheque?.chequeNumber || initialValues?.chequeNumber || ''
  );
  const [sayadId, setSayadId] = useState(
    editingCheque?.sayadId || initialValues?.sayadId || ''
  );
  const [notes, setNotes] = useState(
    editingCheque?.notes || initialValues?.notes || ''
  );
  const [remindersEnabled, setRemindersEnabled] = useState(editingCheque?.remindersMuted !== true);
  // What it pays for / brings in, and its account
  const [category, setCategory] = useState(editingCheque?.category || '');
  const [accountId, setAccountId] = useState(editingCheque?.accountId || '');
  const expenseCats = useCategories('expense', { keep: editingCheque?.category });
  const incomeCats = useCategories('income', { keep: editingCheque?.category });
  const categoryOptions = [NO_CATEGORY, ...(direction === 'issued' ? expenseCats : incomeCats)];
  const { accounts = [] } = useAccounts();
  // A cheque is in tomans: the accounts that hold them (the one it names stays)
  const chequeAccounts = accountsForCurrency(accounts.filter((a) => !a.archived || a.id === accountId), 'IRT', editingCheque?.accountId);
  const [submitError, setSubmitError] = useState('');

  const isLow = (key) => Boolean(!editingCheque && initialValues && confidence?.[key] === 'low');

  const directionDisplay = getDirectionDisplay(direction);
  const amountNum = parseInputNumber(amount);
  const dueIso = shamsiToGregorian(dueShamsi);
  const sayadDigits = digitsOnly(sayadId);
  const sayadInvalid = sayadDigits.length > 0 && sayadDigits.length !== 16;
  const isFormValid = Boolean(counterparty.trim()) && amountNum !== null && amountNum > 0
    && Boolean(dueIso) && !sayadInvalid && !submitting;

  const changeDirection = (next) => {
    setDirection(next);
    // An expense category doesn't fit a received cheque, and the other way round
    if (next !== direction) setCategory('');
    // Keep the chosen status only when it exists for the new direction
    if (!statusesFor(next).some((s) => s.value === status)) setStatus('pending');
  };

  // «ثبت و بعدی»: the next cheque of the stack keeps all but what is its own
  const [saved, setSaved] = useState('');
  const [round, setRound] = useState(0);
  const startNext = (savedName) => {
    setAmount('');
    setChequeNumber('');
    setSayadId('');
    setNotes('');
    setSaved(savedName);
    // The amount field again, focused
    setRound((r) => r + 1);
  };

  const handleSubmit = async (e, next = false) => {
    e?.preventDefault?.();
    if (!isFormValid) return;
    setSubmitError('');
    setSaved('');
    const payload = {
      direction,
      amount: amountNum,
      dueDate: dueIso,
      counterparty: counterparty.trim(),
      bankId: bank.bankId || '',
      bankName: bank.lenderName || '',
      chequeNumber: toAsciiDigits(chequeNumber).trim(),
      sayadId: sayadDigits,
      remindersMuted: !remindersEnabled,
      notes: notes.trim(),
      category,
      accountId,
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
          // …and so is the income or expense its clearing recorded
          settlement: editingCheque.settlement || null,
        });
      } else {
        // The registration opens the tracking log, dated in the user's own time zone
        await onSubmit({ ...payload, status, history: [{ status, date: todayIso(), note: '' }] });
      }
      if (next) startNext(payload.counterparty);
      else onClose();
    } catch (err) {
      setSubmitError(err.message || t('خطا در ذخیره چک'));
    }
  };

  const detailsFilled = [
    ...(bank.bankId || bank.lenderName ? [t('بانک')] : []),
    ...(chequeNumber.trim() ? [t('شماره چک')] : []),
    ...(sayadId.trim() ? [t('شناسه صیادی')] : []),
    ...(notes.trim() ? [t('یادداشت')] : []),
  ];

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={editingCheque ? t('ویرایش چک') : t('ثبت چک جدید')}
      subtitle={t('مبالغ به تومان ثبت می‌شوند')}
      icon={<ReceiptText size={18} />}
      maxWidth="560px"
      onSubmit={handleSubmit}
      footer={
        <EntryFormActions
          submitLabel={editingCheque ? t('ذخیره تغییرات') : t('ثبت چک')}
          valid={isFormValid}
          submitting={submitting}
          onCancel={onClose}
          onNext={editingCheque || initialValues ? null : () => handleSubmit(null, true)}
        />
      }
    >
      <div className="entry-form-body cheque-entry-form">
        {submitError && <AlertBanner type="error" message={submitError} />}
        {saved && <p className="entry-form-saved" role="status">{t('چک «{name}» ثبت شد؛ چک بعدی را وارد کنید.', { name: saved })}</p>}
        {initialValues && !editingCheque && (
          <AlertBanner
            type="info"
            message={t('اطلاعات فرم از اسکن چک با هوش مصنوعی استخراج شده است. لطفاً پیش از ثبت، فیلدها را بازبینی فرمایید.')}
          />
        )}

        <div className={isLow('amount') ? 'has-scan-warning' : undefined}>
          <AmountField
            key={round}
            id="cheque-amount"
            value={amount}
            onValueChange={setAmount}
            currency="IRT"
            placeholder={t('مثلاً ۵۰,۰۰۰,۰۰۰')}
            autoFocus={!editingCheque && !initialValues}
          >
            {isLow('amount') && <span className="scan-confidence-hint">{SCAN_HINT}</span>}
          </AmountField>
        </div>

        <div className="ui-input-group">
          <span className="ui-input-label">{t('نوع چک')}</span>
          <FilterPills variant="segmented" size="sm" options={DIRECTION_OPTIONS} activeValue={direction} onChange={changeDirection} />
        </div>

        <Input
          id="cheque-counterparty"
          label={`${directionDisplay.counterpartyLabel} *`}
          placeholder={direction === 'issued' ? t('چک در وجه چه کسی است؟') : t('چک را چه کسی صادر کرده است؟')}
          value={counterparty}
          onChange={(e) => setCounterparty(e.target.value)}
          maxLength={CHEQUE_LIMITS.counterpartyLength}
          required
          className={isLow('counterparty') ? 'scan-low-confidence-group' : ''}
          hint={isLow('counterparty') ? SCAN_HINT : undefined}
        />

        {/* Usually ahead: the full picker, not «امروز / دیروز» */}
        <div className={`scan-date-group ${isLow('dueDate') ? 'has-scan-warning' : ''}`}>
          <ShamsiDatePicker label={t('تاریخ سررسید *')} value={dueShamsi} onChange={setDueShamsi} />
          {isLow('dueDate') && <span className="scan-confidence-hint">{SCAN_HINT}</span>}
        </div>

        <div className="entry-form-section">
          <CategoryGrid
            key={direction}
            kind={direction === 'issued' ? 'expense' : 'income'}
            label={t('بابت (اختیاری)')}
            options={categoryOptions}
            value={category}
            onChange={setCategory}
          />
          <p className="expense-form-hint">{direction === 'issued' ? t('با پاس شدن، هزینه‌ای با همین دسته ثبت می‌شود.') : t('با پاس شدن، درآمدی با همین دسته ثبت می‌شود.')}</p>
        </div>

        {chequeAccounts.length > 0 && (
          <PickerRow
            label={direction === 'issued' ? t('از حساب') : t('واریز به حساب')}
            value={accountId}
            options={[{ value: '', label: t('نامشخص') }, ...chequeAccounts.map((a) => ({ value: a.id, label: accountLabel(a) }))]}
            onChange={setAccountId}
            placeholder={t('نامشخص')}
          />
        )}

        {!editingCheque && (
          <div className="ui-input-group">
            <span className="ui-input-label">{t('وضعیت فعلی')}</span>
            <FilterPills options={statusOptions(direction)} activeValue={status} onChange={setStatus} size="sm" />
          </div>
        )}

        <MoreDetails filled={detailsFilled}>
          <div className={`scan-bank-group ${isLow('bankName') ? 'has-scan-warning' : ''}`}>
            <BankPicker id="cheque-bank" value={bank} onChange={setBank} label={t('بانک')} />
            {isLow('bankName') && <span className="scan-confidence-hint">{SCAN_HINT}</span>}
          </div>

          <div className="cheque-form-row">
            <Input
              id="cheque-number"
              label={t('شماره چک')}
              placeholder={t('اختیاری')}
              value={chequeNumber}
              onChange={(e) => setChequeNumber(e.target.value)}
              maxLength={CHEQUE_LIMITS.chequeNumberLength}
              inputMode="numeric"
              dir="ltr"
              className={isLow('chequeNumber') ? 'scan-low-confidence-group' : ''}
              hint={isLow('chequeNumber') ? SCAN_HINT : undefined}
            />
            <Input
              id="cheque-sayad"
              label={t('شناسه صیادی (۱۶ رقم)')}
              placeholder={t('اختیاری')}
              value={sayadId}
              onChange={(e) => setSayadId(e.target.value)}
              maxLength={24}
              inputMode="numeric"
              dir="ltr"
              error={sayadInvalid ? t('شناسه صیادی باید ۱۶ رقم باشد.') : undefined}
              className={isLow('sayadId') ? 'scan-low-confidence-group' : ''}
              hint={!sayadInvalid && isLow('sayadId') ? SCAN_HINT : undefined}
            />
          </div>

          <Input
            id="cheque-notes"
            as="textarea"
            label={t('یادداشت')}
            placeholder={t('بابت چه چیزی، شرایط، شماره حساب و...')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={CHEQUE_LIMITS.notesLength}
            rows={2}
          />
        </MoreDetails>

        <label className="income-recurring-toggle">
          <input
            type="checkbox"
            checked={remindersEnabled}
            onChange={(e) => setRemindersEnabled(e.target.checked)}
          />
          <span>
            <strong>{t('یادآوری برای این مورد')}</strong>
            <small>{t('در صورت فعال بودن، در زمان سررسید چک اعلان یا ایمیل یادآوری ارسال می‌شود.')}</small>
          </span>
        </label>
      </div>
    </Modal>
  );
}
