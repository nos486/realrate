/**
 * ChequeStatusBadge.jsx — Status pill with icon (color is never the only cue)
 */

import React from 'react';
import { getStatusDisplay } from '../constants/chequeDisplay.js';

export default function ChequeStatusBadge({ status }) {
  const { label, Icon, tone } = getStatusDisplay(status);
  return (
    <span className={`cheque-status-badge tone-${tone}`}>
      <Icon size={12} strokeWidth={2.2} />
      {label}
    </span>
  );
}
