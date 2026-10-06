/**
 * MoveToProjectModal.jsx — «انتقال به پروژه»: one or several everyday expenses moved into a
 * project (an existing one, or a new one named here). They leave the everyday expenses — their
 * month's total, budgets and charts — and count in the project instead. Mounted only while open.
 */

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
      setError('نام پروژه را بنویسید.');
      return;
    }
    try {
      await onSubmit(choice === NEW ? { name: name.trim() } : choice);
      onClose();
    } catch (err) {
      setError(err.message || 'انتقال انجام نشد.');
    }
  };

  const what = count === 1 ? 'این هزینه' : `${count.toLocaleString('fa-IR')} هزینه`;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="انتقال به پروژه"
      subtitle={`${what}${totalToman > 0 ? ` (${hideValues ? '****' : formatAmount(totalToman)} تومان)` : ''} از هزینه‌های روزمره به پروژه منتقل می‌شود و دیگر در جمع ماه، بودجه و نمودارها حساب نمی‌شود.`}
      icon={<FolderInput size={18} />}
      maxWidth="480px"
      onSubmit={handleSubmit}
      footer={
        <div className="modal-actions">
          <Button variant="secondary" block disabled={submitting} onClick={onClose}>انصراف</Button>
          <Button type="submit" block loading={submitting} disabled={submitting}>انتقال</Button>
        </div>
      }
    >
      <div className="income-form-body">
        {error && <AlertBanner type="error" message={error} />}
        <div className="move-project-list" role="radiogroup" aria-label="پروژه">
          {open.map((p) => (
            <label key={p.id} className={`move-project-option ${choice === p.id ? 'is-active' : ''}`}>
              <input type="radio" name="move-project" value={p.id} checked={choice === p.id} onChange={() => setChoice(p.id)} />
              <span>{p.name}</span>
            </label>
          ))}
          <label className={`move-project-option ${choice === NEW ? 'is-active' : ''}`}>
            <input type="radio" name="move-project" value={NEW} checked={choice === NEW} onChange={() => setChoice(NEW)} />
            <FolderPlus size={15} aria-hidden="true" />
            <span>پروژه‌ی تازه</span>
          </label>
        </div>
        {choice === NEW && (
          <div className="ui-input-group">
            <label htmlFor="move-project-name" className="ui-input-label">نام پروژه</label>
            <div className="ui-input-wrapper">
              <input
                id="move-project-name"
                className="ui-input-control"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثلاً بازسازی خانه"
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
