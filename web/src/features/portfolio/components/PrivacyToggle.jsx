import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { usePrivacyMode, setPrivacyMode } from '../../../hooks/usePrivacyMode.js';

export default function PrivacyToggle({ className = '', style = {} }) {
  const hideValues = usePrivacyMode();

  const toggle = () => setPrivacyMode(!hideValues);

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
