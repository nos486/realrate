/**
 * PortfolioHistoryChart.jsx — How the portfolio's value moved from its first entry to today
 *
 * Lives inside the «ارزش کل» card. Closed by default: a row with the change over 24 hours, 7 days
 * and 1 month (what prices alone gained: money put in or taken out is not gain). Opening it shows the daily
 * value (utils/portfolioHistory.js) as a line in tomans or dollars over a chosen span; hovering
 * (or dragging a finger) marks a day. Computed in the browser from the decrypted ledgers and the
 * public price history; nothing about the portfolio is sent out.
 */

import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { CHART_COLORS } from '../../../shared/ui/chartColors.js';
import { useDailyHistory, useUsdAt } from '../../market/dailyHistory.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { formatPct } from '../../../shared/utils/formatters.js';
import { buildPortfolioSeries, sliceSeries, windowChange } from '../utils/portfolioHistory.js';

const W = 600;
const H = 200;
const PAD_Y = 12;
const GRID = 3;

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
const CHANGES = [
  { span: 1, label: '۲۴ ساعت' },
  { span: 7, label: '۷ روز' },
  { span: 30, label: '۱ ماه' },
];

const dayFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'short', day: 'numeric' });
const dayLabel = (iso) => dayFormat.format(new Date(`${iso}T12:00:00+03:30`));
const compact = new Intl.NumberFormat('fa-IR', { notation: 'compact', maximumFractionDigits: 1 });
const fmt = (v, unit) => (Number.isFinite(v) ? Math.round(v).toLocaleString('fa-IR') : '-') + (unit === 'usd' ? ' $' : ' تومان');
const signed = (pct) => `${pct >= 0 ? '+' : '−'}${formatPct(Math.abs(pct))}٪`;

/** A compact segmented control: one pill per option, the active one filled */
function Segmented({ options, value, onChange, label }) {
  return (
    <div className="portfolio-history-seg" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** One change chip: «۷ روز +۲٫۱٪», green or red */
function ChangeChip({ label, change, unit, hideValues }) {
  if (!change || change.pct === null) {
    return <span className="portfolio-history-chip is-flat"><span>{label}</span><b>—</b></span>;
  }
  const dir = Math.abs(change.pct) < 0.05 ? 'flat' : change.pct > 0 ? 'up' : 'down';
  return (
    <span className={`portfolio-history-chip is-${dir}`} title={hideValues ? undefined : fmt(change.gain, unit)}>
      <span>{label}</span>
      <b dir="ltr">{signed(change.pct)}</b>
    </span>
  );
}

/**
 * @param {{ assets: object[], hideValues?: boolean }} props - assets from buildAssetLedgers
 */
export default function PortfolioHistoryChart({ assets, hideValues = false }) {
  const [open, setOpen] = useState(false);
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

  // No chart yet: say why, so a portfolio is never just missing the card
  if (!full || full.days.length < 2) {
    return (
      <div className="portfolio-history-panel">
        <p className="portfolio-history-note">
          {full
            ? 'تاریخچه‌ی ارزش از فردا نمایش داده می‌شود؛ همه‌ی ثبت‌ها مال امروزند.'
            : 'برای دیدن تاریخچه‌ی ارزش، تاریخ خرید دارایی‌ها را ثبت کنید.'}
        </p>
      </div>
    );
  }

  const values = series[unit];
  const known = values.filter((v) => Number.isFinite(v));
  const n = values.length;
  const canPlot = known.length >= 2;

  const min = canPlot ? Math.min(...known) : 0;
  const max = canPlot ? Math.max(...known) : 0;
  const pad = (max - min) * 0.08 || max * 0.02 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const x = (i) => (i / (n - 1)) * W;
  const y = (v) => PAD_Y + (1 - (v - lo) / (hi - lo)) * (H - 2 * PAD_Y);
  const line = canPlot
    ? values.map((v, i) => (Number.isFinite(v) ? `${i === 0 || !Number.isFinite(values[i - 1]) ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}` : '')).join('')
    : '';
  const firstOk = values.findIndex((v) => Number.isFinite(v));
  const area = line ? `${line}L${x(n - 1).toFixed(1)},${H}L${x(firstOk).toFixed(1)},${H}Z` : '';
  const gridValues = Array.from({ length: GRID }, (_, k) => lo + ((hi - lo) * (k + 0.5)) / GRID);

  const shown = hover !== null && Number.isFinite(values[hover]) ? hover : n - 1;
  const pick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHover(Math.round(frac * (n - 1)));
  };
  const hoverLeft = hover !== null ? (hover / (n - 1)) * 100 : null;

  return (
    <div className={`portfolio-history-panel ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="portfolio-history-toggle"
        aria-expanded={open}
        aria-label="تاریخچه ارزش پورتفو"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="portfolio-history-chips">
          {CHANGES.map((c) => (
            <ChangeChip key={c.span} label={c.label} change={windowChange(full, unit, c.span)} unit={unit} hideValues={hideValues} />
          ))}
        </span>
        <ChevronDown size={18} className="portfolio-history-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div className="portfolio-history-body">
          <div className="portfolio-history-controls">
            <Segmented options={RANGES} value={range} onChange={setRange} label="بازه" />
            <Segmented options={UNITS} value={unit} onChange={setUnit} label="واحد" />
          </div>

          {hideValues ? (
            <p className="portfolio-history-note">مقادیر پنهان است.</p>
          ) : canPlot ? (
            <div className="portfolio-history-chart" dir="ltr">
              <div className="portfolio-history-axis-y" aria-hidden="true">
                {gridValues.map((v) => (
                  <span key={v} style={{ top: `${(y(v) / H) * 100}%` }}>{compact.format(v)}</span>
                ))}
              </div>
              <div
                className="portfolio-history-plot"
                role="img"
                aria-label={`ارزش پورتفو از ${dayLabel(series.days[0])} تا امروز`}
                onPointerMove={pick}
                onPointerDown={pick}
                onPointerLeave={() => setHover(null)}
              >
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
                  {gridValues.map((v) => (
                    <line key={v} x1="0" x2={W} y1={y(v)} y2={y(v)} className="portfolio-history-grid" vectorEffect="non-scaling-stroke" />
                  ))}
                  <path d={area} fill={CHART_COLORS[0]} fillOpacity="0.12" />
                  <path d={line} fill="none" stroke={CHART_COLORS[0]} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
                {hover !== null && Number.isFinite(values[hover]) && (
                  <>
                    <span className="portfolio-history-cursor" style={{ left: `${hoverLeft}%` }} />
                    <span className="portfolio-history-dot" style={{ left: `${hoverLeft}%`, top: `${(y(values[hover]) / H) * 100}%`, background: CHART_COLORS[0] }} />
                    <span className={`portfolio-history-tip ${hoverLeft > 70 ? 'is-left' : ''}`} style={{ left: `${hoverLeft}%` }} dir="rtl">
                      <b>{fmt(values[shown], unit)}</b>
                      <span>{dayLabel(series.days[shown])}</span>
                    </span>
                  </>
                )}
              </div>
              <div className="portfolio-history-axis-x" aria-hidden="true">
                <span>{dayLabel(series.days[0])}</span>
                <span>امروز</span>
              </div>
            </div>
          ) : (
            <p className="portfolio-history-note">برای این بازه هنوز داده‌ی کافی نیست.</p>
          )}

          {(loading || full.estimated) && !hideValues && (
            <p className="portfolio-history-note">
              {loading ? 'در حال دریافت تاریخچه قیمت…' : 'برای بعضی دارایی‌ها تاریخچه قیمت کامل نیست؛ ارزش آن روزها با نزدیک‌ترین قیمت معلوم برآورد شده است.'}
            </p>
          )}
          {full.datedByCreation && !hideValues && (
            <p className="portfolio-history-note">برای ثبت‌هایی که تاریخ ندارند، روز ثبت در برنامه حساب شده است.</p>
          )}
          <p className="portfolio-history-note">تغییر، فقط اثر قیمت‌هاست؛ خرید و فروش جزو سود حساب نمی‌شود.</p>
        </div>
      )}
    </div>
  );
}
