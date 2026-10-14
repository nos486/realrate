/**
 * DayRateHint.jsx — Under a foreign amount in a form: its currency's rate on the record's day (from
 * the price history, useDayRate.js) and the tomans it makes — nothing to type, nothing stored
 */

import React from 'react';
import { formatNum } from '../../features/portfolio/utils/holdingHelpers.js';
import { t } from '../../utils/i18n.js';

/**
 * @param {{ unit: string, rate: number, state: null|'loading'|'filled'|'missing', toman?: number,
 *   portfolio?: boolean }} props — unit: the currency's name; toman: the amount in tomans (0: none
 *   yet); portfolio: a portfolio transaction is priced at it (so it must be known)
 */
export default function DayRateHint({ unit, rate, state, toman = 0, portfolio = false }) {
  return (
    <div className="ui-input-group day-rate-hint">
      <p className={`expense-form-hint ${state === 'missing' ? 'is-warning' : ''}`}>
        {state === 'loading' ? t('در حال خواندن نرخ {unit} آن روز…', { unit })
          : state === 'missing'
            ? `${t('نرخ {unit} این روز در تاریخچه‌ی قیمت نیست؛', { unit })} ${portfolio ? t('برای ثبت در پورتفو روز دیگری انتخاب کنید.') : t('به نرخ امروز حساب می‌شود.')}`
            : <>{t('نرخ {unit} همان روز (از تاریخچه‌ی قیمت):', { unit })} <strong>{formatNum(rate)}</strong> {t('تومان')}</>}
      </p>
      {toman > 0 && (
        <p className="expense-form-hint">
          {t('معادل حدود')} <strong>{formatNum(toman)}</strong> {t('تومان')}{state === 'missing' && ` (${t('به نرخ امروز')})`}
        </p>
      )}
    </div>
  );
}
