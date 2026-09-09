import React from 'react';

/**
 * Standard MiniCard component
 * Unifies stat cards, price source overview cards, and metric summary cards.
 */
export default function MiniCard({
  title,
  value,
  unit = null,
  subtitle = null,
  icon = null,
  badge = null,
  badgeColor = 'blue',
  status = null,
  statusLabel = null,
  color = 'default',
  footer = null,
  selected = false,
  onClick = null,
  className = '',
  style = {},
  children = null,
}) {
  const isClickable = typeof onClick === 'function';

  return (
    <div
      className={`ui-mini-card ${selected ? 'is-selected' : ''} ${isClickable ? 'is-clickable' : ''} ${className}`}
      onClick={onClick}
      style={style}
    >
      {/* Top Header: Badge, Status, or Icon */}
      {(badge || status || icon || title) && (
        <div className="mini-card-head">
          <div className="mini-card-head-lead">
            {icon && <span className="mini-card-icon">{icon}</span>}
            {title && <span className="mini-card-title">{title}</span>}
          </div>

          <div className="mini-card-head-tags">
            {badge && (
              <span className={`mini-card-badge badge-${badgeColor}`}>
                {badge}
              </span>
            )}
            {status && (
              <span className={`mini-card-status-dot ${status}`}>
                {statusLabel || (status === 'active' ? 'فعال' : 'غیرفعال')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main Body */}
      <div className="mini-card-content">
        {subtitle && <div className="mini-card-subtitle">{subtitle}</div>}

        {value !== undefined && value !== null && (
          <div className="mini-card-value-wrap">
            <span className={`mini-card-value val-${color}`}>
              {value}
            </span>
            {unit && <span className="mini-card-unit">{unit}</span>}
          </div>
        )}

        {children}
      </div>

      {/* Footer / Meta Row */}
      {footer && (
        <div className="mini-card-foot">
          {footer}
        </div>
      )}
    </div>
  );
}
