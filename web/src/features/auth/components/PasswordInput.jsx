import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/** Password field with a show/hide toggle; props pass through to the <input> */
export default function PasswordInput({ id, label, hint, error, ...inputProps }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={`ui-input-group ${error ? 'has-error' : ''}`}>
      {label && <label htmlFor={id} className="ui-input-label">{label}</label>}
      <div className="ui-input-wrapper auth-password-wrap">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className="ui-input-control"
          dir="ltr"
          autoCapitalize="none"
          spellCheck={false}
          {...inputProps}
        />
        <button
          type="button"
          className="auth-password-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'پنهان کردن رمز' : 'نمایش رمز'}
          aria-pressed={visible}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {error ? <span className="ui-input-error">{error}</span> : hint && <span className="ui-input-hint">{hint}</span>}
    </div>
  );
}
