import React, { useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, Lock } from 'lucide-react';
import { CategoryIcon, formatNum } from '../utils/holdingHelpers.js';
import { formatPct } from '../../../shared/utils/formatters.js';
import DonutChart from '../../../shared/ui/DonutChart.jsx';

const otherCategoriesLabel = (count) => `سایر (${count.toLocaleString('fa-IR')} دسته)`;

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

  // Largest categories first, so the biggest slices take the first palette colors
  const allocationItems = useMemo(
    () =>
      [...categoryGroups]
        .sort((a, b) => b.totalRealValue - a.totalRealValue)
        .map((cat) => ({
          key: cat.key,
          label: cat.name,
          shortLabel: cat.badge || cat.name,
          value: cat.totalRealValue,
          icon: (
            <span className="donut-chart-cat-icon" aria-hidden="true">
              <CategoryIcon category={cat.key} size={13} />
            </span>
          ),
        })),
    [categoryGroups]
  );

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

      {/* Card 4: Asset allocation donut */}
      {categoryGroups.length > 0 && (portfolioMetrics.totalRealValue || 0) > 0 && !isVaultLocked && (
        <DonutChart
          title="ترکیب دارایی‌ها"
          items={allocationItems}
          centerLabel="ارزش کل"
          masked={hideValues}
          otherLabel={otherCategoriesLabel}
          headerExtra={<span className="count-pill">{categoryGroups.length.toLocaleString('fa-IR')} دسته</span>}
        />
      )}
    </div>
  );
}
