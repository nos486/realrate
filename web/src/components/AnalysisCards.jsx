import React from 'react';

function formatNum(num) {
  if (num === null || num === undefined || isNaN(num)) return '-';
  return Math.round(num).toLocaleString('fa-IR');
}

function formatRelativeTime(isoStr) {
  if (!isoStr) return 'ثبت نشده';
  try {
    const d = new Date(isoStr);
    const diffMins = Math.floor((new Date() - d) / 60000);
    if (diffMins < 1) return 'چند لحظه پیش';
    if (diffMins < 60) return `${diffMins.toLocaleString('fa-IR')} دقیقه پیش`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours.toLocaleString('fa-IR')} ساعت پیش`;
    return d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'ثبت نشده';
  }
}

export default function AnalysisCards({ analysis, recommendation }) {
  if (!analysis || analysis.length === 0) return null;

  return (
    <div className="analysis-wrapper">
      {/* Smart Recommendation Banner */}
      {recommendation && (
        <div className="smart-rec-banner">
          <div className="rec-badge-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
          </div>
          <div className="rec-text-group">
            <div className="rec-title">
              بهترین فرصت خرید: <strong>{recommendation.best_name}</strong>
            </div>
            <div className="rec-desc">{recommendation.reason}</div>
          </div>
          <div className={`rec-chip ${recommendation.best_bubble_pct < 0 ? 'negative' : 'positive'}`}>
            <span>{recommendation.best_bubble_pct < 0 ? 'حباب منفی: ' : 'حباب: '}</span>
            <strong>{recommendation.best_bubble_pct?.toLocaleString('fa-IR')}٪</strong>
          </div>
        </div>
      )}

      {/* Cards Grid */}
      <div className="cards-modern-grid">
        {analysis.map((item) => {
          const isBest = recommendation && recommendation.best_id === item.id;
          const hasMarket = item.market !== null && item.market !== undefined;
          const isNeg = hasMarket && item.bubble < 0;

          let badgeClass = 'disabled';
          let badgeText = 'ناموجود در بازار';

          if (hasMarket) {
            if (item.bubble_pct < 0) {
              badgeClass = 'badge-good';
              badgeText = `حباب منفی: ${item.bubble_pct?.toLocaleString('fa-IR')}٪`;
            } else if (item.bubble_pct <= 5) {
              badgeClass = 'badge-blue';
              badgeText = `حباب: +${item.bubble_pct?.toLocaleString('fa-IR')}٪`;
            } else if (item.bubble_pct <= 15) {
              badgeClass = 'badge-orange';
              badgeText = `حباب: +${item.bubble_pct?.toLocaleString('fa-IR')}٪`;
            } else {
              badgeClass = 'badge-danger';
              badgeText = `حباب: +${item.bubble_pct?.toLocaleString('fa-IR')}٪`;
            }
          }

          // Visual bubble meter percent (clamped between 0 and 100 for visual bar)
          const meterWidth = hasMarket ? Math.min(Math.max((item.bubble_pct || 0) * 3, 4), 100) : 0;

          return (
            <div key={item.id} className={`fintech-card ${isBest ? 'best-choice' : ''}`}>
              <div className="card-top-row">
                <div className="card-identity">
                  <h3 className="card-name">{item.name}</h3>
                  {item.target_bubble_pct > 0 && (
                    <span className="target-badge">حباب مصوب: {item.target_bubble_pct?.toLocaleString('fa-IR')}٪</span>
                  )}
                </div>
                <span className={`bubble-pill ${badgeClass}`}>{badgeText}</span>
              </div>

              {/* Main Market Price */}
              <div className="main-price-block">
                <span className="price-title">قیمت روز بازار</span>
                <div className="price-big-row">
                  {hasMarket ? (
                    <>
                      <span className="price-big-number">{formatNum(item.market)}</span>
                      <span className="price-big-unit">تومان</span>
                    </>
                  ) : (
                    <span className="price-unavailable">ناموجود در بازار</span>
                  )}
                </div>
              </div>

              {/* Bubble Meter Bar */}
              {hasMarket && (
                <div className="bubble-meter-container">
                  <div className="meter-label-row">
                    <span>حباب طلا</span>
                    <span className={`meter-val ${isNeg ? 'neg' : ''}`}>
                      {isNeg ? 'حباب منفی ' : '+'}
                      {formatNum(Math.abs(item.bubble))} تومان
                    </span>
                  </div>
                  <div className="meter-track">
                    <div
                      className={`meter-bar ${badgeClass}`}
                      style={{ width: `${meterWidth}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {/* Data Breakdown Table */}
              <div className="card-metrics-table">
                <div className="metric-row">
                  <span className="metric-key">ارزش ذاتی (طلای خام):</span>
                  <strong className="metric-val gold-val">{formatNum(item.intrinsic)} تومان</strong>
                </div>

                {item.target_bubble_pct > 0 && (
                  <div className="metric-row">
                    <span className="metric-key">قیمت محاسباتی استاندارد:</span>
                    <strong className="metric-val blue-val">{formatNum(item.expected_price)} تومان</strong>
                  </div>
                )}

                {hasMarket && item.target_bubble_pct > 0 && item.diff_from_expected !== null && (
                  <div className="metric-row">
                    <span className="metric-key">انحراف از قیمت محاسباتی:</span>
                    <strong className={`metric-val ${item.diff_from_expected < 0 ? 'good-val' : 'warn-val'}`}>
                      {item.diff_from_expected < 0 ? 'اختلاف منفی ' : '+'}
                      {formatNum(Math.abs(item.diff_from_expected))} تومان ({item.diff_from_expected_pct?.toLocaleString('fa-IR')}٪)
                    </strong>
                  </div>
                )}
              </div>

              {/* Footer Timestamp */}
              <div className="card-timestamp-footer">
                <span>قیمت لحظه‌ای بازار</span>
                <span>بروزرسانی: {formatRelativeTime(item.updated_at)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
