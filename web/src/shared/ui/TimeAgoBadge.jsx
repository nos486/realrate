import React from 'react';

/**
 * Format timestamp into human-readable Persian relative time
 */
export function formatRelativeTime(isoStr) {
  if (!isoStr) return 'ثبت نشده';
  try {
    const d = new Date(isoStr);
    const diffMins = Math.floor((new Date() - d) / 60000);
    if (diffMins < 1) return 'لحظاتی پیش';
    if (diffMins < 60) return `${diffMins.toLocaleString('fa-IR')} دقیقه پیش`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours.toLocaleString('fa-IR')} ساعت پیش`;
    return d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'ثبت نشده';
  }
}

/**
 * TimeAgoBadge component with live/manual indicator & pulse dot
 */
export default function TimeAgoBadge({
  timestamp = null,
  isLive = false,
  liveLabel = 'زنده',
  manualLabel = 'دستی',
  showPulse = true,
  className = '',
  style = {},
}) {
  let freshness = 'neutral';
  if (timestamp) {
    try {
      const diffMins = Math.floor((new Date() - new Date(timestamp)) / 60000);
      if (diffMins < 15) freshness = 'fresh';
      else if (diffMins < 120) freshness = 'moderate';
      else freshness = 'stale';
    } catch {}
  }

  return (
    <span className={`ui-time-badge freshness-${freshness} ${isLive ? 'is-live' : 'is-manual'} ${className}`} style={style}>
      {showPulse && <span className="time-badge-pulse" />}
      <span className="time-badge-status-tag">
        {isLive ? liveLabel : manualLabel}
      </span>
      {timestamp && (
        <span className="time-badge-time">
          {formatRelativeTime(timestamp)}
        </span>
      )}
    </span>
  );
}
