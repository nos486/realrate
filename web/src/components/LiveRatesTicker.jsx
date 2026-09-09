import React from 'react';

function formatRate(num) {
  if (num === null || num === undefined || isNaN(num) || num === 0) return '...';
  const clean = typeof num === 'string' ? parseFloat(num.replace(/,/g, '')) : num;
  if (isNaN(clean) || clean === 0) return '...';
  return Math.round(clean).toLocaleString('fa-IR');
}

/**
 * LiveRatesTicker:
 * Displays real-time live prices for Gold 18k and Free USD.
 * Desktop: Full informative labels with Toman unit.
 * Mobile: Ultra-concise ("طلا" and "دلار" with amount, compact micro-pulses).
 */
export default function LiveRatesTicker({ goldPrice, usdPrice, className = '' }) {
  return (
    <div className={`main-live-ticker ${className}`} aria-label="نرخ‌های زنده طلا و دلار">
      {/* Gold 18k */}
      <div className="ticker-item gold" title="نرخ روز هر گرم طلای ۱۸ عیار">
        <span className="ticker-pulse gold" />
        <span className="ticker-tag desktop-text">طلای ۱۸:</span>
        <span className="ticker-tag mobile-text">طلا:</span>
        <strong className="ticker-amount">{formatRate(goldPrice)}</strong>
        <span className="ticker-unit desktop-text">تومان</span>
      </div>

      <div className="ticker-separator" />

      {/* Free USD */}
      <div className="ticker-item usd" title="نرخ روز دلار نقدی آزاد">
        <span className="ticker-pulse green" />
        <span className="ticker-tag desktop-text">دلار آزاد:</span>
        <span className="ticker-tag mobile-text">دلار:</span>
        <strong className="ticker-amount">{formatRate(usdPrice)}</strong>
        <span className="ticker-unit desktop-text">تومان</span>
      </div>
    </div>
  );
}
