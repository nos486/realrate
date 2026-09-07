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
      {/* Cards Grid */}
      <div className="cards-modern-grid">
        {analysis.map((item) => {
          const isBest = recommendation && recommendation.best_id === item.id;
          const hasMarket = item.market !== null && item.market !== undefined;

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
