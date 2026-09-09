import React from 'react';
import MiniSparkline from './ui/MiniSparkline.jsx';

function formatNum(num) {
  if (num === null || num === undefined || isNaN(num)) return '-';
  return Math.round(num).toLocaleString('fa-IR');
}

export default function AnalysisCards({ analysis, recommendation, sparklines = {} }) {
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
            const formattedBubble = Math.abs(item.bubble_pct).toLocaleString('fa-IR', {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            });
            if (item.bubble_pct < 0) {
              badgeClass = 'badge-good';
              badgeText = `حباب منفی: ${formattedBubble}٪`;
            } else if (item.bubble_pct <= 5) {
              badgeClass = 'badge-blue';
              badgeText = `حباب: +${formattedBubble}٪`;
            } else if (item.bubble_pct <= 15) {
              badgeClass = 'badge-orange';
              badgeText = `حباب: +${formattedBubble}٪`;
            } else {
              badgeClass = 'badge-danger';
              badgeText = `حباب: +${formattedBubble}٪`;
            }
          }

          return (
            <div key={item.id} className={`fintech-card ${isBest ? 'best-choice' : ''}`}>
              <div className="card-top-row">
                <div className="card-identity">
                  <h3 className="card-name">{item.name}</h3>
                </div>
                <span className={`bubble-pill ${badgeClass}`}>{badgeText}</span>
              </div>

              {/* Main Market Price */}
              <div className="main-price-block">
                <div className="price-big-row">
                  {hasMarket ? (
                    <>
                      <span className="price-big-number">{formatNum(item.market)}</span>
                      <span className="price-big-unit">تومان</span>
                    </>
                  ) : (
                    <span className="price-unavailable">ناموجود</span>
                  )}
                </div>

                {/* 24h Price History Mini Sparkline */}
                {hasMarket && (
                  <MiniSparkline
                    data={sparklines?.[item.id]}
                    currentPrice={item.market}
                    height={38}
                  />
                )}
              </div>

              {/* Data Breakdown Table */}
              <div className="card-metrics-table">
                <div className="metric-row">
                  <span className="metric-key">ارزش طلای خام:</span>
                  <strong className="metric-val gold-val">{formatNum(item.intrinsic)} تومان</strong>
                </div>

                {item.target_bubble_pct > 0 && (
                  <div className="metric-row">
                    <span className="metric-key">قیمت استاندارد:</span>
                    <strong className="metric-val blue-val">{formatNum(item.expected_price)} تومان</strong>
                  </div>
                )}

                {hasMarket && item.target_bubble_pct > 0 && item.diff_from_expected !== null && (
                  <div className="metric-row">
                    <span className="metric-key">انحراف از استاندارد:</span>
                    <strong className={`metric-val ${item.diff_from_expected < 0 ? 'good-val' : 'warn-val'}`}>
                      {item.diff_from_expected < 0 ? '-' : '+'}
                      {formatNum(Math.abs(item.diff_from_expected))} تومان ({Math.abs(item.diff_from_expected_pct).toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}٪)
                    </strong>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
