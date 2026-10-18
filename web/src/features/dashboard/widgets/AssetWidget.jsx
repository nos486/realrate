/**
 * AssetWidget.jsx — «قیمت یک دارایی»: one market asset the user picked (the widget's `assetId`
 * option) as a home card; a wide widget shows the full card with its chart, a narrow one the
 * compact row. Without a choice it asks for one.
 */

import { t } from '../../../utils/i18n.js';
import React, { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { usePricing } from '../../market/context/PricingContext.jsx';
import HomeAssetCard from '../../home/HomeAssetCard.jsx';
import { buildAssetIndex, resolveHomeAsset } from '../../home/homeAssets.js';
import { useDashboardData } from '../DashboardContext.js';
import DashScroll from '../DashScroll.jsx';

export default function AssetWidget({ widget, editing, onConfigure }) {
  const { analysis } = useDashboardData();
  const pricing = usePricing();
  const index = useMemo(() => buildAssetIndex({ itemMap: pricing?.itemMap, analysis }), [pricing?.itemMap, analysis]);
  const assetId = widget.config?.assetId;
  const asset = useMemo(() => (assetId ? resolveHomeAsset(assetId, index) : null), [assetId, index]);

  if (!asset || !asset.found) {
    return (
      <button type="button" className="app-home-empty" onClick={onConfigure} disabled={!editing && !onConfigure}>
        <Plus size={18} />
        {t('یک دارایی انتخاب کنید')}
      </button>
    );
  }
  return (
    <DashScroll>
      <div className="home-item dash-asset">
        <HomeAssetCard asset={asset} style={widget.size >= 2 ? 'detailed' : 'compact'} flippable={!editing} />
      </div>
    </DashScroll>
  );
}
