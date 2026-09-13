import React from 'react';
import { Inbox } from 'lucide-react';

/**
 * Standard EmptyState component for blank lists, empty search results, and missing data
 */
export default function EmptyState({
  icon = <Inbox size={38} strokeWidth={1.5} />,
  title = 'اطلاعاتی یافت نشد',
  description = null,
  action = null,
  className = '',
  style = {},
}) {
  return (
    <div className={`ui-empty-state ${className}`} style={style}>
      <div className="empty-state-icon">{icon}</div>
      <h4 className="empty-state-title">{title}</h4>
      {description && <p className="empty-state-desc">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
