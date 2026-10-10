/**
 * PickerRow.jsx — One choice of an entry form as a single row: its name and what is chosen
 * («پرداخت از   ملت ›»); tapping it lists the options under it, and picking one folds it again
 *
 * For the choices that are usually left as they are (the account, the project, the loan, the
 * cheque): the form stays short, and what is chosen is still in view.
 */

import React, { useId, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

/**
 * @param {{ label: string, value: string, options: { value: string, label: string, hint?: string }[],
 *   onChange: (v: string) => void, placeholder?: string, children?: React.ReactNode }} props —
 *   placeholder: shown when the value is none of the options; children: a hint under the row
 */
export default function PickerRow({ label, value, options, onChange, placeholder = 'انتخاب کنید', children = null }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const chosen = options.find((o) => o.value === value) || null;
  return (
    <div className="ui-input-group picker-row-field">
      <button
        type="button"
        className={`picker-row ${open ? 'is-open' : ''}`}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="picker-row-label">{label}</span>
        <span className={`picker-row-value ${chosen ? '' : 'is-empty'}`}>{chosen ? chosen.label : placeholder}</span>
        <ChevronDown size={16} className="picker-row-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className="picker-row-options" id={listId} role="radiogroup" aria-label={label}>
          {options.map((o) => (
            <button
              key={o.value || 'none'}
              type="button"
              role="radio"
              aria-checked={o.value === value}
              aria-label={o.label}
              className={`picker-row-option ${o.value === value ? 'is-active' : ''}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <span className="picker-row-option-text">
                <span>{o.label}</span>
                {o.hint && <small>{o.hint}</small>}
              </span>
              {o.value === value && <Check size={16} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
