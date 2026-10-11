/**
 * UnitAmountField.jsx — The portfolio forms' large number field for an amount in an asset's own
 * unit (grams, coins, shares) or an optional price: the entry form's amount (shared/form
 * AmountField, the same look and classes) where the unit is not one of the money currencies and
 * the field may be optional
 *
 * The unit is shown beside the number, and a whole number in words under it.
 */

import React from 'react';
import { NumericInput } from '../../../shared/ui/index.js';
import { numberToWords } from '../../../shared/utils/numberWords.js';
import { parseInputNumber } from '../utils/holdingHelpers.js';

/**
 * @param {{ id: string, label: string, unit: string, value: string,
 *   onValueChange: (v: string) => void, allowDecimals?: boolean, required?: boolean,
 *   placeholder?: string, autoFocus?: boolean, children?: React.ReactNode }} props — children:
 *   what belongs under the number (a hint)
 */
export default function UnitAmountField({
  id, label, unit, value, onValueChange, allowDecimals = true, required = true, placeholder = '', autoFocus = false, children = null,
}) {
  const amount = parseInputNumber(value);
  const words = amount > 0 && Number.isInteger(amount) ? numberToWords(amount) : '';
  return (
    <div className="ui-input-group amount-field">
      <label htmlFor={id} className="ui-input-label">{label}{required ? ' *' : ''}</label>
      <div className="amount-field-box">
        <NumericInput
          id={id}
          value={value}
          onValueChange={onValueChange}
          allowDecimals={allowDecimals}
          placeholder={placeholder || '۰'}
          className="amount-field-input"
          autoFocus={autoFocus}
          required={required}
        />
        <span className="amount-field-currency is-static">{unit}</span>
      </div>
      {words && <p className="amount-field-words">{words} {unit}</p>}
      {children}
    </div>
  );
}
