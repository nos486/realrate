/**
 * PageRefreshButton — The header's refresh button: reads again only what the open tab shows
 * (pageRefresh.js) — the prices on the market tab, the news on the news tab, the records on a
 * records tab. Hidden on a tab with nothing to read again (settings).
 */

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { usePageRefresh } from './pageRefresh.js';

/**
 * @param {{ className?: string, iconSize?: number, onPress?: () => void }} props
 */
export default function PageRefreshButton({ className = '', iconSize = 18, onPress }) {
  const { available, refreshing, refresh } = usePageRefresh();
  if (!available) return null;

  const onClick = () => {
    onPress?.();
    refresh();
  };

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={refreshing}
      aria-busy={refreshing}
      aria-label="به‌روزرسانی"
      title="به‌روزرسانی"
    >
      <RefreshCw size={iconSize} className={refreshing ? 'is-spinning' : ''} />
    </button>
  );
}
