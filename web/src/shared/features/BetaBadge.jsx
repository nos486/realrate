import React from 'react';
import { t } from '../../utils/i18n.js';

/**
 * BetaBadge — Polished badge indicator for beta features.
 *
 * @param {object} props
 * @param {string} [props.className]
 */
export function BetaBadge({ className = '' }) {
  return (
    <span className={`beta-badge ${className}`.trim()} aria-label={t('ویژگی آزمایشی (بتا)')}>
      {t('بتا')}
    </span>
  );
}
