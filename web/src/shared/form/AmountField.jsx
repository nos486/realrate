/**
 * AmountField.jsx — The first thing an entry form asks: how much, large, with its currency beside
 * the number (a compact selector, not a row of its own) and the amount in words under it — a zero
 * too many or too few in tomans is plain to see there
 *
 * Shared by every entry form (docs/en/DESIGN.md «Entry forms»). What else belongs under the amount
 * (a foreign currency's rate of the day, DayRateHint) is passed as children. An amount that is not
 * money — an asset's quantity in its own unit (grams, coins, shares) — passes `unit` (shown beside
 * the number; the label is then used as given) and its own `allowDecimals`; an optional one
 * `required={false}`.
 */

import React from 'react';
import { NumericInput } from '../ui/index.js';
import { CURRENCIES, allowsDecimals, currencyLabel } from '../../utils/currencies.js';
import { parseInputNumber } from '../../features/portfolio/utils/holdingHelpers.js';
import { numberToWords } from '../utils/numberWords.js';

const CURRENCY_OPTIONS = CURRENCIES.map(({ code, label }) => ({ value: code, label }));

/**
 * @param {{ id: string, value: string, onValueChange: (v: string) => void, currency?: string,
 *   onCurrencyChange?: (code: string) => void, unit?: string, allowDecimals?: boolean,
 *   required?: boolean, label?: string, placeholder?: string, autoFocus?: boolean,
 *   children?: React.ReactNode }} props — without onCurrencyChange the currency is shown, not
 *   chosen; `unit` instead of a currency for an amount that isn't money
 */
export default function AmountField({
  id, value, onValueChange, currency = 'IRT', onCurrencyChange, unit: ownUnit = '', allowDecimals, required = true,
  label = 'مبلغ', placeholder = '', autoFocus = false, children = null,
}) {
  const unit = ownUnit || currencyLabel(currency);
  const amount = parseInputNumber(value);
  const words = amount > 0 && Number.isInteger(amount) ? numberToWords(amount) : '';
  return (
    <div className="ui-input-group amount-field">
      <label htmlFor={id} className="ui-input-label">{ownUnit ? label : `${label} (${unit})`}{required ? ' *' : ''}</label>
      <div className="amount-field-box">
        <NumericInput
          id={id}
          value={value}
          onValueChange={onValueChange}
          allowDecimals={allowDecimals ?? (ownUnit ? true : allowsDecimals(currency))}
          placeholder={placeholder || '۰'}
          className="amount-field-input"
          autoFocus={autoFocus}
          required={required}
        />
        {onCurrencyChange && !ownUnit ? (
          <select
            className="amount-field-currency"
            aria-label="ارز"
            value={currency}
            onChange={(e) => onCurrencyChange(e.target.value)}
          >
            {CURRENCY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        ) : (
          <span className="amount-field-currency is-static">{unit}</span>
        )}
      </div>
      {words && <p className="amount-field-words">{words} {unit}</p>}
      {children}
    </div>
  );
}
