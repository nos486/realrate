/**
 * RowCard.jsx — One record of a list as a full-width row: the app's one design for a record that
 * runs over time (a loan, a subscription), so they read alike (styles/row-card.css)
 *
 * Left to right: who it is (an icon, a title, a line under it, a badge), then columns of figures
 * (RowCardBlock: a label, a value, a line under it), one of which may be a progress bar
 * (RowCardProgress: the only column that grows), then the actions. On a narrow screen the
 * identity takes the first line and the columns wrap under it.
 *
 * Tones (`tone`, a block's `valueTone`, a bar's `tone`) are the semantic colors: 'warning',
 * 'positive', 'negative', 'primary', 'muted'.
 */

import React from 'react';
import { ChevronLeft } from 'lucide-react';

const toneClass = (tone) => (tone ? `tone-${tone}` : '');

/**
 * @param {{ as?: string, icon: React.ReactNode, iconTone?: string, tone?: string, title: React.ReactNode,
 *   subtitle?: React.ReactNode, badge?: React.ReactNode, actions?: React.ReactNode, onClick?: () => void,
 *   chevron?: boolean, hint?: string, className?: string, children?: React.ReactNode }} props
 *   tone: the whole row's (its edge and background: 'positive' a finished one, 'muted' an inactive
 *   one); iconTone: its icon box's; chevron: opens a page of its own; hint: the row's tooltip
 */
export default function RowCard({
  as: Tag = 'div', icon, iconTone = 'warning', tone = '', title, subtitle = null, badge = null,
  actions = null, onClick, chevron = false, hint = '', className = '', children, ...rest
}) {
  return (
    <Tag
      className={`row-card ${toneClass(tone)} ${onClick ? 'is-clickable' : ''} ${className}`.trim()}
      onClick={onClick}
      title={hint || undefined}
      {...rest}
    >
      <div className="row-card-identity">
        <div className={`row-card-icon ${toneClass(iconTone)}`}>{icon}</div>
        <div className="row-card-titles">
          <h3 className="row-card-title">{title}</h3>
          {subtitle && <span className="row-card-subtitle">{subtitle}</span>}
        </div>
        {badge}
      </div>
      {children}
      {actions && (
        // A tap on an action is not a tap on the row
        <div className="row-card-actions" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
      {chevron && <ChevronLeft size={16} className="row-card-chevron" />}
    </Tag>
  );
}

/** A pill next to the title (a rate, a state) */
export function RowCardBadge({ tone = '', children, ...rest }) {
  return <span className={`row-card-badge ${toneClass(tone)}`} {...rest}>{children}</span>;
}

/**
 * A column of figures
 * @param {{ label?: React.ReactNode, value?: React.ReactNode, valueTone?: string, sub?: React.ReactNode,
 *   className?: string, children?: React.ReactNode }} props — children: in place of the three lines
 */
export function RowCardBlock({ label = null, value = null, valueTone = '', sub = null, className = '', children }) {
  return (
    <div className={`row-card-block ${className}`.trim()}>
      {children || (
        <>
          {label && <span className="row-card-label">{label}</span>}
          {value !== null && <strong className={`row-card-value ${toneClass(valueTone)}`}>{value}</strong>}
          {sub && <span className="row-card-sub">{sub}</span>}
        </>
      )}
    </div>
  );
}

/**
 * The growing column: a label and a figure over a bar
 * @param {{ label: React.ReactNode, figure?: React.ReactNode, pct: number, tone?: string, sub?: React.ReactNode,
 *   ariaLabel?: string }} props — pct: how full the bar is (0–100)
 */
export function RowCardProgress({ label, figure = null, pct, tone = 'warning', sub = null, ariaLabel }) {
  const width = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <div className="row-card-block row-card-progress">
      <div className="row-card-progress-top">
        <span className="row-card-label">{label}</span>
        {figure !== null && <span className="row-card-progress-figure">{figure}</span>}
      </div>
      <div
        className="row-card-track"
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(width)}
      >
        <div className={`row-card-bar ${toneClass(tone)}`} style={{ width: `${width}%` }} />
      </div>
      {sub && <span className="row-card-sub">{sub}</span>}
    </div>
  );
}

/** An icon button among the actions */
export function RowCardAction({ danger = false, className = '', children, ...rest }) {
  return (
    <button type="button" className={`row-card-action ${danger ? 'is-danger' : ''} ${className}`.trim()} {...rest}>
      {children}
    </button>
  );
}
