/**
 * DollarValue.jsx — A record (or a list) seen in dollars, the same everywhere (utils/dollarValue.js)
 *
 * - DollarValueLine: under a row's amount — «≈ ۳۲۰ دلار · امروز ۴۰ میلیون تومان (+۲۵٪)»
 * - DollarValueFoot: a summary card's footer — what the dollars are worth today, and how many
 *   records are left out for want of their day's rate
 * - DollarPnl: an investment's profit or loss in dollars (bought at each day's rate, valued today)
 *
 * `tone`: 'rate' (an expense or an income: the change is the dollar's own, neither good nor bad)
 * or 'pnl' (an investment: more is a profit).
 */

import { intlLocale, t } from '../../utils/i18n.js';
import React from 'react';

const MASK = '****';
const toman = (v) => Math.round(Number(v) || 0).toLocaleString(intlLocale());
export const formatUsd = (v) => (Number(v) || 0).toLocaleString(intlLocale(), { maximumFractionDigits: v >= 100 ? 0 : 2 });

/** «به نرخ امروز <strong>X</strong> تومان» with the amount emphasised wherever the translation puts it */
function atTodayRate(amount) {
  const [before, after] = t('به نرخ امروز {amount} تومان', { amount: '\u0000' }).split('\u0000');
  return <>{before}<strong>{amount}</strong>{after}</>;
}

function Change({ pct, tone }) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return null;
  const up = pct >= 0;
  const cls = tone === 'pnl' ? (up ? 'is-profit' : 'is-loss') : up ? 'is-up' : 'is-down';
  return <b className={cls}> ({up ? '+' : '−'}{Math.abs(pct).toLocaleString(intlLocale(), { maximumFractionDigits: 0 })}{t('٪')})</b>;
}

/**
 * @param {{ value: { usd: number, todayToman: number|null, changePct: number|null }|null,
 *   hideValues?: boolean, tone?: 'rate'|'pnl', title?: string }} props
 */
export function DollarValueLine({ value, hideValues = false, tone = 'rate', title }) {
  if (!value) return null;
  return (
    <span className="dollar-value-line" title={title}>
      {t('≈ {amount} دلار', { amount: hideValues ? MASK : formatUsd(value.usd) })}
      {value.todayToman !== null && value.todayToman !== undefined && (
        <>
          {' · '}{t('امروز {amount} تومان', { amount: hideValues ? MASK : toman(value.todayToman) })}
          <Change pct={value.changePct} tone={tone} />
        </>
      )}
    </span>
  );
}

/**
 * @param {{ view: ReturnType<import('../../utils/dollarValue.js').summarizeDollarValues>,
 *   noun: string, hideValues?: boolean, tone?: 'rate'|'pnl' }} props - noun: «هزینه», «درآمد», …
 */
export function DollarValueFoot({ view, noun, hideValues = false, tone = 'rate' }) {
  return (
    <span className="dollar-value-foot">
      {view.todayToman !== null && (
        <>
          {atTodayRate(hideValues ? MASK : toman(view.todayToman))}
          <Change pct={view.changePct} tone={tone} />
        </>
      )}
      {view.missing > 0 && <small> · {t('{n} {noun} بدون نرخ دلار آن روز حساب نشده', { n: view.missing.toLocaleString(intlLocale()), noun: t(noun) })}</small>}
    </span>
  );
}

/**
 * @param {{ pnl: { pnlUsd: number, pnlPct: number|null, partial?: boolean, missingQty?: number }|null,
 *   hideValues?: boolean }} props
 */
export function DollarPnl({ pnl, hideValues = false }) {
  if (!pnl) return null;
  const up = pnl.pnlUsd >= 0;
  const partial = pnl.partial || pnl.missingQty > 1e-9;
  return (
    <span className="dollar-value-foot" title={t('بهای هر خرید به نرخ دلار روز خودش، ارزش به نرخ دلار امروز')}>
      {t('به دلار:')}{' '}
      <b className={up ? 'is-profit' : 'is-loss'}>
        {hideValues ? MASK : `${up ? '+' : '−'}${formatUsd(Math.abs(pnl.pnlUsd))}`}
      </b>{' '}
      {t('دلار')}
      {pnl.pnlPct !== null && <Change pct={pnl.pnlPct} tone="pnl" />}
      {partial && <small> · {t('خریدهای بدون تاریخ یا نرخ دلار حساب نشده')}</small>}
    </span>
  );
}
