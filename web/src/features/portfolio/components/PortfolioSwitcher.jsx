import React from 'react';
import { Star, Lock, Folder, Share2, Plus } from 'lucide-react';
import { t } from '../../../utils/i18n.js';

export default function PortfolioSwitcher({
  portfolios = [],
  activePortfolioId = null,
  onSelect,
  onNewPortfolio,
}) {
  return (
    <div className="portfolio-nav-bar">
      <div className="portfolio-tabs-scroll">
        <span className="portfolio-nav-label">{t('پورتفوها:')}</span>
        {portfolios.map((p) => {
          const isActive = p.id === activePortfolioId;
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
                ) : p.e2eeWrappedKey ? (
                  <Lock size={13} style={{ verticalAlign: 'middle' }} />
                ) : (
                  <Folder size={13} style={{ verticalAlign: 'middle' }} />
                )}
              </span>
              <span className="tab-pill-name">{p.name}</span>
              {p.e2eeWrappedKey && (
                <span className="tab-pill-e2ee" title={t('گاوصندوق E2EE')}>
                  <Lock size={10} style={{ verticalAlign: 'middle' }} />
                </span>
              )}
              {p.shareEnabled && (
                <span className="tab-pill-shared" title={t('لینک اشتراک‌گذاری فعال است')}>
                  <Share2 size={10} style={{ verticalAlign: 'middle' }} />
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          className="btn-new-portfolio-tab"
          onClick={onNewPortfolio}
          title={t('ایجاد پورتفوی جدید')}
        >
          <Plus size={13} style={{ verticalAlign: 'middle', marginInlineEnd: '3px' }} />
          <span>{t('پورتفو')}</span>
        </button>
      </div>
    </div>
  );
}
