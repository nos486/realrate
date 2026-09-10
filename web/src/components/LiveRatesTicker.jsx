import React from 'react';
import { toEnglishDigits } from '../utils/formatters.js';

function formatRate(num) {
  if (num === null || num === undefined || num === '') return '...';
  const str = toEnglishDigits(String(num)).replace(/[,،٬\s]/g, '').trim();
  const clean = parseFloat(str);
  if (isNaN(clean) || clean === 0) return '...';
  return Math.round(clean).toLocaleString('fa-IR');
}

/**
 * LiveRatesTicker:
 * Displays real-time live price for Free USD with interactive click to view chart & details.
 */
export default function LiveRatesTicker({ usdPrice, onUsdClick, className = '' }) {
  return (
    <div className={`main-live-ticker ${className}`} aria-label="نرخ زنده دلار آزاد">
      {/* Free USD */}
      <div
        className={`ticker-item usd ${onUsdClick ? 'clickable' : ''}`}
        onClick={onUsdClick}
        role={onUsdClick ? 'button' : undefined}
        tabIndex={onUsdClick ? 0 : undefined}
        onKeyDown={(e) => {
          if (onUsdClick && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onUsdClick();
          }
        }}
        title="کلیک برای مشاهده جزئیات و نمودار ۲۴ ساعته دلار"
      >
        <span className="ticker-pulse green" />
        <span className="ticker-tag desktop-text">دلار آزاد:</span>
        <span className="ticker-tag mobile-text">دلار:</span>
        <strong className="ticker-amount">{formatRate(usdPrice)}</strong>
        <span className="ticker-unit desktop-text">تومان</span>
      </div>
    </div>
  );
}
