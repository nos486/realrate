import React, { forwardRef, useRef, useImperativeHandle } from 'react';
import { formatThousands } from '../../utils/formatters.js';

/**
 * Universal NumericInput Component
 * Formats numbers with 3-digit comma separators (thousands separator: e.g. 234,370 or 4,420.1)
 * Automatically preserves cursor position while typing, deleting, or editing.
 *
 * @param {string|number} value - Input value
 * @param {function} [onChange] - Standard change handler: receives synthetic event (e.target.value formatted) and raw value
 * @param {function} [onValueChange] - Direct value handler: receives formatted string
 * @param {boolean} [allowDecimals=false] - Whether decimal points are allowed
 * @param {string} [placeholder]
 * @param {string} [className]
 * @param {string} [id]
 * @param {string} [name]
 * @param {boolean} [disabled=false]
 * @param {boolean} [required=false]
 * @param {React.ReactNode} [affix] - Optional affix badge (e.g. "تومان" or "USD")
 * @param {object} [style]
 */
export const NumericInput = forwardRef(function NumericInput(
  {
    value = '',
    onChange,
    onValueChange,
    allowDecimals = false,
    placeholder = '',
    className = '',
    id,
    name,
    disabled = false,
    required = false,
    affix = null,
    style = {},
    ...rest
  },
  forwardedRef
) {
  const innerRef = useRef(null);
  useImperativeHandle(forwardedRef, () => innerRef.current);

  const handleChange = (e) => {
    const input = e.target;
    const rawValue = input.value;
    const cursorPosition = input.selectionStart ?? rawValue.length;
    const charsBeforeCursor = rawValue.slice(0, cursorPosition).replace(/,/g, '').length;

    const formatted = formatThousands(rawValue, allowDecimals);

    if (onValueChange) {
      onValueChange(formatted);
    }

    if (onChange) {
      const synthEvent = {
        ...e,
        target: {
          ...(input || {}),
          value: formatted,
          id,
          name,
        },
        currentTarget: {
          ...(input || {}),
          value: formatted,
          id,
          name,
        },
      };
      onChange(synthEvent, formatted);
    }

    // Preserve cursor position across comma insertions/removals
    requestAnimationFrame(() => {
      if (!innerRef.current) return;
      let newPos = 0;
      let charsCount = 0;
      for (let i = 0; i < formatted.length; i++) {
        if (formatted[i] !== ',') {
          charsCount++;
        }
        if (charsCount === charsBeforeCursor) {
          newPos = i + 1;
          break;
        }
      }
      if (charsBeforeCursor === 0) newPos = 0;
      innerRef.current.setSelectionRange(newPos, newPos);
    });
  };

  const displayValue = formatThousands(value, allowDecimals);

  const inputNode = (
    <input
      ref={innerRef}
      type="text"
      inputMode={allowDecimals ? 'decimal' : 'numeric'}
      id={id}
      name={name}
      placeholder={placeholder}
      value={displayValue}
      onChange={handleChange}
      disabled={disabled}
      required={required}
      className={className}
      style={style}
      autoComplete="off"
      {...rest}
    />
  );

  if (affix) {
    return (
      <div className="toolbar-input-wrapper">
        {inputNode}
        <span className="input-affix">{affix}</span>
      </div>
    );
  }

  return inputNode;
});

export default NumericInput;
