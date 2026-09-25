/**
 * ChequeTrackingModal.jsx — A cheque's details, its tracking log and recording what happened next
 *
 * Choosing a status (with the date it happened and an optional note) logs it in the cheque's
 * history; choosing the current status just adds a follow-up note (e.g. "called the drawer").
 */

import React, { useState } from 'react';
import { ClipboardList, Pencil } from 'lucide-react';
import { AlertBanner, Button, FilterPills, Input, Modal } from '../../../shared/ui/index.js';
import ShamsiDatePicker, {
  getTodayShamsi,
  formatShamsiDisplay,
  shamsiToGregorian,
} from '../../portfolio/components/ShamsiDatePicker.jsx';
import { BankLogo, resolveBank, useCustomBanks } from '../../../shared/banks/index.js';
import { formatNum } from '../../portfolio/utils/holdingHelpers.js';
import { CHEQUE_LIMITS, statusesFor, daysUntilDue, isChequeOpen } from '../../../utils/chequeDocument.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { getStatusDisplay, getDirectionDisplay, describeDueDays } from '../constants/chequeDisplay.js';
import ChequeStatusBadge from './ChequeStatusBadge.jsx';

const showDate = (iso) => formatShamsiDisplay(`${iso}T00:00:00`);

export default function ChequeTrackingModal({ cheque, onClose, onChangeStatus, onEdit, submitting = false, hideValues = false }) {
  const { customBanks } = useCustomBanks();
  const [status, setStatus] = useState(cheque.status);
  const [dateShamsi, setDateShamsi] = useState(getTodayShamsi());
  const [note, setNote] = useState('');
  const [submitError, setSubmitError] = useState('');

  const direction = getDirectionDisplay(cheque.direction);
  const bank = resolveBank({ bankId: cheque.bankId, lenderName: cheque.bankName }, customBanks);
  const days = daysUntilDue(cheque, todayIso());
  const dateIso = shamsiToGregorian(dateShamsi);
  const sameStatus = status === cheque.status;
  const canSubmit = Boolean(dateIso) && (!sameStatus || note.trim().length > 0) && !submitting;
  const history = [...(cheque.history || [])].reverse();

  const statusOptions = statusesFor(cheque.direction).map(({ value, label }) => {
    const { Icon } = getStatusDisplay(value);
    return { value, label, icon: <Icon size={13} strokeWidth={2} /> };
  });

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!canSubmit) return;
    setSubmitError('');
    try {
      await onChangeStatus(cheque, status, dateIso, note.trim());
      setNote('');
    } catch (err) {
      setSubmitError(err.message || 'خطا در ثبت وضعیت چک');
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`پیگیری چک ${direction.label}`}
      subtitle={cheque.counterparty}
      icon={<ClipboardList size={18} />}
      maxWidth="600px"
      onSubmit={handleSubmit}
      footer={
        <div className="modal-actions">
          <Button variant="secondary" block icon={<Pencil size={14} />} onClick={() => onEdit(cheque)} disabled={submitting}>
            ویرایش مشخصات
          </Button>
          <Button type="submit" block loading={submitting} disabled={!canSubmit}>
            {sameStatus ? 'افزودن یادداشت پیگیری' : 'ثبت وضعیت جدید'}
          </Button>
        </div>
      }
    >
      <div className="cheque-tracking">
        <div className="cheque-tracking-hero">
          <div>
            <span className="cheque-tracking-label">مبلغ</span>
            <strong className={`cheque-tracking-amount is-${direction.tone}`}>
              {hideValues ? '****' : formatNum(cheque.amount)} <small>تومان</small>
            </strong>
          </div>
          <ChequeStatusBadge status={cheque.status} />
        </div>

        <dl className="cheque-details">
          <div>
            <dt>سررسید</dt>
            <dd>
              {showDate(cheque.dueDate)}
              {isChequeOpen(cheque) && <span className={`cheque-due-hint ${days < 0 ? 'is-late' : ''}`}>{describeDueDays(days)}</span>}
            </dd>
          </div>
          <div>
            <dt>{direction.counterpartyLabel}</dt>
            <dd>{cheque.counterparty}</dd>
          </div>
          {bank.kind !== 'none' && (
            <div>
              <dt>بانک</dt>
              <dd className="cheque-bank-cell">
                <BankLogo bank={bank} size={18} />
                {bank.name}
              </dd>
            </div>
          )}
          {cheque.chequeNumber && (
            <div>
              <dt>شماره چک</dt>
              <dd dir="ltr">{cheque.chequeNumber}</dd>
            </div>
          )}
          {cheque.sayadId && (
            <div>
              <dt>شناسه صیادی</dt>
              <dd dir="ltr" className="cheque-sayad">{cheque.sayadId.replace(/(\d{4})(?=\d)/g, '$1 ')}</dd>
            </div>
          )}
          {cheque.notes && (
            <div className="is-wide">
              <dt>یادداشت</dt>
              <dd>{cheque.notes}</dd>
            </div>
          )}
        </dl>

        <section className="cheque-timeline-section" aria-label="سوابق پیگیری">
          <h4>سوابق پیگیری</h4>
          <ol className="cheque-timeline">
            {history.map((entry, i) => {
              const look = getStatusDisplay(entry.status);
              return (
                <li key={`${entry.date}_${i}`} className={`cheque-timeline-item tone-${look.tone}`}>
                  <span className="cheque-timeline-dot" aria-hidden="true"><look.Icon size={12} /></span>
                  <div className="cheque-timeline-body">
                    <div className="cheque-timeline-head">
                      <strong>{look.label}</strong>
                      <span>{showDate(entry.date)}</span>
                    </div>
                    {entry.note && <p>{entry.note}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="cheque-update-section" aria-label="ثبت پیگیری">
          <h4>چه اتفاقی افتاد؟</h4>
          {submitError && <AlertBanner type="error" message={submitError} />}
          <FilterPills options={statusOptions} activeValue={status} onChange={setStatus} size="sm" />
          <div className="cheque-form-row">
            <ShamsiDatePicker label="تاریخ" value={dateShamsi} onChange={setDateShamsi} />
            <Input
              id="cheque-track-note"
              label={sameStatus ? 'یادداشت پیگیری *' : 'یادداشت (اختیاری)'}
              placeholder={sameStatus ? 'مثلاً: با صادرکننده تماس گرفتم' : 'مثلاً: به حساب ملت واریز شد'}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={CHEQUE_LIMITS.historyNoteLength}
            />
          </div>
        </section>
      </div>
    </Modal>
  );
}
