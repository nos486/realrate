import { intlLocale, t, plural } from '../../../utils/i18n.js';
import React, { useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, Lock } from 'lucide-react';
import { CategoryIcon, formatNum } from '../utils/holdingHelpers.js';
import { formatPct } from '../../../shared/utils/formatters.js';
import DonutChart from '../../../shared/ui/DonutChart.jsx';
import PortfolioHistoryChart from './PortfolioHistoryChart.jsx';
import PortfolioPlanCards from './PortfolioPlanCards.jsx';
import { DollarPnl } from '../../../shared/ui/DollarValue.jsx';

const otherCategoriesLabel = (count) => plural(count, t('سایر ({count} دسته)', { count: count.toLocaleString(intlLocale()) }), t('سایر ({count} دسته‌ها)', { count: count.toLocaleString(intlLocale()) }));

export default function PortfolioOverviewCards({
  portfolioMetrics = {},
  categoryGroups = [],
  holdingsCount = 0,
  hideValues = false,
  isVaultLocked = false,
  // Realized profit/loss from sell transactions (null when there is none to show)
  realizedPnl = null,
  // Category targets against today's mix (utils/allocationTargets.js); null hides the card
  allocation = null,
  onEditTargets = null,
  // The risk-tolerance test (utils/riskProfile.js): its latest result and the opener; null hides the card
  riskResult = null,
  onOpenRisk = null,
  // Leave the plan cards out (the page shows them elsewhere)
  hidePlanCards = false,
  // The open positions in dollars (utils/assetLedger.js sumDollarPnl), or null
  dollarPnl = null,
  // What goals have reserved of the portfolio's assets, in tomans (features/goals): shown under the total
  reservedToman = 0,
  // The portfolio's asset ledgers (utils/assetLedger.js): the value history under the total value
  historyAssets = [],
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
              <CategoryIcon category={cat.icon || cat.key} size={13} />
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
          <span className="stat-label">{t('ارزش کل')}</span>
          <span className="real-pill">{t('ارزش روز')}</span>
        </div>
        <div className={`stat-number gold-gradient-text ${hideValues ? 'is-masked' : ''}`}>
          {isVaultLocked ? (
            <span className="locked-stat">
              <Lock size={16} style={{ verticalAlign: 'middle', marginInlineEnd: '4px' }} />{' '}{t('قفل')}
            </span>
          ) : hideValues ? (
            '****'
          ) : (
            formatNum(portfolioMetrics.totalRealValue)
          )}
          {!isVaultLocked && <span className="stat-unit">{t('تومان')}</span>}
        </div>
        <div className="stat-sub">
          {isVaultLocked
            ? t('گاوصندوق قفل است')
            : t('سرمایه اولیه: {cost}', {
              cost: hasData
                ? hideValues
                  ? t('**** تومان')
                  : t('{amount} تومان', { amount: formatNum(portfolioMetrics.totalCost) })
                : t('ثبت‌نشده'),
            })}
        </div>
        {!isVaultLocked && reservedToman > 0 && (
          <div className="stat-sub portfolio-reserved">
            <span>{t('اختصاص‌یافته به اهداف: {amount} تومان', { amount: hideValues ? '****' : formatNum(reservedToman) })}</span>
            <span>{t('در دسترس: {amount} تومان', { amount: hideValues ? '****' : formatNum(Math.max(0, portfolioMetrics.totalRealValue - reservedToman)) })}</span>
          </div>
        )}
        {!isVaultLocked && historyAssets.length > 0 && (
          <PortfolioHistoryChart assets={historyAssets} hideValues={hideValues} />
        )}
      </div>

      {/* Card 2: Total PnL */}
      <div className={`portfolio-stat-card pnl-card ${cardStatusClass}`}>
        <div className="stat-header">
          <span className="stat-label">{t('سود / زیان کل')}</span>
        </div>

        <div className="stat-pnl-row">
          <div className={`stat-number ${hideValues ? 'is-masked' : ''}`}>
            {isVaultLocked ? (
              <span className="stat-sub" style={{ fontSize: '15px' }}>
                <Lock size={14} style={{ verticalAlign: 'middle', marginInlineEnd: '4px' }} />{' '}{t('قفل است')}
              </span>
            ) : hasData ? (
              <>
                {hideValues ? '****' : `${isProfit ? '+' : ''}${formatNum(portfolioMetrics.totalPnl)}`}
                <span className="stat-unit">{t('تومان')}</span>
              </>
            ) : (
              <span className="stat-sub" style={{ fontSize: '15px' }}>{t('بدون قیمت خرید')}</span>
            )}
          </div>

          {!isVaultLocked && hasData && (
            <span className={`pnl-badge ${isProfit ? 'profit' : 'loss'}`}>
              {isProfit ? (
                <ArrowUpRight size={13} style={{ verticalAlign: 'middle' }} />
              ) : (
                <ArrowDownRight size={13} style={{ verticalAlign: 'middle' }} />
              )}
              {hideValues ? '****' : t('{sign}{pct}٪', { sign: isProfit ? '+' : '', pct: formatPct(Math.abs(portfolioMetrics.totalPnlPct || 0)) })}
            </span>
          )}
        </div>

        <div className="stat-sub">
          {isVaultLocked
            ? t('گاوصندوق قفل است')
            : hasData
            ? t('از زمان خرید اولیه')
            : t('محاسبه به نرخ روز')}
        </div>

        {!isVaultLocked && dollarPnl && (
          <div className="stat-sub"><DollarPnl pnl={dollarPnl} hideValues={hideValues} /></div>
        )}

        {!isVaultLocked && realizedPnl !== null && (
          <div className="stat-sub realized-pnl-row">
            {t('سود/زیان تحقق‌یافته (فروش‌ها):')}{' '}
            <strong className={realizedPnl >= 0 ? 'profit-text' : 'loss-text'}>
              {hideValues ? '****' : `${realizedPnl > 0 ? '+' : ''}${formatNum(realizedPnl)}`}
            </strong>{' '}
            {t('تومان')}
          </div>
        )}
      </div>

      {/* Card 3: Item Count */}
      <div className="portfolio-stat-card action-card">
        <div className="stat-header">
          <span className="stat-label">{t('تعداد اقلام')}</span>
        </div>
        <div className="stat-number">
          {isVaultLocked ? (
            <span className="locked-stat">
              <Lock size={16} style={{ verticalAlign: 'middle', marginInlineEnd: '4px' }} />{' '}{t('قفل')}
            </span>
          ) : (
            <>
              {holdingsCount.toLocaleString(intlLocale())}
              <span className="stat-unit">{t('قلم')}</span>
            </>
          )}
        </div>
      </div>

      {/* Card 4: Asset allocation donut */}
      {categoryGroups.length > 0 && (portfolioMetrics.totalRealValue || 0) > 0 && !isVaultLocked && (
        <DonutChart
          title={t('ترکیب دارایی‌ها')}
          items={allocationItems}
          centerLabel={t('ارزش کل')}
          masked={hideValues}
          otherLabel={otherCategoriesLabel}
          headerExtra={<span className="count-pill">{plural(categoryGroups.length, t('{count} دسته', { count: categoryGroups.length.toLocaleString(intlLocale()) }), t('{count} دسته‌ها', { count: categoryGroups.length.toLocaleString(intlLocale()) }))}</span>}
        />
      )}

      {/* Cards 5 and 6: the plan (targets, risk test); on narrow screens they sit below the holdings */}
      {!hidePlanCards && (
        <PortfolioPlanCards
          allocation={allocation} onEditTargets={onEditTargets} riskResult={riskResult} onOpenRisk={onOpenRisk}
          hideValues={hideValues} isVaultLocked={isVaultLocked}
        />
      )}
    </div>
  );
}
