import React from 'react';
import { ArrowUpRight, ArrowDownRight, Lock } from 'lucide-react';
import { formatNum } from '../utils/holdingHelpers.js';
import { formatPct } from '../../../shared/utils/formatters.js';

export default function PortfolioOverviewCards({
  portfolioMetrics = {},
  categoryGroups = [],
  holdingsCount = 0,
  hideValues = false,
  isVaultLocked = false,
  // Realized profit/loss from sell transactions (null when there is none to show)
  realizedPnl = null,
}) {
  const hasData = portfolioMetrics.hasAnyCost;
  const isProfit = (portfolioMetrics.totalPnl || 0) >= 0;
  const cardStatusClass = isVaultLocked
    ? 'neutral'
    : hasData
    ? (isProfit ? 'profit' : 'loss')
    : 'neutral';

  return (
    <div className="portfolio-overview-grid">
      {/* Card 1: Total Real Value */}
      <div className="portfolio-stat-card main-val">
        <div className="stat-header">
          <span className="stat-label">ارزش کل</span>
          <span className="real-pill">ارزش روز</span>
        </div>
        <div className={`stat-number gold-gradient-text ${hideValues ? 'is-masked' : ''}`}>
          {isVaultLocked ? (
            <span className="locked-stat">
              <Lock size={16} style={{ verticalAlign: 'middle', marginLeft: '4px' }} /> قفل
            </span>
          ) : hideValues ? (
            '****'
          ) : (
            formatNum(portfolioMetrics.totalRealValue)
          )}
          {!isVaultLocked && <span className="stat-unit">تومان</span>}
        </div>
        <div className="stat-sub">
          {isVaultLocked
            ? 'گاوصندوق قفل است'
            : `سرمایه اولیه: ${
                hasData
                  ? hideValues
                    ? '**** تومان'
                    : `${formatNum(portfolioMetrics.totalCost)} تومان`
                  : 'ثبت‌نشده'
              }`}
        </div>
      </div>

      {/* Card 2: Total PnL */}
      <div className={`portfolio-stat-card pnl-card ${cardStatusClass}`}>
        <div className="stat-header">
          <span className="stat-label">سود / زیان کل</span>
        </div>

        <div className="stat-pnl-row">
          <div className={`stat-number ${hideValues ? 'is-masked' : ''}`}>
            {isVaultLocked ? (
              <span className="stat-sub" style={{ fontSize: '15px' }}>
                <Lock size={14} style={{ verticalAlign: 'middle', marginLeft: '4px' }} /> قفل است
              </span>
            ) : hasData ? (
              <>
                {hideValues ? '****' : `${isProfit ? '+' : ''}${formatNum(portfolioMetrics.totalPnl)}`}
                <span className="stat-unit">تومان</span>
              </>
            ) : (
              <span className="stat-sub" style={{ fontSize: '15px' }}>بدون قیمت خرید</span>
            )}
          </div>

          {!isVaultLocked && hasData && (
            <span className={`pnl-badge ${isProfit ? 'profit' : 'loss'}`}>
              {isProfit ? (
                <ArrowUpRight size={13} style={{ verticalAlign: 'middle' }} />
              ) : (
                <ArrowDownRight size={13} style={{ verticalAlign: 'middle' }} />
              )}
              {hideValues ? '****' : `${isProfit ? '+' : ''}${formatPct(Math.abs(portfolioMetrics.totalPnlPct || 0))}٪`}
            </span>
          )}
        </div>

        <div className="stat-sub">
          {isVaultLocked
            ? 'گاوصندوق قفل است'
            : hasData
            ? 'از زمان خرید اولیه'
            : 'محاسبه به نرخ روز'}
        </div>

        {!isVaultLocked && realizedPnl !== null && (
          <div className="stat-sub realized-pnl-row">
            سود/زیان تحقق‌یافته (فروش‌ها):{' '}
            <strong className={realizedPnl >= 0 ? 'profit-text' : 'loss-text'}>
              {hideValues ? '****' : `${realizedPnl > 0 ? '+' : ''}${formatNum(realizedPnl)}`}
            </strong>{' '}
            تومان
          </div>
        )}
      </div>

      {/* Card 3: Item Count */}
      <div className="portfolio-stat-card action-card">
        <div className="stat-header">
          <span className="stat-label">تعداد اقلام</span>
        </div>
        <div className="stat-number">
          {isVaultLocked ? (
            <span className="locked-stat">
              <Lock size={16} style={{ verticalAlign: 'middle', marginLeft: '4px' }} /> قفل
            </span>
          ) : (
            <>
              {holdingsCount.toLocaleString('fa-IR')}
              <span className="stat-unit">قلم</span>
            </>
          )}
        </div>
      </div>

      {/* Card 4: Asset Allocation Distribution Breakdown */}
      {categoryGroups.length > 0 && (portfolioMetrics.totalRealValue || 0) > 0 && !isVaultLocked && (
        <div className="portfolio-stat-card allocation-card">
          <div className="stat-header">
            <span className="stat-label">ترکیب دارایی‌ها</span>
            <span className="count-pill">{categoryGroups.length.toLocaleString('fa-IR')} دسته</span>
          </div>
          <div className="allocation-bar" aria-label="نمودار تفکیک دارایی‌ها">
            {categoryGroups.map((cat) => {
              const pct = (cat.totalRealValue / portfolioMetrics.totalRealValue) * 100;
              if (pct < 0.5) return null;
              return (
                <div
                  key={cat.key}
                  className={`allocation-segment cat-${cat.key}`}
                  style={{ width: `${pct}%` }}
                  title={`${cat.name}: ${Number(pct).toLocaleString('fa-IR', {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}٪`}
                />
              );
            })}
          </div>
          <div className="allocation-chips">
            {categoryGroups.map((cat) => {
              const pct = (cat.totalRealValue / portfolioMetrics.totalRealValue) * 100;
              return (
                <div key={cat.key} className="allocation-chip">
                  <span className={`chip-dot cat-${cat.key}`} />
                  <span className="chip-name">{cat.name}:</span>
                  <strong className="chip-pct">
                    {Number(pct).toLocaleString('fa-IR', {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}٪
                  </strong>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
