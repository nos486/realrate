/**
 * GoalDepositForm.jsx — Modal to set aside money for a goal (or take some back): the amount in
 * tomans, a deposit or a withdrawal, its day and a short note. It becomes an entry of the goal's
 * `deposits` (utils/goalDocument.js); nothing is recorded as an expense or income.
 * Mounted only while open, so its state starts from props.
 */

import React, { useState } from 'react';
import { PiggyBank } from 'lucide-react';
import { t } from '../../../utils/i18n.js';
import { AlertBanner, FilterPills, Input, Modal } from '../../../shared/ui/index.js';
import { AmountField, DateField, EntryFormActions } from '../../../shared/form/index.js';
import { getTodayShamsi, shamsiToGregorian } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { GOAL_LIMITS } from '../../../utils/goalDocument.js';
import { newDepositId } from '../../../shared/vault/vaultGoals.js';

const TYPE_OPTIONS = [{ value: 'in', label: t('واریز') }, { value: 'out', label: t('برداشت') }];
const amountOf = (v) => Number(String(v || '').replace(/[^\d.]/g, '')) || 0;

/**
 * @param {{ goal: object, onSubmit: (deposit: object) => Promise<unknown>, onClose: () => void,
 *   submitting?: boolean }} props
 */
export default function GoalDepositForm({ goal, onSubmit, onClose, submitting = false }) {
  const [type, setType] = useState('in');
  const [amount, setAmount] = useState('');
  const [dateShamsi, setDateShamsi] = useState(getTodayShamsi());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const amountNum = amountOf(amount);
  const iso = shamsiToGregorian(dateShamsi);
  const isValid = amountNum > 0 && Boolean(iso) && !submitting;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!isValid) return;
    setError('');
    try {
      await onSubmit({ id: newDepositId(), date: iso, amount: type === 'out' ? -amountNum : amountNum, note: note.trim() });
      onClose();
    } catch (err) {
      setError(err.message || t('ثبت واریز ممکن نشد.'));
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('واریز به «{name}»', { name: goal.name })}
      icon={<PiggyBank size={18} />}
      maxWidth="480px"
      onSubmit={handleSubmit}
      footer={<EntryFormActions submitLabel={type === 'out' ? t('ثبت برداشت') : t('ثبت واریز')} valid={isValid} submitting={submitting} onCancel={onClose} />}
    >
      <div className="entry-form-body">
        {error && <AlertBanner type="error" message={error} />}
        <AmountField id="goal-deposit-amount" value={amount} onValueChange={setAmount} autoFocus />
        <div className="ui-input-group">
          <FilterPills variant="segmented" size="sm" options={TYPE_OPTIONS} activeValue={type} onChange={setType} />
        </div>
        <DateField label={t('روز')} value={dateShamsi} onChange={setDateShamsi} />
        <Input id="goal-deposit-note" label={t('یادداشت')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={GOAL_LIMITS.noteLength} />
      </div>
    </Modal>
  );
}
