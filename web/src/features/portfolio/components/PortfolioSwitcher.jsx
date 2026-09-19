import React from 'react';
import { Star, Lock, Folder, Share2, Plus } from 'lucide-react';

export default function PortfolioSwitcher({
  portfolios = [],
  activePortfolioId = null,
  onSelect,
  onNewPortfolio,
  holdingsCount = 0,
  activeCount = null,
  mode = 'portfolio', // 'portfolio' | 'transactions'
}) {
  return (
    <div className="portfolio-nav-bar">
      <div className="portfolio-tabs-scroll">
        <span className="portfolio-nav-label">پورتفوها:</span>
        {portfolios.map((p) => {
          const isActive = p.id === activePortfolioId;
          let count = 0;
          if (mode === 'transactions') {
            count = isActive
              ? (activeCount !== null ? activeCount : (p.transactionCount ?? 0))
              : (p.transactionCount ?? 0);
          } else {
            count = isActive
              ? (activeCount !== null ? activeCount : holdingsCount)
              : (p.itemCount ?? 0);
          }
          return (
            <button
              key={p.id}
              type="button"
              className={`portfolio-tab-pill ${isActive ? 'active' : ''}`}
              onClick={() => onSelect?.(p.id)}
            >
              <span className="tab-pill-icon">
                {p.isDefault ? (
                  <Star size={13} style={{ verticalAlign: 'middle' }} />
                ) : p.isE2ee ? (
                  <Lock size={13} style={{ verticalAlign: 'middle' }} />
                ) : (
                  <Folder size={13} style={{ verticalAlign: 'middle' }} />
                )}
              </span>
              <span className="tab-pill-name">{p.name}</span>
              {p.isE2ee && (
                <span className="tab-pill-e2ee" title="گاوصندوق E2EE">
                  <Lock size={10} style={{ verticalAlign: 'middle' }} />
                </span>
              )}
              {p.shareEnabled && (
                <span className="tab-pill-shared" title="لینک اشتراک‌گذاری فعال است">
                  <Share2 size={10} style={{ verticalAlign: 'middle' }} />
                </span>
              )}
              <span className="tab-pill-count">
                {count.toLocaleString('fa-IR')}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          className="btn-new-portfolio-tab"
          onClick={onNewPortfolio}
          title="ایجاد پورتفوی جدید"
        >
          <Plus size={13} style={{ verticalAlign: 'middle', marginLeft: '3px' }} />
          <span>پورتفو</span>
        </button>
      </div>
    </div>
  );
}
