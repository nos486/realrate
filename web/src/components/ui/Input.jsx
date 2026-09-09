import React, { forwardRef } from 'react';
import { X } from 'lucide-react';

/**
 * Universal Minimalist Input Component
 * Driven entirely by CSS design tokens with clean borderless design.
 *
 * @param {string} [label]
 * @param {string} [error]
 * @param {string} [hint]
 * @param {React.ReactNode} [icon]
 * @param {boolean} [clearable=false]
 * @param {() => void} [onClear]
 * @param {'sm' | 'md' | 'lg'} [size='md']
 * @param {'input' | 'textarea'} [as='input']
 */
export const Input = forwardRef(function Input(
  {
    label,
    error,
    hint,
    icon = null,
    clearable = false,
    onClear,
    size = 'md',
    as = 'input',
    className = '',
    style = {},
    id,
    disabled = false,
    value,
    ...props
  },
  ref
) {
  const Component = as === 'textarea' ? 'textarea' : 'input';
  const hasValue = value !== undefined && value !== null && String(value).length > 0;

  return (
    <div className={`ui-input-group ui-input-size-${size} ${error ? 'has-error' : ''} ${disabled ? 'is-disabled' : ''} ${className}`} style={style}>
      {label && (
        <label htmlFor={id} className="ui-input-label">
          {label}
        </label>
      )}

      <div className="ui-input-wrapper">
        {icon && <span className="ui-input-icon leading">{icon}</span>}

        <Component
          ref={ref}
          id={id}
          className={`ui-input-control ${icon ? 'has-leading-icon' : ''} ${clearable && hasValue ? 'has-clear-btn' : ''}`}
          disabled={disabled}
          value={value}
          {...props}
        />

        {clearable && hasValue && !disabled && (
          <button
            type="button"
            className="ui-input-clear-btn"
            onClick={onClear}
            tabIndex={-1}
            aria-label="پاک کردن"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {error ? (
        <span className="ui-input-error">{error}</span>
      ) : hint ? (
        <span className="ui-input-hint">{hint}</span>
      ) : null}
    </div>
  );
});

export default Input;
