import React from 'react';

/**
 * ScanModelSelect — Pick the vision model of a cheque scan. Models whose API key the Worker
 * lacks are listed but disabled, so an admin sees which key to add.
 */
export function ScanModelSelect({ models, value, onChange, currentId = null, id, className = 'ui-input-control', disabled = false }) {
  return (
    <select id={id} className={className} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {models.map((m) => (
        <option key={m.id} value={m.id} disabled={m.available === false}>
          {m.label}
          {m.id === currentId ? ' (فعلی)' : ''}
          {m.available === false ? ` — ${m.secret ? `کلید ${m.secret} تنظیم نشده` : 'در دسترس نیست'}` : ''}
        </option>
      ))}
    </select>
  );
}

export default ScanModelSelect;
