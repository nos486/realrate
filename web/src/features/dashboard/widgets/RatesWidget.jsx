/**
 * RatesWidget.jsx — «نرخ‌های امروز»: the dollar, 18k gold and the Emami coin with the last
 * session's change; opens the rates page. Prices are not encrypted, so it shows while the
 * vault is locked.
 */

import { intlLocale, t } from '../../../utils/i18n.js';
import React from 'react';
import { TrendingUp } from 'lucide-react';
import { usePricing } from '../../market/index.js';
import { useDashboardData } from '../DashboardContext.js';
import { wholeText } from '../dashboardFormat.js';
import WidgetCard from '../WidgetCard.jsx';

export default function RatesWidget({ widget }) {
  const items = widget.config?.items || ['usd', 'gold_18k', 'full_coin'];
  const style = widget.config?.style || 'tiles';
  const showChange = widget.config?.change !== false;
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
    { key: 'gold_18k', label: t('طلای ۱۸'), value: price('gold_18k'), change: changeOf('gold_18k') },
    { key: 'full_coin', label: t('سکه امامی'), value: price('full_coin'), change: changeOf('full_coin') },
  ].filter((r) => items.includes(r.key) && r.value > 0);
  if (rates.length === 0) return null;

  return (
    <WidgetCard title={t('نرخ‌های امروز')} Icon={TrendingUp} action={{ label: t('بازار'), onClick: () => open('rates') }}>
      <span className={`app-home-rates-grid${style === 'list' ? ' is-list' : ''}`}>
        {rates.map((r) => (
          <span key={r.key} className="app-home-rate">
            <small>{r.label}</small>
            <strong>{wholeText(r.value)}</strong>
            {showChange && r.change !== null && Math.abs(r.change) >= 0.01 && (
              <em className={r.change > 0 ? 'is-up' : 'is-down'}>
                {r.change > 0 ? '▲' : '▼'} {Math.abs(r.change).toLocaleString(intlLocale(), { maximumFractionDigits: 2 })}{t('٪')}
              </em>
            )}
          </span>
        ))}
      </span>
    </WidgetCard>
  );
}
