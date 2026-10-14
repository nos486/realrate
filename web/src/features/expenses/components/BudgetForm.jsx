/**
 * BudgetForm.jsx — Monthly budgets of everyday expenses: one for the whole month and one per
 * category (all optional; an empty field means no budget). Mounted only while open.
 */

import React, { useState } from 'react';
import { Target } from 'lucide-react';
import { t } from '../../../utils/i18n.js';
import { AlertBanner, Button, Modal, NumericInput } from '../../../shared/ui/index.js';
import { parseInputNumber } from '../../portfolio/utils/holdingHelpers.js';
import { useCategories } from '../../../shared/categories/useCategories.js';

export default function BudgetForm({ budgets = {}, onSubmit, onClose, submitting = false }) {
  const categories = useCategories('expense', { includeHidden: false });
  const [values, setValues] = useState(() =>
    Object.fromEntries(Object.entries(budgets).map(([k, v]) => [k, String(v)])));
  const [submitError, setSubmitError] = useState('');

  const set = (key) => (v) => setValues((prev) => ({ ...prev, [key]: v }));

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setSubmitError('');
    const next = {};
    for (const [key, raw] of Object.entries(values)) {
      const n = parseInputNumber(raw);
      if (n > 0) next[key] = n;
    }
    try {
      await onSubmit(next);
      onClose();
    } catch (err) {
      setSubmitError(err.message || t('خطا در ذخیره بودجه'));
    }
  };

  const field = (key, label, Icon = null) => (
    <div className="ui-input-group budget-field" key={key}>
      <label htmlFor={`budget-${key}`} className="ui-input-label">
        {Icon && <Icon size={13} />}
        {label}
      </label>
      <div className="ui-input-wrapper">
        <NumericInput
          id={`budget-${key}`}
          value={values[key] || ''}
          onValueChange={set(key)}
          allowDecimals={false}
          placeholder={t('بدون بودجه')}
          className="ui-input-control"
        />
      </div>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('بودجه ماهانه')}
      subtitle={t('سقف خرج هر ماه، به تومان؛ برای هر ماه همین بودجه‌ها در نظر گرفته می‌شود')}
      icon={<Target size={18} />}
      maxWidth="600px"
      onSubmit={handleSubmit}
      footer={
        <div className="modal-actions">
          <Button variant="secondary" block disabled={submitting} onClick={onClose}>{t('انصراف')}</Button>
          <Button type="submit" block loading={submitting} disabled={submitting}>{t('ذخیره بودجه')}</Button>
        </div>
      }
    >
      <div className="income-form-body">
        {submitError && <AlertBanner type="error" message={submitError} />}
        {field('total', t('کل ماه'))}
        <div className="budget-grid">
          {categories.map(({ value, label, Icon }) => field(value, label, Icon))}
        </div>
      </div>
    </Modal>
  );
}
