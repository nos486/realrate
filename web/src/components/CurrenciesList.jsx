import React, { useState } from 'react';

function formatNum(num) {
  if (num === null || num === undefined || isNaN(num)) return '-';
  return Math.round(num).toLocaleString('fa-IR');
}

export default function CurrenciesList({ currencies }) {
  const [search, setSearch] = useState('');

  if (!currencies || currencies.length === 0) {
    return (
      <div className="empty-loading-block">
        <div className="loading-spinner"></div>
        <span>در حال دریافت نرخ برابری ارزهای جهانی...</span>
      </div>
    );
  }

  const filtered = currencies.filter((c) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.code?.toLowerCase().includes(q) ||
      c.note?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="currencies-container">
      {/* Search and count bar */}
      <div className="currencies-toolbar">
        <div className="search-box">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="جستجوی نام یا نماد ارز..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="clear-search-btn" onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        <div className="currencies-count-badge">
          <span>{filtered.length.toLocaleString('fa-IR')} ارز</span>
        </div>
      </div>

      {/* Modern Currencies Grid / Table */}
      <div className="currency-cards-grid">
        {filtered.map((c) => (
          <div key={c.code} className="currency-item-card">
            <div className="curr-lead">
              <span className="curr-flag-emoji">{c.flag}</span>
              <div className="curr-names">
                <div className="curr-title-row">
                  <span className="curr-persian-name">{c.name}</span>
                  <span className="curr-code-pill">{c.code}</span>
                </div>
                <span className="curr-desc">{c.note}</span>
              </div>
            </div>

            <div className="curr-price-block">
              <div className="curr-price-val">
                {formatNum(c.toman_price)}
                <span className="curr-unit">تومان</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
