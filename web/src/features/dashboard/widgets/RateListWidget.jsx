/**
 * RateListWidget.jsx — «نرخ‌های دلخواه»: the market assets the user picked (the widget's
 * `assetIds` option), each as the compact home row with its price and change; the list scrolls
 * inside the widget. Without a choice it asks for one.
 */

import { t } from '../../../utils/i18n.js';
import React, { useMemo } from 'react';
import { List } from 'lucide-react';
import { usePricing } from '../../market/context/PricingContext.jsx';
import HomeAssetCard from '../../home/HomeAssetCard.jsx';
import { buildAssetIndex, resolveHomeAsset } from '../../home/homeAssets.js';
import { useDashboardData } from '../DashboardContext.js';
import WidgetCard from '../WidgetCard.jsx';
import WidgetState from '../WidgetState.jsx';

export default function RateListWidget({ widget, editing, onConfigure }) {
  const { analysis } = useDashboardData();
  const pricing = usePricing();
  const index = useMemo(() => buildAssetIndex({ itemMap: pricing?.itemMap, analysis }), [pricing?.itemMap, analysis]);
  const assetIds = widget.config?.assetIds;
  const assets = useMemo(
    () => (assetIds || []).map((id) => resolveHomeAsset(id, index)).filter((asset) => asset?.found),
    [assetIds, index],
  );

  const title = t('نرخ‌های دلخواه');
  if (assets.length === 0) {
    return (
      <WidgetCard title={title} Icon={List}>
        <WidgetState state="empty" message={t('نرخ‌های دلخواه را انتخاب کنید')} onAction={onConfigure} disabled={!editing && !onConfigure} />
      </WidgetCard>
    );
  }
  return (
    <WidgetCard title={title} Icon={List}>
      <div className="dash-scroll">
        <div className={`dash-rate-list is-size-${widget.size}`}>
          {assets.map((asset) => (
            <div key={asset.id} className="home-item dash-asset">
              <HomeAssetCard asset={asset} style="compact" flippable={false} />
            </div>
          ))}
        </div>
      </div>
    </WidgetCard>
  );
}
