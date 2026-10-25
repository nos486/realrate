import React, { useId } from 'react';

/**
 * Standard Unified Card / Surface Component
 *
 * Single source of truth for:
 * - admin-container
 * - admin-profile-bar
 * - all general .ui-card containers
 *
 * As a <section> with a title, the title names the section (a landmark screen readers list).
 */
export default function Card({
  children,
  className = '',
  variant = 'default', // 'default' | 'elevated' | 'glass' | 'subtle'
  padding = 'md', // 'none' | 'sm' | 'md' | 'lg' | 'hero'
  title = null,
  subtitle = null,
  icon = null,
  actions = null,
  footer = null,
  onClick = null,
  style = {},
  as: Component = 'div',
  ...rest
}) {
  const isClickable = typeof onClick === 'function';
  const titleId = useId();
  const labelled = Boolean(title) && Component === 'section' && !rest['aria-label'] && !rest['aria-labelledby'];
  const paddingClass = padding ? `p-${padding}` : '';

  return (
    <Component
      className={`ui-card variant-${variant} ${paddingClass} ${isClickable ? 'is-clickable' : ''} ${className}`.replace(/\s+/g, ' ').trim()}
      onClick={onClick}
      style={style}
      aria-labelledby={labelled ? titleId : undefined}
      {...rest}
    >
      {(title || icon || actions) && (
        <div className="ui-card-header">
          <div className="ui-card-header-lead">
            {icon && <span className="ui-card-icon">{icon}</span>}
            <div>
              {title && <h3 id={labelled ? titleId : undefined} className="ui-card-title">{title}</h3>}
              {subtitle && <p className="ui-card-subtitle">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="ui-card-actions">{actions}</div>}
        </div>
      )}

      {children}

      {footer && <div className="ui-card-footer">{footer}</div>}
    </Component>
  );
}
