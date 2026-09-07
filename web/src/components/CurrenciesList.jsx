import React from 'react';

function formatNum(num) {
  if (num === null || num === undefined || isNaN(num)) return '-';
  return Math.round(num).toLocaleString('fa-IR');
}

export default function CurrenciesList({ currencies }) {
  if (!currencies || currencies.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
        در حال دریافت نرخ ارزها...
      </div>
    );
  }

  return (
    <div className="currency-list">
      {currencies.map((c) => (
        <div key={c.code} className="currency-row">
          <div className="curr-info">
            <span className="curr-flag">{c.flag}</span>
            <div>
              <div className="curr-name">
                {c.name} ({c.code})
              </div>
              <div className="curr-note">{c.note}</div>
            </div>
          </div>
          <div className="curr-price">{formatNum(c.toman_price)} تومان</div>
        </div>
      ))}
    </div>
  );
}
