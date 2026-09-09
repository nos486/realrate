import React from 'react';

/**
 * Standard FilterPills / SegmentedTabs component
 *
 * Used for:
 * - Market / Portfolio tabs in MainPage
 * - Timeframe selector in Charts (1H, 24H, 7D, 1M, ALL)
 * - Category filter in PriceSourcesPage (All, USD, Gold, Forex)
 * - Category filter in PortfolioTracker
 */
export default function FilterPills({
  options = [],
  activeValue,
  onChange,
  variant = 'pills', // 'pills' | 'segmented'
  size = 'md', // 'sm' | 'md' | 'lg'
  className = '',
  style = {},
}) {
  return (
    <div
      role="tablist"
      className={`ui-filter-pills variant-${variant} size-${size} ${className}`}
      style={style}
    >
      {options.map((opt) => {
        const isOptActive = opt.value === activeValue;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isOptActive}
            className={`filter-pill-btn ${isOptActive ? 'active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.icon && <span className="pill-icon">{opt.icon}</span>}
            <span className="pill-label">{opt.label}</span>
            {opt.badge !== undefined && opt.badge !== null && (
              <span className={`pill-badge ${opt.badgeColor ? `badge-${opt.badgeColor}` : ''}`}>
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
