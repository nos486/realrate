import React from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

/**
 * Standard AlertBanner component
 *
 * Types:
 * - 'success': green emerald
 * - 'error': rose red
 * - 'warning': amber gold
 * - 'info': blue sky
 */
export default function AlertBanner({
  type = 'info',
  message,
  title,
  icon = null,
  onClose = null,
  action = null,
  className = '',
  style = {},
  children,
}) {
  const content = message || children;
  if (!content && !title) return null;

  const defaultIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle2 size={17} strokeWidth={2.2} className="alert-banner-icon" />;
      case 'error':
        return <AlertCircle size={17} strokeWidth={2.2} className="alert-banner-icon" />;
      case 'warning':
        return <AlertTriangle size={17} strokeWidth={2.2} className="alert-banner-icon" />;
      case 'info':
      default:
        return <Info size={17} strokeWidth={2.2} className="alert-banner-icon" />;
    }
  };

  return (
    <div
      role="alert"
      className={`ui-alert-banner ${type} ${className}`}
      style={style}
    >
      <div className="alert-banner-lead">
        <span className="alert-banner-icon-wrap">
          {icon || defaultIcon()}
        </span>
        <div className="alert-banner-body">
          {title && <strong className="alert-banner-title">{title}</strong>}
          <div className="alert-banner-message">{content}</div>
        </div>
      </div>

      <div className="alert-banner-actions-wrap">
        {action && <div className="alert-banner-action-slot">{action}</div>}
        {onClose && (
          <button
            type="button"
            className="alert-banner-close-btn"
            onClick={onClose}
            aria-label="بستن پیام"
          >
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
