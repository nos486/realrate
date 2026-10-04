/**
 * IconButton — A round, icon-only toolbar button (the same size and shape as the CSV button),
 * for actions whose icon says enough: the label is its tooltip and screen-reader name. An
 * optional `badge` shows a small count on it; `active` marks a toggle that is on.
 */

import React from 'react';

/**
 * @param {{ icon: React.ReactNode, label: string, onClick?: () => void, active?: boolean,
 *   badge?: number|string|null, disabled?: boolean, className?: string, title?: string,
 *   pressed?: boolean }} props
 */
export default function IconButton({ icon, label, onClick, active = false, badge = null, disabled = false, className = '', title, pressed }) {
  return (
    <button
      type="button"
      className={`ui-icon-btn${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      aria-label={label}
      aria-pressed={pressed}
    >
      {icon}
      {badge !== null && badge !== undefined && badge !== 0 && <span className="ui-icon-btn-badge">{badge}</span>}
    </button>
  );
}
