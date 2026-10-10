/**
 * DayRateHint.jsx — Under a foreign amount in a form: its currency's rate on the record's day (from
 * the price history, useDayRate.js) and the tomans it makes — nothing to type, nothing stored
 */

import React from 'react';
import { formatNum } from '../../features/portfolio/utils/holdingHelpers.js';

/**
 * @param {{ unit: string, rate: number, state: null|'loading'|'filled'|'missing', toman?: number,
 *   portfolio?: boolean }} props — unit: the currency's name; toman: the amount in tomans (0: none
 *   yet); portfolio: a portfolio transaction is priced at it (so it must be known)
 */
export default function DayRateHint({ unit, rate, state, toman = 0, portfolio = false }) {
  return (
    <div className="ui-input-group day-rate-hint">
      <p className={`expense-form-hint ${state === 'missing' ? 'is-warning' : ''}`}>
        {state === 'loading' ? `در حال خواندن نرخ ${unit} آن روز…`
          : state === 'missing'
            ? `نرخ ${unit} این روز در تاریخچه‌ی قیمت نیست؛ ${portfolio ? 'برای ثبت در پورتفو روز دیگری انتخاب کنید.' : 'به نرخ امروز حساب می‌شود.'}`
            : <>نرخ {unit} همان روز (از تاریخچه‌ی قیمت): <strong>{formatNum(rate)}</strong> تومان</>}
      </p>
      {toman > 0 && (
        <p className="expense-form-hint">
          معادل حدود <strong>{formatNum(toman)}</strong> تومان{state === 'missing' && ' (به نرخ امروز)'}
        </p>
      )}
    </div>
  );
}
