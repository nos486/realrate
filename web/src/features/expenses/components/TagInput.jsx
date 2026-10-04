/**
 * TagInput.jsx — An expense's tags («برچسب»): chips, a field to add one (Enter or «،» / «,»),
 * and the project's tags already in use as one-tap suggestions
 */

import React, { useState } from 'react';
import { X, Tag } from 'lucide-react';
import { normalizeTags, EXPENSE_LIMITS } from '../../../utils/expenseDocument.js';
import TextField from '../../../shared/ui/TextField.jsx';

export default function TagInput({ id = 'expense-tags', value = [], onChange, suggestions = [] }) {
  const [draft, setDraft] = useState('');
  const full = value.length >= EXPENSE_LIMITS.maxTags;
  const add = (text) => {
    const next = normalizeTags([...value, ...normalizeTags(text)]);
    if (next.length !== value.length) onChange(next);
    setDraft('');
  };
  const remove = (tag) => onChange(value.filter((t) => t !== tag));
  const chosen = new Set(value.map((t) => t.toLowerCase()));
  const offered = suggestions.filter((t) => !chosen.has(t.toLowerCase())).slice(0, 12);

  return (
    <div className="ui-input-group expense-tags">
      <label htmlFor={id} className="ui-input-label">برچسب‌ها (اختیاری)</label>
      <div className="expense-tags-box">
        {value.map((tag) => (
          <span key={tag} className="expense-tag-chip">
            <Tag size={11} /> {tag}
            <button type="button" aria-label={`حذف برچسب ${tag}`} onClick={() => remove(tag)}><X size={11} /></button>
          </span>
        ))}
        {!full && (
          <TextField
            id={id}
            className="expense-tags-field"
            value={draft}
            placeholder={value.length ? 'برچسب دیگر…' : 'مثلاً مصالح، دستمزد…'}
            maxLength={EXPENSE_LIMITS.tagLength + 1}
            onChange={(e) => {
              const text = e.target.value;
              // A separator closes the tag being typed
              if (/[,،]/.test(text)) add(text);
              else setDraft(text);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (draft.trim()) add(draft);
              } else if (e.key === 'Backspace' && !draft && value.length) {
                remove(value[value.length - 1]);
              }
            }}
            // The field's own text: a phone keyboard may not have reported it to the state yet
            onBlur={(e) => e.target.value.trim() && add(e.target.value)}
          />
        )}
      </div>
      {offered.length > 0 && !full && (
        <div className="expense-tags-suggest">
          {offered.map((tag) => (
            <button key={tag} type="button" className="expense-tag-suggest" onClick={() => add(tag)}>+ {tag}</button>
          ))}
        </div>
      )}
    </div>
  );
}
