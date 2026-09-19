import React, { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function PrivacyToggle({ className = '', style = {} }) {
  const [hideValues, setHideValues] = useState(() => {
    try {
      return localStorage.getItem('realrate_hide_values') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onPrivacyChange = (e) => {
      try {
        if (e && e.detail && typeof e.detail.hideValues === 'boolean') {
          setHideValues(e.detail.hideValues);
        } else {
          setHideValues(localStorage.getItem('realrate_hide_values') === 'true');
        }
      } catch {}
    };
    window.addEventListener('realrate_privacy_change', onPrivacyChange);
    window.addEventListener('storage', onPrivacyChange);
    return () => {
      window.removeEventListener('realrate_privacy_change', onPrivacyChange);
      window.removeEventListener('storage', onPrivacyChange);
    };
  }, []);

  const toggle = () => {
    const next = !hideValues;
    try {
      localStorage.setItem('realrate_hide_values', String(next));
      window.dispatchEvent(new CustomEvent('realrate_privacy_change', { detail: { hideValues: next } }));
    } catch {}
    setHideValues(next);
  };

  return (
    <button
      type="button"
      className={`btn-privacy-toggle ${hideValues ? 'active' : ''} ${className}`}
      onClick={toggle}
      title={hideValues ? 'نمایش مقادیر عددی' : 'مخفی کردن مقادیر (حالت حریم خصوصی)'}
      aria-label="حالت حریم خصوصی"
      style={style}
    >
      {hideValues ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  );
}
