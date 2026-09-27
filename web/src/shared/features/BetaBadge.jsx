import React from 'react';

/**
 * BetaBadge — Polished badge indicator for beta features.
 *
 * @param {object} props
 * @param {string} [props.className]
 */
export function BetaBadge({ className = '' }) {
  return (
    <span className={`beta-badge ${className}`.trim()} aria-label="ویژگی آزمایشی (بتا)">
      بتا
    </span>
  );
}
