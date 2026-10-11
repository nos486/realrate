/**
 * PortfolioHistoryChart.jsx — How the portfolio's value moved from its first entry to today
 *
 * A line of the daily value (utils/portfolioHistory.js) in tomans or dollars, over a chosen span.
 * Hovering (or dragging a finger) marks a day and shows its value. Computed in the browser from
 * the decrypted ledgers and the public price history; nothing about the portfolio is sent out.
 */

import React, { useMemo, useState } from 'react';
import FilterPills from '../../../shared/ui/FilterPills.jsx';
import { CHART_COLORS } from '../../../shared/ui/chartColors.js';
import { useDailyHistory, useUsdAt } from '../../market/dailyHistory.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { formatPct } from '../../../shared/utils/formatters.js';
import { buildPortfolioSeries, sliceSeries } from '../utils/portfolioHistory.js';

const W = 300;
const H = 120;
const PAD = 6;

const RANGES = [
  { value: '30', label: '۱ ماه' },
  { value: '90', label: '۳ ماه' },
  { value: '365', label: '۱ سال' },
  { value: '0', label: 'همه' },
];
const UNITS = [
  { value: 'toman', label: 'تومان' },
  { value: 'usd', label: 'دلار' },
];

const dayFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'short', day: 'numeric' });
const dayLabel = (iso) => dayFormat.format(new Date(`${iso}T12:00:00+03:30`));
const fmt = (v, unit) => (Number.isFinite(v) ? Math.round(v).toLocaleString('fa-IR') : '-') + (unit === 'usd' ? ' $' : ' تومان');

/**
 * @param {{ assets: object[], hideValues?: boolean }} props - assets from buildAssetLedgers
 */
export default function PortfolioHistoryChart({ assets, hideValues = false }) {
  const [range, setRange] = useState('90');
  const [unit, setUnit] = useState('toman');
  const [hover, setHover] = useState(null);

  const ids = useMemo(() => assets.map((a) => a.assetId), [assets]);
  const { priceAt, loading } = useDailyHistory(ids);
  const usdAt = useUsdAt(assets.length > 0);
  const today = todayIso();

  const full = useMemo(
    () => buildPortfolioSeries({ assets, priceAt, usdAt, today }),
    [assets, priceAt, usdAt, today]
  );
  const series = useMemo(() => sliceSeries(full, Number(range)), [full, range]);

  if (!full || full.days.length < 2) return null;

  const values = series[unit];
  const known = values.filter((v) => Number.isFinite(v));
  if (known.length < 2) return null;

  const min = Math.min(...known);
  const max = Math.max(...known);
  const span = max - min;
  const n = values.length;
  const x = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v) => (span === 0 ? H / 2 : PAD + (1 - (v - min) / span) * (H - 2 * PAD));
  const path = values
    .map((v, i) => (Number.isFinite(v) ? `${i === 0 || !Number.isFinite(values[i - 1]) ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}` : ''))
    .join('');

  const first = known[0];
  const last = known[known.length - 1];
  const changePct = first > 0 ? ((last - first) / first) * 100 : null;
  const shown = hover !== null && Number.isFinite(values[hover]) ? hover : n - 1;

  const pick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHover(Math.round(frac * (n - 1)));
  };

  return (
    <section className="portfolio-history-card" aria-label="تاریخچه ارزش پورتفو">
      <div className="portfolio-history-head">
        <div>
          <span className="stat-label">تاریخچه ارزش پورتفو</span>
          <div className="portfolio-history-value">
            {hideValues ? '****' : fmt(values[shown], unit)}
            <span className="portfolio-history-day">{shown === n - 1 ? 'امروز' : dayLabel(series.days[shown])}</span>
          </div>
          {changePct !== null && !hideValues && (
            <span className={`portfolio-history-change ${changePct >= 0 ? 'is-up' : 'is-down'}`} dir="ltr">
              {changePct >= 0 ? '+' : '−'}{formatPct(Math.abs(changePct))}٪
            </span>
          )}
        </div>
        <div className="portfolio-history-controls">
          <FilterPills options={UNITS} activeValue={unit} onChange={setUnit} variant="segmented" size="sm" />
          <FilterPills options={RANGES} activeValue={range} onChange={setRange} variant="segmented" size="sm" />
        </div>
      </div>

      {hideValues ? (
        <p className="portfolio-history-note">مقادیر پنهان است.</p>
      ) : (
        <div
          className="portfolio-history-plot"
          dir="ltr"
          role="img"
          aria-label={`ارزش پورتفو از ${dayLabel(series.days[0])} تا امروز`}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={() => setHover(null)}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <path d={path} fill="none" stroke={CHART_COLORS[0]} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            {hover !== null && Number.isFinite(values[hover]) && (
              <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} className="portfolio-history-cursor" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
        </div>
      )}

      {(loading || full.estimated) && !hideValues && (
        <p className="portfolio-history-note">
          {loading ? 'در حال دریافت تاریخچه قیمت…' : 'برای بعضی دارایی‌ها تاریخچه قیمت کامل نیست؛ ارزش آن روزها با نزدیک‌ترین قیمت معلوم برآورد شده است.'}
        </p>
      )}
    </section>
  );
}
