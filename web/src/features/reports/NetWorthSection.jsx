/**
 * NetWorthSection.jsx — The reports page's net worth: what the user owns minus what they owe, at
 * the end of each month of the year, and how it moved against the dollar
 *
 *   ┌──────────── net worth · change in the year · the dollar · in dollars ────────────┐
 *   │ net worth month by month (7)                │ against the dollar, since the start │
 *   └──────────────────────────────────────────────────────────────────────────────────┘
 *
 * Grid cells of ReportDashboard; the figures come from useNetWorth (netWorth.js).
 */

import { t } from '../../utils/i18n.js';
import React from 'react';
import { Landmark, TrendingUp, DollarSign, Scale } from 'lucide-react';
import { MiniCard } from '../../shared/ui/index.js';
import Skeleton from '../../shared/ui/Skeleton.jsx';
import { CHART_COLORS } from '../../shared/ui/chartColors.js';
import MonthBarChart from './MonthBarChart.jsx';
import ReportCard from './ReportCard.jsx';

const NET_COLOR = CHART_COLORS[2];
const DOLLAR_COLOR = CHART_COLORS[3];
const NEGATIVE_COLOR = CHART_COLORS[1];

/** The verdict under the dollar card: did the net worth grow more than the dollar? */
function verdict(compare) {
  if (!compare || compare.beatDollar === null) return t('نرخ دلار این بازه در دسترس نیست');
  return compare.beatDollar ? t('ارزش خالص شما بیشتر از دلار رشد کرد') : t('ارزش خالص شما کمتر از دلار رشد کرد');
}

/**
 * @param {{ netWorth: ReturnType<import('./useNetWorth.js').useNetWorth>, f: object, yearLabel: string }} props
 */
export default function NetWorthSection({ netWorth, f, yearLabel }) {
  const { loading, error, start, end, months, compare, estimated, empty } = netWorth;

  if (loading) {
    return (
      <div className="span-12" role="status" aria-label={t('در حال محاسبه‌ی ارزش خالص')}>
        <Skeleton height={120} radius={16} />
      </div>
    );
  }
  if (error || empty || !end) {
    return (
      <ReportCard title={t('ارزش خالص')} Icon={Scale} span="span-12">
        <p className="report-empty">
          {error || (empty
            ? t('برای دیدن ارزش خالص، دارایی‌هایتان را در پورتفو و وام‌ها و چک‌هایتان را ثبت کنید.')
            : t('در این سال هنوز چیزی برای ارزش خالص ثبت نشده است.'))}
        </p>
      </ReportCard>
    );
  }

  const debts = end.loans + end.payable;
  const shown = months.filter((m) => m.point);

  return (
    <>
      <div className="incomes-summary-grid report-kpis span-12">
        <MiniCard
          icon={<Scale size={14} />}
          title={t('ارزش خالص')}
          value={f.money(end.net)}
          unit={t('تومان')}
          color={end.net >= 0 ? 'green' : 'rose'}
          className="incomes-summary-card is-primary"
          footer={<span>{t('دارایی {assets} · بدهی {debts}', { assets: f.compact(end.assets + end.receivable), debts: f.compact(debts) })}</span>}
        />
        <MiniCard
          icon={<TrendingUp size={14} />}
          title={t('تغییر ارزش خالص')}
          value={f.pct(compare?.pct)}
          color={(compare?.change || 0) >= 0 ? 'green' : 'rose'}
          className="incomes-summary-card"
          footer={<span>{t('{amount} تومان از ابتدای {year}', { amount: f.compact(compare?.change || 0), year: yearLabel })}</span>}
        />
        <MiniCard
          icon={<DollarSign size={14} />}
          title={t('رشد دلار در همین بازه')}
          value={f.pct(compare?.dollarPct)}
          color="gold"
          className="incomes-summary-card"
          footer={<span>{verdict(compare)}</span>}
        />
        <MiniCard
          icon={<Landmark size={14} />}
          title={t('ارزش خالص به دلار')}
          value={end.usd === null ? '—' : f.usd(end.usd)}
          color={(compare?.usdChange || 0) >= 0 ? 'green' : 'rose'}
          className="incomes-summary-card"
          footer={<span>{compare?.usdPct === null || compare?.usdPct === undefined ? t('تغییر به دلار: —') : t('تغییر به دلار: {pct}', { pct: f.pct(compare.usdPct) })}</span>}
        />
      </div>

      <div className="span-7">
        <MonthBarChart
          compact
          title={t('ارزش خالص — {year}', { year: yearLabel })}
          months={shown}
          series={[{ key: 'net', label: t('ارزش خالص'), color: NET_COLOR, value: (m) => m.point.net }]}
          negativeColor={NEGATIVE_COLOR}
          format={f.compact}
          ariaValue={(m) => t('ارزش خالص {amount} تومان', { amount: f.compact(m.point.net) })}
          readout={(m) => (
            <>
              <div>
                <strong className={m.point.net < 0 ? 'text-loss' : ''}>{f.compact(m.point.net)}</strong>
                <span>{t('پایان {month}', { month: m.label })}</span>
              </div>
              <span className="report-readout-detail">
                {t('دارایی {assets} · وام {loans} · چک {cheques}', {
                  assets: f.compact(m.point.assets),
                  loans: f.compact(m.point.loans),
                  cheques: f.compact(m.point.receivable - m.point.payable),
                })}
              </span>
            </>
          )}
        />
      </div>
      <div className="span-5">
        <MonthBarChart
          compact
          title={t('در برابر دلار — تغییر از ابتدای سال')}
          months={shown}
          series={[
            { key: 'net', label: t('ارزش خالص'), color: NET_COLOR, value: (m) => m.netPct },
            { key: 'dollar', label: t('دلار'), color: DOLLAR_COLOR, value: (m) => m.dollarPct },
          ]}
          format={f.pct}
          ariaValue={(m) => t('ارزش خالص {net}، دلار {dollar}', { net: f.pct(m.netPct), dollar: f.pct(m.dollarPct) })}
          readout={(m) => (
            <>
              <div>
                <strong>{m.point.usd === null ? '—' : f.usd(m.point.usd)}</strong>
                <span>{t('ارزش خالص به دلار، پایان {month}', { month: m.label })}</span>
              </div>
              {start && <span className="report-readout-detail">{t('از {from}', { from: start.usd === null ? '—' : f.usd(start.usd) })}</span>}
            </>
          )}
        />
      </div>
      {estimated && (
        <p className="report-empty span-12">{t('* ارزش بعضی دارایی‌ها در روزهایی که تاریخچه‌ی قیمت ندارند تخمینی است (نزدیک‌ترین قیمت موجود).')}</p>
      )}
    </>
  );
}
