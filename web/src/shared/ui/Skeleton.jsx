import React from 'react';

/**
 * Skeleton — shimmering placeholder shown while a view's data loads.
 *
 *   <Skeleton width="40%" />                 one text line
 *   <Skeleton height={48} radius={12} />      a block
 *   <SkeletonRows rows={5} columns={4} />     table / list rows
 *   <SkeletonCards count={4} />               stat / price cards
 *
 * Purely decorative: the wrapper announces "loading" once for screen readers and the
 * placeholders themselves are hidden from assistive tech.
 */
export default function Skeleton({ width = '100%', height = 12, radius = 6, className = '', style = {} }) {
  return (
    <span
      className={`ui-skeleton ${className}`}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  );
}

export function SkeletonGroup({ label = 'در حال بارگذاری…', className = '', children }) {
  return (
    <div className={`ui-skeleton-group ${className}`} role="status" aria-busy="true" aria-label={label}>
      {children}
    </div>
  );
}

const ROW_WIDTHS = ['92%', '70%', '84%', '60%', '76%'];

export function SkeletonRows({ rows = 5, columns = 4, label, className = '' }) {
  return (
    <SkeletonGroup label={label} className={`ui-skeleton-rows ${className}`}>
      {Array.from({ length: rows }, (_, r) => (
        <div className="ui-skeleton-row" key={r} style={{ '--skeleton-cols': Math.max(1, columns - 1) }}>
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} width={c === 0 ? ROW_WIDTHS[r % ROW_WIDTHS.length] : `${55 + ((r + c) * 11) % 40}%`} />
          ))}
        </div>
      ))}
    </SkeletonGroup>
  );
}

export function SkeletonCards({ count = 4, label, className = '' }) {
  return (
    <SkeletonGroup label={label} className={`ui-skeleton-cards ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <div className="ui-skeleton-card" key={i}>
          <div className="ui-skeleton-card-head">
            <Skeleton width="45%" height={14} />
            <Skeleton width={64} height={18} radius={9} />
          </div>
          <Skeleton width="60%" height={22} />
          <Skeleton width="85%" />
          <Skeleton width="70%" />
        </div>
      ))}
    </SkeletonGroup>
  );
}
