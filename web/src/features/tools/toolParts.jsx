/**
 * toolParts.jsx — The small pieces every calculation tool is built from: a labelled number field,
 * a result list and the helpers that read what was typed and show tomans
 */

import React from 'react';
import { intlLocale, t } from '../../utils/i18n.js';
import { NumericInput } from '../../shared/ui/index.js';
import { toEnglishDigits } from '../../shared/utils/formatters.js';
import { formatPrice } from '../market/assetPrice.js';

/** A number typed into a NumericInput («۱٬۲۰۰»), as a number (0 when empty) */
export const parseNum = (text) => Number(toEnglishDigits(String(text ?? '')).replace(/,/g, '')) || 0;

/** An amount in tomans for display */
export const toman = (n) => `${formatPrice(n)} ${t('تومان')}`;

/** A percent for display */
export const pct = (n) => (Number(n) / 100).toLocaleString(intlLocale(), { style: 'percent', maximumFractionDigits: 2 });

/** A labelled field; `hint` is a small line under it */
export function Field({ label, hint, children }) {
  return (
    <label className="tool-field">
      <span className="tool-field-label">{label}</span>
      {children}
      {hint && <small className="tool-field-hint">{hint}</small>}
    </label>
  );
}

/** A number field: thousands separators while typing, an optional unit badge */
export function NumberField({ label, value, onChange, affix, hint, decimals = false }) {
  return (
    <Field label={label} hint={hint}>
      <NumericInput value={value} onValueChange={onChange} allowDecimals={decimals} affix={affix} className={affix ? undefined : "ui-input-control"} inputMode="decimal" />
    </Field>
  );
}

/** The fields of a tool, in a responsive grid */
export function Fields({ children }) {
  return <div className="tool-fields">{children}</div>;
}

/**
 * The result list: `rows` are `{ label, value, strong?, tone? }`; `tone` 'good' | 'bad' colors the value
 * @param {{ rows: Array<{ label: string, value: React.ReactNode, strong?: boolean, tone?: 'good'|'bad' }>, note?: string }} props
 */
export function Results({ rows, note }) {
  return (
    <div className="tool-results" aria-live="polite">
      <dl>
        {rows.filter(Boolean).map((row) => (
          <div key={row.label} className={`tool-result-row${row.strong ? ' is-strong' : ''}`}>
            <dt>{row.label}</dt>
            <dd className={row.tone ? `is-${row.tone}` : undefined}>{row.value}</dd>
          </div>
        ))}
      </dl>
      {note && <p className="tool-note">{note}</p>}
    </div>
  );
}

/** What a tool shows until it has enough to work with */
export function ToolEmpty({ children }) {
  return <p className="tool-empty">{children}</p>;
}
