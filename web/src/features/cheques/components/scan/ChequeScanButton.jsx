import React from 'react';
import { Camera } from 'lucide-react';
import { Button } from '../../../../shared/ui/index.js';
import { Feature } from '../../../../shared/features/index.js';

/**
 * ChequeScanButton — Trigger button for AI Cheque Scan modal.
 * Wrapped in <Feature name="cheque_scan"> so it renders strictly for authorized users.
 */
export function ChequeScanButton({ onClick, disabled = false, className = '' }) {
  return (
    <Feature name="cheque_scan">
      <Button
        variant="secondary"
        icon={<Camera size={16} />}
        onClick={onClick}
        disabled={disabled}
        className={`cheque-scan-trigger-btn ${className}`.trim()}
        title="اسکن چک با هوش مصنوعی"
      >
        اسکن چک
      </Button>
    </Feature>
  );
}

export default ChequeScanButton;
