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
 * Displays real-time live reference price (Free USD, Tether USDT, etc.)
 * with interactive click to cycle through reference rates seamlessly.
 */
export default function LiveRatesTicker({
  usdPrice,
  onUsdClick,
  activeReferenceRate = null,
  referenceRates = [],
  onCycleReferenceRate = null,
  className = '',
}) {
  const isTether = activeReferenceRate?.key === 'usdt';
  const clickHandler = onCycleReferenceRate || onUsdClick;
  const canCycle = referenceRates && referenceRates.length > 1;

  // Title / Tooltip
  let titleText = 'نرخ زنده';
  if (canCycle) {
    const currentIdx = referenceRates.findIndex((r) => r.key === activeReferenceRate?.key);
    const nextIdx = (currentIdx + 1) % referenceRates.length;
    const nextRate = referenceRates[nextIdx];
    titleText = `کلیک برای تغییر مبنای محاسبات به «${nextRate?.label || 'نرخ بعدی'}»`;
  } else if (onUsdClick) {
    titleText = 'کلیک برای مشاهده جزئیات';
  }

  const labelDesktop = activeReferenceRate?.label || 'دلار آزاد';
  const labelMobile = activeReferenceRate?.shortLabel || 'دلار';
  const displayPrice = (usdPrice !== undefined && usdPrice !== null && usdPrice !== '')
    ? usdPrice
    : (activeReferenceRate?.price || 0);

  return (
    <div className={`main-live-ticker ${className}`} aria-label={`نرخ زنده ${labelDesktop}`}>
      <div
        className={`ticker-item ${isTether ? 'usdt' : 'usd'} ${clickHandler ? 'clickable' : ''}`}
        onClick={clickHandler}
        role={clickHandler ? 'button' : undefined}
        tabIndex={clickHandler ? 0 : undefined}
        onKeyDown={(e) => {
          if (clickHandler && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            clickHandler();
          }
        }}
        title={titleText}
      >
        <span className={`ticker-pulse ${isTether ? 'cyan' : 'green'}`} />
        <span className="ticker-tag desktop-text">{labelDesktop}:</span>
        <span className="ticker-tag mobile-text">{labelMobile}:</span>
        <strong className="ticker-amount">{formatRate(displayPrice)}</strong>
        <span className="ticker-unit desktop-text">تومان</span>

        {canCycle && (
          <span
            className="ticker-cycle-badge"
            title={titleText}
            aria-hidden="true"
          >
            ⇄
          </span>
        )}
      </div>
    </div>
  );
}
