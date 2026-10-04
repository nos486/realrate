/**
 * PriceRefreshButton — The header's refresh button: reads the prices again now (and, in the
 * Android app, syncs the device's copy of the records). Prices are not read on a timer: this, a
 * change of tab and coming back to the app are what refresh them (PricingContext).
 */

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { usePricing } from '../context/PricingContext.jsx';
import { isOfflineActive, syncNow } from '../../../shared/offline/offlineSync.js';

/**
 * @param {{ className?: string, iconSize?: number, onPress?: () => void }} props
 */
export default function PriceRefreshButton({ className = '', iconSize = 18, onPress }) {
  const pricing = usePricing();
  if (!pricing) return null;
  const { refreshing, refresh } = pricing;

  const onClick = () => {
    onPress?.();
    refresh();
    if (isOfflineActive()) syncNow().catch(() => {});
  };

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={refreshing}
      aria-busy={refreshing}
      aria-label="به‌روزرسانی قیمت‌ها"
      title="به‌روزرسانی قیمت‌ها"
    >
      <RefreshCw size={iconSize} className={refreshing ? 'is-spinning' : ''} />
    </button>
  );
}
