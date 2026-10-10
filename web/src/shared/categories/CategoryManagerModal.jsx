/**
 * CategoryManagerModal.jsx — «مدیریت دسته‌ها»: the user's expense or income categories
 *
 * Rename a category, give it another icon and color, move it up or down, hide a built-in one from
 * the pickers (its records keep showing under it), add new ones and remove the user's own (their
 * records then show under «سایر», and come back if it is added again — they keep the key), and
 * leave a category out of the totals («در جمع حساب نشود»: its records are listed, not counted).
 * Changes are saved together with «ذخیره» (one encrypted record, categoryStore.js).
 */

import React, { useState } from 'react';
import { Tags, Plus, Pencil, Trash2, Eye, EyeOff, ChevronUp, ChevronDown, Check, Sigma } from 'lucide-react';
import { AlertBanner, Button, Input, Modal } from '../ui/index.js';
import { useVault } from '../vault/useVault.js';
import {
  CATEGORY_COLORS,
  CATEGORY_ICON_NAMES,
  CATEGORY_LIMITS,
  FALLBACK_CATEGORY,
  newCategoryId,
} from '../../utils/categoryDocument.js';
import { listCategories, saveCategories } from './categoryStore.js';
import { categoryIcon } from './categoryIcons.js';

const KIND_LABEL = { expense: 'هزینه', income: 'درآمد' };
const toDraft = (c) => ({ value: c.value, label: c.label, icon: c.icon, color: c.color, hidden: c.hidden, excluded: Boolean(c.excluded), custom: c.custom });

function CategoryEditor({ item, onChange, onDone }) {
  return (
    <div className="category-editor">
      <Input
        id={`category-label-${item.value}`}
        label="نام دسته"
        value={item.label}
        onChange={(e) => onChange({ label: e.target.value })}
        maxLength={CATEGORY_LIMITS.labelLength}
        autoFocus
      />
      <span className="ui-input-label">رنگ</span>
      <div className="category-color-grid" role="radiogroup" aria-label="رنگ">
        {CATEGORY_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={item.color === color}
            aria-label={color}
            className={`category-color ${item.color === color ? 'is-active' : ''}`}
            style={{ '--swatch': color }}
            onClick={() => onChange({ color })}
          />
        ))}
      </div>
      <span className="ui-input-label">آیکون</span>
      <div className="category-icon-grid" role="radiogroup" aria-label="آیکون">
        {CATEGORY_ICON_NAMES.map((name) => {
          const Icon = categoryIcon(name);
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={item.icon === name}
              aria-label={name}
              className={`category-icon-option ${item.icon === name ? 'is-active' : ''}`}
              style={{ '--swatch': item.color }}
              onClick={() => onChange({ icon: name })}
            >
              <Icon size={16} />
            </button>
          );
        })}
      </div>
      <Button size="sm" variant="secondary" icon={<Check size={14} />} onClick={onDone} disabled={!item.label.trim()}>
        تأیید
      </Button>
    </div>
  );
}

export default function CategoryManagerModal({ kind, onClose }) {
  const { status } = useVault();
  const locked = status !== 'unlocked';
  const [items, setItems] = useState(() => listCategories(kind, { includeHidden: true }).map(toDraft));
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (value, patch) => setItems((list) => list.map((c) => (c.value === value ? { ...c, ...patch } : c)));
  const move = (index, delta) => setItems((list) => {
    const next = [...list];
    const [item] = next.splice(index, 1);
    next.splice(Math.max(0, Math.min(next.length, index + delta)), 0, item);
    return next;
  });
  const add = () => {
    const item = { value: newCategoryId(), label: '', icon: 'Tag', color: CATEGORY_COLORS[items.length % CATEGORY_COLORS.length], hidden: false, excluded: false, custom: true };
    // New ones go before «سایر»
    setItems((list) => {
      const at = list.findIndex((c) => c.value === FALLBACK_CATEGORY);
      const next = [...list];
      next.splice(at < 0 ? next.length : at, 0, item);
      return next;
    });
    setEditing(item.value);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await saveCategories(kind, items.filter((c) => c.label.trim()).map(({ custom: _custom, ...c }) => ({ ...c, label: c.label.trim() })));
      onClose();
    } catch (err) {
      setError(err?.message || 'ذخیره‌ی دسته‌ها ممکن نشد.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`دسته‌های ${KIND_LABEL[kind]}`}
      subtitle="نام، آیکون، رنگ و ترتیب؛ دسته‌ی جدید بسازید یا دسته‌هایی را که لازم ندارید پنهان کنید"
      icon={<Tags size={18} />}
      maxWidth="520px"
      footer={
        <div className="modal-actions">
          <Button variant="secondary" block disabled={saving} onClick={onClose}>انصراف</Button>
          <Button block loading={saving} disabled={locked || Boolean(editing && !items.find((c) => c.value === editing)?.label.trim())} onClick={handleSave}>
            ذخیره
          </Button>
        </div>
      }
    >
      <div className="income-form-body">
        {locked && <AlertBanner type="info" message="برای تغییر دسته‌ها، ابتدا اطلاعات رمزنگاری‌شده را باز کنید." />}
        {error && <AlertBanner type="error" message={error} />}

        <ul className="category-manager-list">
          {items.map((item, index) => {
            const Icon = categoryIcon(item.icon);
            const isOther = item.value === FALLBACK_CATEGORY;
            return (
              <li key={item.value} className={item.hidden ? 'is-hidden' : ''}>
                <div className="category-manager-row">
                  <span className="category-manager-icon" style={{ '--swatch': item.color }}><Icon size={16} /></span>
                  <span className="category-manager-label">
                    {item.label || 'دسته‌ی جدید'}
                    {item.hidden && <small>پنهان</small>}
                    {item.excluded && <small className="is-excluded">خارج از جمع</small>}
                  </span>
                  <div className="row-actions-group">
                    <button
                      type="button"
                      className={`btn-table-action category-count-toggle ${item.excluded ? 'is-off' : ''}`}
                      title={item.excluded ? 'در جمع حساب شود' : 'در جمع حساب نشود (مثل سرمایه‌گذاری یا فروش دارایی)'}
                      aria-pressed={!item.excluded}
                      aria-label={item.excluded ? `«${item.label}» در جمع حساب شود` : `«${item.label}» در جمع حساب نشود`}
                      onClick={() => update(item.value, { excluded: !item.excluded })}
                    >
                      <Sigma size={13} />
                    </button>
                    <button type="button" className="btn-table-action" title="بالا" disabled={index === 0} onClick={() => move(index, -1)}>
                      <ChevronUp size={13} />
                    </button>
                    <button type="button" className="btn-table-action" title="پایین" disabled={index === items.length - 1} onClick={() => move(index, 1)}>
                      <ChevronDown size={13} />
                    </button>
                    <button type="button" className="btn-table-action edit" title="ویرایش" onClick={() => setEditing(editing === item.value ? null : item.value)}>
                      <Pencil size={13} />
                    </button>
                    {item.custom ? (
                      <button
                        type="button"
                        className="btn-table-action delete"
                        title="حذف (موارد ثبت‌شده در «سایر» نمایش داده می‌شوند)"
                        onClick={() => setItems((list) => list.filter((c) => c.value !== item.value))}
                      >
                        <Trash2 size={13} />
                      </button>
                    ) : !isOther && (
                      <button
                        type="button"
                        className="btn-table-action"
                        title={item.hidden ? 'نمایش در فهرست انتخاب' : 'پنهان از فهرست انتخاب'}
                        onClick={() => update(item.value, { hidden: !item.hidden })}
                      >
                        {item.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    )}
                  </div>
                </div>
                {editing === item.value && (
                  <CategoryEditor item={item} onChange={(patch) => update(item.value, patch)} onDone={() => setEditing(null)} />
                )}
              </li>
            );
          })}
        </ul>

        <Button variant="secondary" icon={<Plus size={16} />} onClick={add} disabled={locked}>
          دسته‌ی جدید
        </Button>
        <p className="expense-form-hint">
          دسته‌ی حذف‌شده از موارد ثبت‌شده پاک نمی‌شود؛ آن موارد در «سایر» نمایش داده می‌شوند.
        </p>
        <p className="expense-form-hint">
          <Sigma size={12} /> با دکمه‌ی Σ دسته‌ای را از جمع کنار بگذارید: موارد آن در فهرست می‌مانند ولی در جمع، نمودارها و بودجه حساب
          نمی‌شوند — مثل «سرمایه‌گذاری» یا «فروش دارایی». جابه‌جایی پول بین حساب‌های خودتان هزینه یا درآمد نیست: «انتقال بین حساب‌ها» در صفحه‌ی حساب‌ها.
        </p>
      </div>
    </Modal>
  );
}
