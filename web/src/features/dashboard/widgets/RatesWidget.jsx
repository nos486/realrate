/**
 * RatesWidget.jsx — «نرخ‌های امروز»: the market assets the user picked (the widget's `assetIds`,
 * the dollar, 18k gold and the Emami coin until they pick others), in their order, each with its
 * price and the last session's change; opens the rates page. Its settings choose which parts a
 * rate shows (change, icon, unit). Prices are not encrypted, so it shows while the vault is locked.
 */

import { intlLocale, t } from '../../../utils/i18n.js';
import React, { useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { usePricing } from '../../market/index.js';
import { CategoryIcon } from '../../portfolio/utils/holdingHelpers.js';
import { buildAssetIndex, resolveHomeAsset } from '../../home/homeAssets.js';
import { formatPrice } from '../../market/assetPrice.js';
import { WIDGET_CATALOG } from '../../../utils/dashboardLayout.js';
import { useDashboardData } from '../DashboardContext.js';
import { wholeText } from '../dashboardFormat.js';
import WidgetCard from '../WidgetCard.jsx';

/** Tiles in one row up to this many; more wrap into rows of equal length */
const ROW_TILES = 4;

export default function RatesWidget({ widget }) {
  const ids = widget.config?.assetIds || WIDGET_CATALOG.rates.defaults.assetIds;
  const style = widget.config?.style || 'tiles';
  const showChange = widget.config?.change !== false;
  const showIcon = widget.config?.icon === true;
  const showUnit = widget.config?.unit === true;
  const { analysis, open } = useDashboardData();
  const pricing = usePricing();
  const index = useMemo(() => buildAssetIndex({ itemMap: pricing?.itemMap, analysis }), [pricing?.itemMap, analysis]);
  const rates = useMemo(
    () => ids.map((id) => resolveHomeAsset(id, index)).filter((asset) => asset.found && asset.price > 0),
    [ids, index],
  );
  if (rates.length === 0) return null;
  const perRow = rates.length <= ROW_TILES ? rates.length : Math.ceil(rates.length / Math.ceil(rates.length / ROW_TILES));

  return (
    <WidgetCard title={t('نرخ‌های امروز')} Icon={TrendingUp} action={{ label: t('بازار'), onClick: () => open('rates') }}>
      <span className={`app-home-rates-grid${style === 'list' ? ' is-list' : ''}`} style={style === 'list' ? undefined : { '--rate-columns': perRow }}>
        {rates.map((r, i) => (
          <span key={r.id} className={`app-home-rate${style !== 'list' && i % perRow === 0 ? ' is-row-start' : ''}`}>
            <small>
              {showIcon && (
                <span className="app-home-rate-icon" aria-hidden="true">
                  {r.flag || <CategoryIcon category={r.category} size={12} />}
                </span>
              )}
              {r.name}
            </small>
            <strong>
              {r.currency === 'usd' ? <bdi>${formatPrice(r.price, 'usd')}</bdi> : wholeText(r.price)}
              {showUnit && r.currency !== 'usd' && <small className="app-home-rate-unit">{r.unit || t('تومان')}</small>}
            </strong>
            {showChange && r.changePercent !== null && Math.abs(r.changePercent) >= 0.01 && (
              <em className={r.changePercent > 0 ? 'is-up' : 'is-down'}>
                {r.changePercent > 0 ? '▲' : '▼'} {Math.abs(r.changePercent).toLocaleString(intlLocale(), { maximumFractionDigits: 2 })}{t('٪')}
              </em>
            )}
          </span>
        ))}
      </span>
    </WidgetCard>
  );
}
