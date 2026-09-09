import React from 'react';
import Card from './Card.jsx';

/**
 * Standard FilterPills / SegmentedTabs component
 *
 * Used for:
 * - Market / Portfolio tabs in MainPage (role="tablist")
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
  const pillsContent = options.map((opt) => {
    const isOptActive = opt.value === activeValue;
    return (
      <button
        key={opt.value}
        type="button"
        role="tab"
        aria-selected={isOptActive}
        title={opt.label}
        aria-label={opt.label}
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
  });

  if (variant === 'segmented') {
    return (
      <Card
        as="div"
        role="tablist"
        padding="none"
        className={`ui-filter-pills variant-segmented size-${size} ${className}`}
        style={style}
      >
        {pillsContent}
      </Card>
    );
  }

  return (
    <div
      role="tablist"
      className={`ui-filter-pills variant-${variant} size-${size} ${className}`}
      style={style}
    >
      {pillsContent}
    </div>
  );
}
