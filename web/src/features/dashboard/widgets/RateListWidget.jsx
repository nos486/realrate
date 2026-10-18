/**
 * RateListWidget.jsx — «نرخ‌های دلخواه»: up to four market assets the user picked (the widget's
 * `assetIds` option) as a 2×2 grid of tiles or as a list of rows (the `style` setting) — name, price and the
 * last change — that fills the widget with no scrolling. An empty slot is a button that opens
 * the picker.
 */

import { intlLocale, t } from '../../../utils/i18n.js';
import React, { useMemo } from 'react';
import { List, Plus } from 'lucide-react';
import { usePricing } from '../../market/context/PricingContext.jsx';
import { buildAssetIndex, resolveHomeAsset } from '../../home/homeAssets.js';
import { formatPrice } from '../../market/assetPrice.js';
import { DASHBOARD_LIMITS } from '../../../utils/dashboardLayout.js';
import { useDashboardData } from '../DashboardContext.js';
import WidgetCard from '../WidgetCard.jsx';

const SLOTS = DASHBOARD_LIMITS.rateListAssets;

export default function RateListWidget({ widget, editing, onConfigure }) {
  const { analysis } = useDashboardData();
  const pricing = usePricing();
  const index = useMemo(() => buildAssetIndex({ itemMap: pricing?.itemMap, analysis }), [pricing?.itemMap, analysis]);
  const assetIds = widget.config?.assetIds;
  const assets = useMemo(
    () => (assetIds || []).map((id) => resolveHomeAsset(id, index)).filter((asset) => asset?.found).slice(0, SLOTS),
    [assetIds, index],
  );
  const tiles = [...assets, ...Array(SLOTS - assets.length).fill(null)];
  const style = widget.config?.style || 'grid';
  const showChange = widget.config?.change !== false;

  return (
    <WidgetCard title={t('نرخ‌های دلخواه')} Icon={List}>
      <div className={`dash-rate-list is-${style}`}>
        {tiles.map((asset, i) => asset ? (
          <div key={asset.id} className="dash-rate-tile">
            <small>{asset.name}</small>
            <strong>{asset.currency === 'usd' ? <bdi>${formatPrice(asset.price, 'usd')}</bdi> : formatPrice(asset.price)}</strong>
            {showChange && asset.changePercent !== null && Math.abs(asset.changePercent) >= 0.01 && (
              <em className={asset.changePercent > 0 ? 'is-up' : 'is-down'}>
                {asset.changePercent > 0 ? '▲' : '▼'} {Math.abs(asset.changePercent).toLocaleString(intlLocale(), { maximumFractionDigits: 2 })}{t('٪')}
              </em>
            )}
          </div>
        ) : (
          <button key={`empty-${i}`} type="button" className="dash-rate-tile is-empty" onClick={onConfigure} disabled={!editing || !onConfigure} aria-label={t('نرخ‌های دلخواه را انتخاب کنید')}>
            {editing && <Plus size={18} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </WidgetCard>
  );
}
