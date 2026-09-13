import React from 'react';
import { Plus, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { formatNum } from '../utils/holdingHelpers.js';

export default function PortfolioOverviewCards({
  portfolioMetrics = {},
  hideValues = false,
  onOpenAdd,
  isVaultLocked = false,
}) {
  const isProfit = (portfolioMetrics.totalPnl || 0) >= 0;

  return (
    <div className="portfolio-overview-cards-container">
      {/* Total Current Real Value */}
      <div className="portfolio-stat-card total-value-card">
        <div className="stat-card-top">
          <span className="stat-label">ارزش روز پورتفو</span>
        </div>
        <div className={`stat-number gold-gradient-text ${hideValues ? 'is-masked' : ''}`}>
          {isVaultLocked ? 'قفل' : hideValues ? '****' : formatNum(portfolioMetrics.totalRealValue)}
          {!isVaultLocked && <span className="stat-unit">تومان</span>}
        </div>
        <div className="stat-sub">
          {isVaultLocked
            ? 'گاوصندوق قفل است'
            : `سرمایه اولیه: ${
                portfolioMetrics.hasAnyCost
                  ? hideValues
                    ? '**** تومان'
                    : `${formatNum(portfolioMetrics.totalCost)} تومان`
                  : 'ثبت‌نشده'
              }`}
        </div>
      </div>

      {/* Total Profit / Loss */}
      <div className={`portfolio-stat-card pnl-card ${isProfit ? 'profit' : 'loss'}`}>
        <div className="stat-card-top">
          <span className="stat-label">سود / زیان کل</span>
          {isProfit ? (
            <ArrowUpRight size={16} className="pnl-icon-profit" />
          ) : (
            <ArrowDownRight size={16} className="pnl-icon-loss" />
          )}
        </div>
        <div className={`stat-number ${hideValues ? 'is-masked' : ''}`}>
          {isVaultLocked ? (
            'قفل'
          ) : !portfolioMetrics.hasAnyCost ? (
            '—'
          ) : hideValues ? (
            '****'
          ) : (
            `${isProfit ? '+' : ''}${formatNum(portfolioMetrics.totalPnl)}`
          )}
          {!isVaultLocked && portfolioMetrics.hasAnyCost && <span className="stat-unit">تومان</span>}
        </div>
        <div className="stat-sub">
          {isVaultLocked ? (
            'رمز عبور لازم است'
          ) : !portfolioMetrics.hasAnyCost ? (
            'قیمت خریدی ثبت نشده است'
          ) : (
            <span className="pnl-pct-highlight">
              بازدهی کل:{' '}
              {hideValues
                ? '****'
                : `${isProfit ? '+' : ''}${Math.abs(portfolioMetrics.totalPnlPct || 0).toFixed(1)}٪`}
            </span>
          )}
        </div>
      </div>

      {/* Quick Add Asset Action Card */}
      <div className="portfolio-stat-card add-action-card" onClick={onOpenAdd} role="button" tabIndex={0}>
        <div className="add-action-icon-wrap">
          <Plus size={24} />
        </div>
        <span className="add-action-title">ثبت دارایی جدید</span>
        <span className="add-action-sub">طلا، سکه، نقره، ارز، بورس...</span>
      </div>
    </div>
  );
}
