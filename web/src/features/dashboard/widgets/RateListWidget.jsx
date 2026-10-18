/**
 * RateListWidget.jsx — «نرخ‌های دلخواه»: up to four market assets the user picked (the widget's
 * `assetIds` option) drawn as tiles (a grid) or as rows (a list, the `style` setting) that fill
 * the widget with no scrolling. Each one shows its icon, name, price with its unit, the last
 * change as a coloured pill and — in the grid — where the price sits in today's low–high range.
 * The tiles share the widget's height by how many assets there are; while arranging, the free
 * slots are buttons that open the picker, and a widget with none asks for them.
 */

import { intlLocale, t } from '../../../utils/i18n.js';
import React, { useMemo } from 'react';
import { List, Plus } from 'lucide-react';
import { usePricing } from '../../market/context/PricingContext.jsx';
import { CategoryIcon } from '../../portfolio/utils/holdingHelpers.js';
import { buildAssetIndex, resolveHomeAsset } from '../../home/homeAssets.js';
import { formatPrice } from '../../market/assetPrice.js';
import { DASHBOARD_LIMITS } from '../../../utils/dashboardLayout.js';
import { useDashboardData } from '../DashboardContext.js';
import WidgetCard from '../WidgetCard.jsx';
import WidgetState from '../WidgetState.jsx';

const SLOTS = DASHBOARD_LIMITS.rateListAssets;

/** The asset's flag or category icon, in a small rounded badge */
function RateIcon({ asset }) {
  return (
    <span className="dash-rate-icon" aria-hidden="true">
      {asset.flag ? <span className="dash-rate-flag">{asset.flag}</span> : <CategoryIcon category={asset.category} size={15} />}
    </span>
  );
}

/** The last change as a coloured pill (a flat one reads «۰٪») */
function ChangePill({ value }) {
  if (value === null || value === undefined) return null;
  const flat = Math.abs(value) < 0.01;
  const tone = flat ? 'is-flat' : value > 0 ? 'is-up' : 'is-down';
  const shown = flat ? 0 : Math.abs(value);
  return (
    <span className={`dash-rate-change ${tone}`}>
      {flat ? '' : value > 0 ? '▲ ' : '▼ '}{shown.toLocaleString(intlLocale(), { maximumFractionDigits: 2 })}{t('٪')}
    </span>
  );
}

/** Today's low–high as a thin bar with a marker where the price is now (nothing without a range) */
function DayRange({ asset }) {
  const range = asset.dayRange;
  if (!range || !(range.high > range.low) || !(asset.price > 0)) return null;
  const at = Math.min(1, Math.max(0, (asset.price - range.low) / (range.high - range.low)));
  return (
    <div className="dash-rate-range" title={t('بازه‌ی امروز')}>
      <span className="dash-rate-range-bar"><i style={{ insetInlineStart: `${(at * 100).toFixed(1)}%` }} /></span>
      <span className="dash-rate-range-ends">
        <small>{formatPrice(range.low, asset.currency)}</small>
        <small>{formatPrice(range.high, asset.currency)}</small>
      </span>
    </div>
  );
}

/** One asset: icon and name, price with its unit, change and (grid only) the day's range */
function RateTile({ asset, showChange, showRange }) {
  return (
    <div className="dash-rate-tile">
      <div className="dash-rate-name">
        <RateIcon asset={asset} />
        <span>
          <strong>{asset.name}</strong>
          {asset.perUnit && <small>{t('هر {unit}', { unit: asset.perUnit })}</small>}
        </span>
        {asset.stale && <span className="home-stale-mark">{t('قدیمی')}</span>}
      </div>
      <div className="dash-rate-price">
        <b>{asset.currency === 'usd' ? <bdi>${formatPrice(asset.price, 'usd')}</bdi> : formatPrice(asset.price)}</b>
        {asset.currency !== 'usd' && <small>{asset.unit || t('تومان')}</small>}
        {showChange && <ChangePill value={asset.changePercent} />}
      </div>
      {showRange && <DayRange asset={asset} />}
    </div>
  );
}

export default function RateListWidget({ widget, editing, onConfigure }) {
  const { analysis } = useDashboardData();
  const pricing = usePricing();
  const index = useMemo(() => buildAssetIndex({ itemMap: pricing?.itemMap, analysis }), [pricing?.itemMap, analysis]);
  const assetIds = widget.config?.assetIds;
  const assets = useMemo(
    () => (assetIds || []).map((id) => resolveHomeAsset(id, index)).filter((asset) => asset?.found).slice(0, SLOTS),
    [assetIds, index],
  );
  const style = widget.config?.style || 'grid';
  const showChange = widget.config?.change !== false;
  const showRange = widget.config?.range !== false && style === 'grid';
  // While arranging, the free slots show as buttons; otherwise the tiles share the height
  const slots = editing ? Array(SLOTS - assets.length).fill(null) : [];

  return (
    <WidgetCard title={t('نرخ‌های دلخواه')} Icon={List}>
      {assets.length === 0 && !editing ? (
        <WidgetState state="empty" message={t('نرخ‌های دلخواه را انتخاب کنید')} onAction={onConfigure} />
      ) : (
        <div className={`dash-rate-list is-${style}`} data-count={assets.length + slots.length}>
          {assets.map((asset) => <RateTile key={asset.id} asset={asset} showChange={showChange} showRange={showRange} />)}
          {slots.map((_, i) => (
            <button key={`free-${i}`} type="button" className="dash-rate-tile is-empty" onClick={onConfigure} disabled={!onConfigure} aria-label={t('نرخ‌های دلخواه را انتخاب کنید')}>
              <Plus size={18} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}
