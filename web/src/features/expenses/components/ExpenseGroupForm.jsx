/**
 * ExpenseGroupForm.jsx — Modal to create or rename an expense section (a project, ...)
 * Mounted only while open, so its state starts from props.
 */

import React, { useState } from 'react';
import { FolderKanban } from 'lucide-react';
import { AlertBanner, Button, Input, Modal, NumericInput } from '../../../shared/ui/index.js';
import { parseInputNumber } from '../../portfolio/utils/holdingHelpers.js';
import { EXPENSE_LIMITS } from '../../../utils/expenseDocument.js';

export default function ExpenseGroupForm({ group = null, onSubmit, onClose, submitting = false }) {
  const [name, setName] = useState(group?.name || '');
  const [notes, setNotes] = useState(group?.notes || '');
  const [budget, setBudget] = useState(group?.budget ? String(group.budget) : '');
  const [submitError, setSubmitError] = useState('');
  const isValid = Boolean(name.trim()) && !submitting;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!isValid) return;
    setSubmitError('');
    try {
      await onSubmit({ name: name.trim(), notes: notes.trim(), type: group?.type || 'project', budget: parseInputNumber(budget) || null });
      onClose();
    } catch (err) {
      setSubmitError(err.message || 'خطا در ذخیره بخش');
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={group ? 'ویرایش بخش' : 'بخش هزینه جدید'}
      subtitle="مثلاً یک پروژه، سفر یا بازسازی خانه؛ هزینه‌هایش را زیر آن ثبت کنید"
      icon={<FolderKanban size={18} />}
      maxWidth="480px"
      onSubmit={handleSubmit}
      footer={
        <div className="modal-actions">
          <Button variant="secondary" block disabled={submitting} onClick={onClose}>انصراف</Button>
          <Button type="submit" block loading={submitting} disabled={!isValid}>
            {group ? 'ذخیره تغییرات' : 'ساخت بخش'}
          </Button>
        </div>
      }
    >
      <div className="income-form-body">
        {submitError && <AlertBanner type="error" message={submitError} />}
        <Input
          id="expense-group-name"
          label="نام بخش *"
          placeholder="مثلاً: پروژه بازسازی آشپزخانه"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={EXPENSE_LIMITS.nameLength}
          autoFocus
          required
        />
        <div className="ui-input-group">
          <label htmlFor="expense-group-budget" className="ui-input-label">بودجه کل (تومان، اختیاری)</label>
          <div className="ui-input-wrapper">
            <NumericInput
              id="expense-group-budget"
              value={budget}
              onValueChange={setBudget}
              allowDecimals={false}
              placeholder="مثلاً ۴۰۰,۰۰۰,۰۰۰"
              className="ui-input-control"
            />
          </div>
        </div>
        <Input
          id="expense-group-notes"
          as="textarea"
          label="توضیحات (اختیاری)"
          placeholder="هدف، بودجه تقریبی یا هر نکته‌ای درباره این بخش"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={EXPENSE_LIMITS.notesLength}
          rows={2}
        />
      </div>
    </Modal>
  );
}
