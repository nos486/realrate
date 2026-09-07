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
    if (diffMins < 60) return diffMins.toLocaleString('fa-IR') + ' دقیقه پیش';
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return diffHours.toLocaleString('fa-IR') + ' ساعت پیش';
    return d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'ثبت نشده';
  }
}

export default function AnalysisCards({ analysis, recommendation }) {
  if (!analysis || analysis.length === 0) return null;

  return (
    <div>
      {/* Recommendation Box */}
      {recommendation && (
        <div className="rec-box">
          <div className="rec-info">
            <h3>🏆 بهترین گزینه برای خرید: {recommendation.best_name}</h3>
            <p>{recommendation.reason}</p>
          </div>
          <div className="rec-badge">
            {recommendation.best_bubble_pct < 0 ? 'حباب منفی: ' : 'حباب: '}
            {recommendation.best_bubble_pct?.toLocaleString('fa-IR')}٪
          </div>
        </div>
      )}

      {/* Cards Grid */}
      <div className="cards-grid">
        {analysis.map((item) => {
          const isBest = recommendation && recommendation.best_id === item.id;
          const hasMarket = item.market !== null && item.market !== undefined;
          const isNegative = hasMarket && item.bubble < 0;

          let bubbleClass = 'disabled';
          let badgeText = 'ناموجود در بازار';

          if (hasMarket) {
            if (item.bubble_pct < 0) {
              bubbleClass = 'good';
              badgeText = `حباب منفی: ${item.bubble_pct?.toLocaleString('fa-IR')}٪`;
            } else if (item.bubble_pct <= 5) {
              bubbleClass = 'blue';
              badgeText = `حباب: +${item.bubble_pct?.toLocaleString('fa-IR')}٪`;
            } else if (item.bubble_pct <= 15) {
              bubbleClass = 'orange';
              badgeText = `حباب: +${item.bubble_pct?.toLocaleString('fa-IR')}٪`;
            } else {
              bubbleClass = 'danger';
              badgeText = `حباب: +${item.bubble_pct?.toLocaleString('fa-IR')}٪`;
            }
          }

          let bubbleColor = '#f87171';
          if (hasMarket) {
            if (item.bubble_pct < 0) bubbleColor = 'var(--success)';
            else if (item.bubble_pct <= 5) bubbleColor = '#60a5fa';
            else if (item.bubble_pct <= 15) bubbleColor = 'var(--warning)';
          }

          let expDiffColor = '#f87171';
          if (item.diff_from_expected_pct < 0) expDiffColor = 'var(--success)';
          else if (item.diff_from_expected_pct <= 5) expDiffColor = '#60a5fa';
          else if (item.diff_from_expected_pct <= 15) expDiffColor = 'var(--warning)';

          return (
            <div key={item.id} className={`card ${isBest ? 'highlight' : ''}`}>
              <div>
                <div className="card-header">
                  <div className="card-title">
                    <h3>{item.name}</h3>
                    <span>ارزش واقعی vs قیمت روز بازار</span>
                  </div>
                  <span className={`bubble-badge ${bubbleClass}`}>{badgeText}</span>
                </div>

                <div className="price-row">
                  <span className="price-label">ارزش واقعی (طلا و انس):</span>
                  <span className="price-val gold">{formatNum(item.intrinsic)} تومان</span>
                </div>

                {item.target_bubble_pct > 0 && (
                  <div className="price-row">
                    <span className="price-label">
                      قیمت محاسباتی (با حباب {item.target_bubble_pct?.toLocaleString('fa-IR')}٪):
                    </span>
                    <span className="price-val expected">{formatNum(item.expected_price)} تومان</span>
                  </div>
                )}

                <div className="price-row">
                  <span className="price-label">قیمت روز بازار:</span>
                  {hasMarket ? (
                    <span className="price-val">{formatNum(item.market)} تومان</span>
                  ) : (
                    <span className="price-val" style={{ color: 'var(--text-muted)', fontSize: '15px' }}>
                      ناموجود در بازار
                    </span>
                  )}
                </div>

                <div
                  className="price-row"
                  style={{
                    marginTop: '10px',
                    borderTop: '1px dashed var(--border-color)',
                    paddingTop: '8px',
                  }}
                >
                  <span className="price-label">حباب نسبت به ارزش خام طلا:</span>
                  {hasMarket ? (
                    <span style={{ fontWeight: 800, fontSize: '14px', color: bubbleColor }}>
                      {isNegative
                        ? `حباب منفی ${formatNum(Math.abs(item.bubble))} تومان (${item.bubble_pct?.toLocaleString('fa-IR')}٪)`
                        : `+${formatNum(item.bubble)} تومان (${item.bubble_pct?.toLocaleString('fa-IR')}٪)`}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                      اطلاعات بازار موجود نیست
                    </span>
                  )}
                </div>

                {hasMarket && item.target_bubble_pct > 0 && item.diff_from_expected !== null && (
                  <div className="price-row" style={{ marginTop: '6px' }}>
                    <span className="price-label">انحراف بازار از قیمت محاسباتی:</span>
                    <span style={{ fontWeight: 800, fontSize: '13px', color: expDiffColor }}>
                      {item.diff_from_expected < 0
                        ? `اختلاف منفی ${formatNum(Math.abs(item.diff_from_expected))} تومان (${item.diff_from_expected_pct?.toLocaleString('fa-IR')}٪)`
                        : `+${formatNum(item.diff_from_expected)} تومان (${item.diff_from_expected_pct?.toLocaleString('fa-IR')}٪)`}
                    </span>
                  </div>
                )}
              </div>

              <div className="timestamp-tag">
                <span>منبع: قیمت روز بازار</span>
                <span>
                  زمان بروزرسانی: <strong>{formatRelativeTime(item.updated_at)}</strong>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
