/**
 * MoveToProjectModal.jsx — «انتقال به پروژه»: one or several everyday expenses moved into a
 * project (an existing one, or a new one named here). They leave the everyday expenses — their
 * month's total, budgets and charts — and count in the project instead. Mounted only while open.
 */

import { intlLocale, t } from '../../../utils/i18n.js';
import React, { useState } from 'react';
import { FolderInput, FolderPlus } from 'lucide-react';
import { AlertBanner, Button, Modal } from '../../../shared/ui/index.js';
import { formatAmount } from '../utils/format.js';

const NEW = '__new__';

/**
 * @param {{ count: number, totalToman: number, projects: object[], hideValues?: boolean,
 *   onSubmit: (target: string | { name: string }) => Promise<void>, onClose: () => void,
 *   submitting?: boolean }} props
 */
export default function MoveToProjectModal({ count, totalToman, projects, hideValues = false, onSubmit, onClose, submitting = false }) {
  const open = projects.filter((p) => !p.archived);
  const [choice, setChoice] = useState(open[0]?.id || NEW);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setError('');
    if (choice === NEW && !name.trim()) {
      setError(t('نام پروژه را بنویسید.'));
      return;
    }
    try {
      await onSubmit(choice === NEW ? { name: name.trim() } : choice);
      onClose();
    } catch (err) {
      setError(err.message || t('انتقال انجام نشد.'));
    }
  };

  const what = count === 1 ? t('این هزینه') : t('{n} هزینه', { n: count.toLocaleString(intlLocale()) });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('انتقال به پروژه')}
      subtitle={totalToman > 0
        ? t('{what} ({amount} تومان) از هزینه‌های روزمره به پروژه منتقل می‌شود و دیگر در جمع ماه، بودجه و نمودارها حساب نمی‌شود.', { what, amount: hideValues ? '****' : formatAmount(totalToman) })
        : t('{what} از هزینه‌های روزمره به پروژه منتقل می‌شود و دیگر در جمع ماه، بودجه و نمودارها حساب نمی‌شود.', { what })}
      icon={<FolderInput size={18} />}
      maxWidth="480px"
      onSubmit={handleSubmit}
      footer={
        <div className="modal-actions">
          <Button variant="secondary" block disabled={submitting} onClick={onClose}>{t('انصراف')}</Button>
          <Button type="submit" block loading={submitting} disabled={submitting}>{t('انتقال')}</Button>
        </div>
      }
    >
      <div className="income-form-body">
        {error && <AlertBanner type="error" message={error} />}
        <div className="move-project-list" role="radiogroup" aria-label={t('پروژه')}>
          {open.map((p) => (
            <label key={p.id} className={`move-project-option ${choice === p.id ? 'is-active' : ''}`}>
              <input type="radio" name="move-project" value={p.id} checked={choice === p.id} onChange={() => setChoice(p.id)} />
              <span>{p.name}</span>
            </label>
          ))}
          <label className={`move-project-option ${choice === NEW ? 'is-active' : ''}`}>
            <input type="radio" name="move-project" value={NEW} checked={choice === NEW} onChange={() => setChoice(NEW)} />
            <FolderPlus size={15} aria-hidden="true" />
            <span>{t('پروژه‌ی تازه')}</span>
          </label>
        </div>
        {choice === NEW && (
          <div className="ui-input-group">
            <label htmlFor="move-project-name" className="ui-input-label">{t('نام پروژه')}</label>
            <div className="ui-input-wrapper">
              <input
                id="move-project-name"
                className="ui-input-control"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('مثلاً بازسازی خانه')}
                maxLength={80}
                autoFocus
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
