import React, { useEffect, useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { usePricing } from '../context/PricingContext.jsx';
import { AlertBanner } from '../../../shared/ui/index.js';

/**
 * Relative Persian time for a timestamp (ms)
 * @param {number|null} timestamp
 * @param {number} now
 * @returns {string}
 */
function formatUpdatedAgo(timestamp, now = Date.now()) {
  if (!timestamp) return '';
  const diffMins = Math.floor((now - timestamp) / 60000);
  if (diffMins < 1) return 'لحظاتی پیش';
  if (diffMins < 60) return `${diffMins.toLocaleString('fa-IR')} دقیقه پیش`;
  const diffHours = Math.floor(diffMins / 60);
  return `${diffHours.toLocaleString('fa-IR')} ساعت پیش`;
}

/**
 * PriceRefreshStatus — A warning banner when the prices can't be refreshed (offline, or the latest
 * refresh failed: the last good prices stay on screen, with a retry button). Nothing otherwise:
 * refreshing is the header's button (shared/refresh/PageRefreshButton).
 */
export default function PriceRefreshStatus() {
  const pricing = usePricing();
  const [now, setNow] = useState(() => Date.now());

  // Re-render every 30s so "N minutes ago" keeps counting
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  if (!pricing) return null;
  const { lastUpdatedAt, error, isOffline, refreshing, refresh } = pricing;
  const updatedAgo = formatUpdatedAgo(lastUpdatedAt, now);

  const refreshButton = (
    <button
      type="button"
      className="price-refresh-btn"
      onClick={refresh}
      disabled={refreshing}
      aria-label="به‌روزرسانی قیمت‌ها"
      title="به‌روزرسانی قیمت‌ها"
    >
      <RefreshCw size={13} className={refreshing ? 'is-spinning' : ''} />
      {error && <span>تلاش مجدد</span>}
    </button>
  );

  if (isOffline) {
    return (
      <AlertBanner
        type="warning"
        icon={<WifiOff size={16} />}
        className="price-refresh-alert"
        message={
          lastUpdatedAt
            ? `اتصال اینترنت برقرار نیست — قیمت‌های ذخیره‌شده (${updatedAgo}) نمایش داده می‌شود.`
            : 'اتصال اینترنت برقرار نیست — آخرین قیمت‌های ذخیره‌شده نمایش داده می‌شود.'
        }
      />
    );
  }

  if (error) {
    return (
      <AlertBanner
        type="warning"
        icon={<WifiOff size={16} />}
        className="price-refresh-alert"
        message={
          lastUpdatedAt
            ? `آخرین به‌روزرسانی قیمت‌ها ناموفق بود — قیمت‌های ${updatedAgo} نمایش داده می‌شود.`
            : 'دریافت قیمت‌ها از سرور ناموفق بود.'
        }
        action={refreshButton}
      />
    );
  }

  return null;
}
