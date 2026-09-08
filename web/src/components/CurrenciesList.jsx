import React, { useState } from 'react';
import { Search, X } from 'lucide-react';

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
          <Search size={15} strokeWidth={2} />
          <input
            type="text"
            placeholder="جستجوی نام یا نماد ارز..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="clear-search-btn" onClick={() => setSearch('')}>
              <X size={14} strokeWidth={2.2} />
            </button>
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
