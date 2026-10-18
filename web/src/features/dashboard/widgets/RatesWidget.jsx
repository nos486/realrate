/**
 * RatesWidget.jsx — «نرخ‌های امروز»: the dollar, 18k gold and the Emami coin with the last
 * session's change; opens the rates page. Prices are not encrypted, so it shows while the
 * vault is locked.
 */

import { intlLocale, t } from '../../../utils/i18n.js';
import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { usePricing } from '../../market/index.js';
import { useDashboardData } from '../DashboardContext.js';
import { wholeText } from '../dashboardFormat.js';

export default function RatesWidget() {
  const { usdToman, analysis, open } = useDashboardData();
  const pricing = usePricing();
  const price = (id) => {
    const item = analysis?.find((i) => i.id === id);
    return item?.market || item?.intrinsic || 0;
  };
  // Each rate's change: its last session's, as the price book gives it (params.changePercent)
  const changeOf = (id) => {
    const change = Number(pricing?.priceBook?.items?.[id]?.params?.changePercent);
    return Number.isFinite(change) ? change : null;
  };
  const rates = [
    { key: 'usd', label: t('دلار'), value: usdToman, change: changeOf('usd') },
    { key: 'gold', label: t('طلای ۱۸'), value: price('gold_18k'), change: changeOf('gold_18k') },
    { key: 'coin', label: t('سکه امامی'), value: price('full_coin'), change: changeOf('full_coin') },
  ].filter((r) => r.value > 0);
  if (rates.length === 0) return null;

  return (
    <button type="button" className="app-home-card app-home-rates" onClick={() => open('rates')} aria-label={t('نرخ‌های امروز — رفتن به بازار')}>
      <span className="app-home-rates-head">
        <span>{t('نرخ‌های امروز')} <small>{t('تومان')}</small></span>
        <ChevronLeft size={16} aria-hidden="true" />
      </span>
      <span className="app-home-rates-grid">
        {rates.map((r) => (
          <span key={r.key} className="app-home-rate">
            <small>{r.label}</small>
            <strong>{wholeText(r.value)}</strong>
            {r.change !== null && Math.abs(r.change) >= 0.01 && (
              <em className={r.change > 0 ? 'is-up' : 'is-down'}>
                {r.change > 0 ? '▲' : '▼'} {Math.abs(r.change).toLocaleString(intlLocale(), { maximumFractionDigits: 2 })}{t('٪')}
              </em>
            )}
          </span>
        ))}
      </span>
    </button>
  );
}
