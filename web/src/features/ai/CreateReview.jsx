/**
 * CreateReview.jsx — The `create` intent's form: the fields of a new cheque or subscription, filled from
 * the voice, to correct and complete before it is saved (aiCreate.js SPECS says which fields)
 */

import React from 'react';
import { t } from '../../utils/i18n.js';
import { NumericInput } from '../../shared/ui/index.js';
import DateField from '../../shared/form/DateField.jsx';
import { gregorianToShamsi, shamsiToGregorian } from '../portfolio/components/ShamsiDatePicker.jsx';
import { SPECS } from './aiCreate.js';

/**
 * @param {{ answer: { type: string, data: object }, onChange: (answer: object) => void,
 *   context: { accounts: Array<{ id: string, name: string }> } }} props
 */
export default function CreateReview({ answer, onChange, context }) {
  const spec = SPECS[answer.type];
  const accounts = context?.accounts || [];
  if (!spec) return null;
  const set = (key, value) => onChange({ ...answer, data: { ...answer.data, [key]: value } });

  return (
    <div className="ai-create">
      <strong className="ai-assistant-heading">{spec.label()}</strong>
      {spec.fields.map((field) => {
        const value = answer.data[field.key];
        const missing = field.required && (field.kind === 'amount' ? !(value > 0) : !String(value ?? '').trim());
        const cls = `ui-input-control ${missing ? 'is-missing' : ''}`;
        if (field.kind === 'day') {
          return <DateField key={field.key} label={field.label()} value={gregorianToShamsi(`${value}T00:00:00`)} onChange={(shamsi) => set(field.key, shamsiToGregorian(shamsi) || value)} />;
        }
        if (field.kind === 'account' && !accounts.length) return null;
        return (
          <label key={field.key} className="ai-create-row">
            <span>{field.label()}</span>
            {field.kind === 'amount' && (
              <NumericInput className={cls} placeholder={t('مبلغ را وارد کنید')} affix={t('تومان')} value={value ? String(value) : ''} onValueChange={(v) => set(field.key, Math.round(Number(String(v).replace(/[^\d]/g, ''))) || 0)} />
            )}
            {field.kind === 'text' && <input className={cls} value={value ?? ''} maxLength={60} onChange={(e) => set(field.key, e.target.value)} />}
            {field.kind === 'select' && (
              <select className="ui-input-control" value={value} onChange={(e) => set(field.key, field.number ? Number(e.target.value) : e.target.value)}>
                {field.options().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
            {field.kind === 'bool' && <input type="checkbox" checked={Boolean(value)} onChange={(e) => set(field.key, e.target.checked)} />}
            {field.kind === 'account' && (
              <select className="ui-input-control" value={value ?? ''} onChange={(e) => set(field.key, e.target.value)}>
                <option value="">{t('بدون حساب')}</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
          </label>
        );
      })}
    </div>
  );
}
