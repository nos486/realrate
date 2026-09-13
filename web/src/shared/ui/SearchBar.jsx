import React from 'react';
import { Search, X } from 'lucide-react';

/**
 * Standard SearchBar component with clear button and focus ring
 */
export default function SearchBar({
  value,
  onChange,
  onClear = null,
  placeholder = 'جستجو...',
  className = '',
  style = {},
  disabled = false,
  autoFocus = false,
  badge = null,
}) {
  const handleClear = () => {
    if (onClear) {
      onClear();
    } else if (onChange) {
      onChange({ target: { value: '' } });
    }
  };

  return (
    <div className={`ui-search-bar ${className}`} style={style}>
      <Search size={15} strokeWidth={2} className="search-bar-icon" />
      <input
        type="text"
        className="search-bar-input"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
      />
      {badge && <span className="search-bar-badge">{badge}</span>}
      {value && (
        <button
          type="button"
          className="search-bar-clear"
          onClick={handleClear}
          aria-label="پاک‌کردن جستجو"
          title="پاک‌کردن"
        >
          <X size={14} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}
