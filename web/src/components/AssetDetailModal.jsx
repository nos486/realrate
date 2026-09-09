import React, { useState, useMemo, useRef, useId } from 'react';
import {
  Coins,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Activity,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
} from 'lucide-react';
import Modal from './ui/Modal.jsx';

function formatNum(num) {
  if (num === null || num === undefined || isNaN(num)) return '-';
  return Math.round(Number(num)).toLocaleString('fa-IR');
}

function formatPersianTime(isoStr) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    return (
      d.toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' }) +
      ' ساعت ' +
      d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
    );
  } catch {
    return isoStr;
  }
}

function formatTooltipTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * Generate smooth SVG cubic Bézier path points
 */
function createBezierPath(points) {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const prev = points[i - 1] || curr;
    const nextNext = points[i + 2] || next;

    const cp1x = curr.x + (next.x - prev.x) * 0.16;
    const cp1y = curr.y + (next.y - prev.y) * 0.16;
    const cp2x = next.x - (nextNext.x - curr.x) * 0.16;
    const cp2y = next.y - (nextNext.y - curr.y) * 0.16;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
  }
  return d;
}

// Physical asset specifications
const ASSET_SPECS = {
  gold_18k: {
    karat: '۱۸ عیار (۷۵۰ در ۱۰۰۰)',
    purity: '۷۵.۰٪ طلای خالص',
    weight: '۱.۰۰۰ گرم',
    standardDesc: 'طلای آبشده استاندارد ۱۸ عیار با کد استاندارد ملی، بدون حباب ضرب یا اجرت ساخت.',
  },
  mesghal: {
    karat: '۱۷ عیار (۷۰۵ در ۱۰۰۰)',
    purity: '۷۰.۵٪ طلای خالص',
    weight: '۴.۶۰۸ گرم',
    standardDesc: 'یک مثقال سنتی بازار طلا معادل ۴.۶۰۸ گرم طلای ۱۷ عیار (مظنه مبنای محاسبات طلافروشان).',
  },
  full_coin: {
    karat: '۲۱.۶ عیار (۹۰۰ در ۱۰۰۰)',
    purity: '۹۰.۰٪ طلای خالص',
    weight: '۸.۱۳۶ گرم (حاوی ۷.۳۲ گرم طلای ۲۴ عیار)',
    standardDesc: 'سکه تمام بهار آزادی طرح جدید (امامی - سال ۱۳۸۶)، دارای حداکثر نقدشوندگی در بازار.',
  },
  quarter_coin: {
    karat: '۲۱.۶ عیار (۹۰۰ در ۱۰۰۰)',
    purity: '۹۰.۰٪ طلای خالص',
    weight: '۲.۰۳۳ گرم (حاوی ۱.۸۳ گرم طلای ۲۴ عیار)',
    standardDesc: 'ربع سکه بهار آزادی، محبوب‌ترین قطع سکه برای پس‌انداز خرد با حباب تاریخی بالاتر.',
  },
  usd: {
    karat: 'ارز پایه بین‌المللی',
    purity: '۱۰۰٪ اسکناس نقد',
    weight: '۱ دلار آمریکا',
    standardDesc: 'اسکناس دلار نقدی بازار آزاد تهران (سبزه میدان / افشار)، مبنای نرخ‌گذاری تمام فلزات گرانبها.',
  },
};

export default function AssetDetailModal({
  isOpen,
  onClose,
  asset,
  sparklineData = [],
  rates = {},
  forex = {},
}) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const chartContainerRef = useRef(null);
  const gradId = useId();

  if (!asset) return null;

  const isUsd = asset.id === 'usd' || asset.type === 'usd';
  const assetSpecs = ASSET_SPECS[asset.id] || null;

  const currentPrice = Number(asset.market || asset.price || 0);

  // Prepare price history data points
  const points = useMemo(() => {
    const list = Array.isArray(sparklineData)
      ? sparklineData
          .filter((d) => d && typeof d.price === 'number' && d.price > 0)
          .map((d) => ({ price: Number(d.price), timestamp: d.timestamp }))
      : [];

    if (currentPrice > 0) {
      if (list.length === 0) {
        list.push({ price: currentPrice, timestamp: new Date().toISOString() });
      } else {
        const last = list[list.length - 1];
        const lastTime = last.timestamp ? new Date(last.timestamp).getTime() : 0;
        if (Date.now() - lastTime > 180000 || Math.abs(last.price - currentPrice) > 10) {
          list.push({ price: currentPrice, timestamp: new Date().toISOString() });
        }
      }
    }
    return list;
  }, [sparklineData, currentPrice]);

  // Chart coordinate calculations
  const chartWidth = 560;
  const chartHeight = 160;
  const padding = { top: 18, bottom: 22, left: 10, right: 10 };
  const drawW = chartWidth - padding.left - padding.right;
  const drawH = chartHeight - padding.top - padding.bottom;

  const { coords, minPrice, maxPrice, change, changePct, isUp, strokeColor, areaPath, linePath } =
    useMemo(() => {
      if (points.length === 0) {
        return {
          coords: [],
          minPrice: currentPrice,
          maxPrice: currentPrice,
          change: 0,
          changePct: 0,
          isUp: true,
          strokeColor: '#38bdf8',
          areaPath: '',
          linePath: '',
        };
      }

      let min = Infinity;
      let max = -Infinity;
      for (const p of points) {
        if (p.price < min) min = p.price;
        if (p.price > max) max = p.price;
      }

      const range = max - min;
      const effectiveRange = range === 0 ? max * 0.02 || 1 : range;

      const first = points[0];
      const last = points[points.length - 1];
      const diff = last.price - first.price;
      const diffPct = first.price > 0 ? (diff / first.price) * 100 : 0;
      const up = diff >= 0;
      const color = diff > 0 ? '#10b981' : diff < 0 ? '#f43f5e' : '#38bdf8';

      const computed = points.map((p, idx) => {
        const x = padding.left + (idx / Math.max(1, points.length - 1)) * drawW;
        const normalizedY = (p.price - min) / effectiveRange;
        const y = padding.top + drawH * (1 - normalizedY);
        return { x, y, price: p.price, timestamp: p.timestamp };
      });

      const lPath = createBezierPath(computed);
      const lastCoord = computed[computed.length - 1];
      const firstCoord = computed[0];
      const aPath = `${lPath} L ${lastCoord.x} ${chartHeight} L ${firstCoord.x} ${chartHeight} Z`;

      return {
        coords: computed,
        minPrice: min,
        maxPrice: max,
        change: diff,
        changePct: diffPct,
        isUp: up,
        strokeColor: color,
        areaPath: aPath,
        linePath: lPath,
      };
    }, [points, currentPrice, drawW, drawH, chartHeight, padding.left, padding.top]);

  const handleMouseMove = (e) => {
    if (!chartContainerRef.current || coords.length === 0) return;
    const rect = chartContainerRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const xPct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const closestIdx = Math.round(xPct * (coords.length - 1));
    setHoverIndex(closestIdx);
  };

  const handleMouseLeave = () => setHoverIndex(null);

  const activeCoord = hoverIndex !== null && coords[hoverIndex] ? coords[hoverIndex] : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={asset.name || (isUsd ? 'دلار نقدی آزاد' : 'جزئیات دارایی')}
      icon={
        isUsd ? (
          <DollarSign size={20} className="modal-icon-usd" />
        ) : (
          <Coins size={20} className="modal-icon-gold" />
        )
      }
      subtitle={isUsd ? 'اسکناس نقدی بازار آزاد تهران' : 'تحلیل جامع ارزش ذاتی، حباب و روند قیمت'}
      maxWidth="620px"
      className="asset-detail-modal"
    >
      <div className="asset-modal-content">
        {/* Top Hero Price & 24h Stats */}
        <div className="asset-modal-hero">
          <div className="hero-price-col">
            <span className="hero-price-label">آخرین نرخ بازار:</span>
            <div className="hero-price-row">
              <strong className="hero-price-number">{formatNum(currentPrice)}</strong>
              <span className="hero-price-unit">تومان</span>
            </div>
          </div>

          <div className="hero-stats-col">
            {/* 24h Change Pill */}
            <div className={`hero-change-pill ${isUp ? 'change-up' : 'change-down'}`}>
              {isUp ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
              <span>{Math.abs(changePct).toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}٪</span>
              <span className="change-num-diff">({isUp ? '+' : ''}{formatNum(change)} ت)</span>
            </div>

            <div className="hero-range-wrap">
              <div className="range-item">
                <span className="range-label">کف ۲۴h:</span>
                <strong className="range-val">{formatNum(minPrice)}</strong>
              </div>
              <span className="range-divider">/</span>
              <div className="range-item">
                <span className="range-label">سقف ۲۴h:</span>
                <strong className="range-val">{formatNum(maxPrice)}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* 24-Hour Price Graph Section */}
        <div className="asset-modal-chart-card">
          <div className="chart-card-header">
            <div className="chart-title-wrap">
              <Activity size={15} className="chart-icon" />
              <span className="chart-title">نمودار نوسان ۲۴ ساعت گذشته</span>
            </div>
            <span className="chart-timeframe-tag">بازه ۲۴ ساعته</span>
          </div>

          <div
            ref={chartContainerRef}
            className="asset-modal-svg-wrap"
            onMouseMove={handleMouseMove}
            onTouchMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onTouchEnd={handleMouseLeave}
          >
            {coords.length >= 2 ? (
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                preserveAspectRatio="none"
                className="asset-modal-svg"
              >
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
                    <stop offset="100%" stopColor={strokeColor} stopOpacity="0.01" />
                  </linearGradient>
                </defs>

                {/* Subtle horizontal grid lines */}
                <line
                  x1={padding.left}
                  y1={padding.top}
                  x2={chartWidth - padding.right}
                  y2={padding.top}
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="4 4"
                />
                <line
                  x1={padding.left}
                  y1={padding.top + drawH / 2}
                  x2={chartWidth - padding.right}
                  y2={padding.top + drawH / 2}
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="4 4"
                />
                <line
                  x1={padding.left}
                  y1={chartHeight - padding.bottom}
                  x2={chartWidth - padding.right}
                  y2={chartHeight - padding.bottom}
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="4 4"
                />

                {/* Area fill */}
                <path d={areaPath} fill={`url(#${gradId})`} />

                {/* Main line */}
                <path
                  d={linePath}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />

                {/* Hover line & dot */}
                {activeCoord && (
                  <g>
                    <line
                      x1={activeCoord.x}
                      y1={padding.top}
                      x2={activeCoord.x}
                      y2={chartHeight - padding.bottom}
                      stroke="rgba(255, 255, 255, 0.25)"
                      strokeWidth="1.2"
                      strokeDasharray="2 2"
                    />
                    <circle
                      cx={activeCoord.x}
                      cy={activeCoord.y}
                      r="5.5"
                      fill={strokeColor}
                      stroke="#0f172a"
                      strokeWidth="2.5"
                    />
                  </g>
                )}
              </svg>
            ) : (
              <div className="chart-empty-state">
                <span>اطلاعات نوسانات در حال جمع‌آوری است...</span>
              </div>
            )}

            {/* Interactive tooltip */}
            {activeCoord && (
              <div
                className="asset-modal-chart-tooltip"
                style={{
                  left: `${(activeCoord.x / chartWidth) * 100}%`,
                }}
              >
                <div className="tooltip-inner">
                  <strong className="tooltip-price-text">{formatNum(activeCoord.price)} تومان</strong>
                  {activeCoord.timestamp && (
                    <span className="tooltip-time-text">{formatTooltipTime(activeCoord.timestamp)}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="chart-footer-axis">
            <span>۲۴ ساعت پیش ({formatNum(minPrice)} ت)</span>
            <span>هم‌اکنون ({formatNum(maxPrice)} ت)</span>
          </div>
        </div>

        {/* Detailed Breakdown Grid */}
        {!isUsd ? (
          <div className="asset-details-grid">
            {/* Intrinsic Gold Value */}
            <div className="detail-stat-card">
              <span className="detail-stat-label">ارزش طلای خام (ذاتی):</span>
              <strong className="detail-stat-value gold-text">
                {formatNum(asset.intrinsic)} تومان
              </strong>
              <span className="detail-stat-sub">
                بر اساس انس جهانی {rates?.ons_gold?.price ? Math.round(rates.ons_gold.price) : 2890}$ و دلار روز
              </span>
            </div>

            {/* Standard Target Price */}
            {asset.expected_price > 0 && (
              <div className="detail-stat-card">
                <span className="detail-stat-label">قیمت استاندارد تعادلی:</span>
                <strong className="detail-stat-value blue-text">
                  {formatNum(asset.expected_price)} تومان
                </strong>
                <span className="detail-stat-sub">
                  با حباب مجاز استاندارد ({asset.target_bubble_pct}٪)
                </span>
              </div>
            )}

            {/* Current Bubble */}
            <div className="detail-stat-card">
              <span className="detail-stat-label">حباب فعلی بازار:</span>
              <strong className={`detail-stat-value ${asset.bubble_pct < 0 ? 'good-text' : 'warn-text'}`}>
                {asset.bubble !== null ? `${formatNum(Math.abs(asset.bubble))} تومان` : '-'}
                {asset.bubble_pct !== null && (
                  <span className="detail-stat-badge">
                    ({asset.bubble_pct < 0 ? 'منفی' : 'مثبت'} {Math.abs(asset.bubble_pct).toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}٪)
                  </span>
                )}
              </strong>
              <span className="detail-stat-sub">
                {asset.bubble_pct < 0
                  ? 'ارزش خرید فوق‌العاده؛ قیمت بازار پایین‌تر از ارزش طلای خام است.'
                  : 'مبلغ اضافه پرداختی بابت حق ضرب و تقاضای بازار.'}
              </span>
            </div>

            {/* Deviation from Standard */}
            {asset.diff_from_expected !== null && (
              <div className="detail-stat-card">
                <span className="detail-stat-label">انحراف از قیمت منصفانه:</span>
                <strong className={`detail-stat-value ${asset.diff_from_expected < 0 ? 'good-text' : 'danger-text'}`}>
                  {asset.diff_from_expected < 0 ? 'ارزان‌تر' : 'گران‌تر'} با {formatNum(Math.abs(asset.diff_from_expected))} تومان
                  {asset.diff_from_expected_pct !== null && (
                    <span className="detail-stat-badge">
                      ({Math.abs(asset.diff_from_expected_pct).toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}٪)
                    </span>
                  )}
                </strong>
                <span className="detail-stat-sub">
                  اختلاف با قیمت استاندارد دارای حباب منطقی
                </span>
              </div>
            )}
          </div>
        ) : (
          /* USD-specific live conversions & rates */
          <div className="asset-details-grid usd-grid">
            <div className="detail-stat-card">
              <span className="detail-stat-label">برابری با یورو (EUR):</span>
              <strong className="detail-stat-value blue-text">
                {formatNum((1 / (forex?.EUR || 0.915)) * currentPrice)} تومان
              </strong>
              <span className="detail-stat-sub">نرخ تبدیل زنده بین‌بانکی فارکس</span>
            </div>

            <div className="detail-stat-card">
              <span className="detail-stat-label">برابری با درهم امارات (AED):</span>
              <strong className="detail-stat-value blue-text">
                {formatNum((1 / (forex?.AED || 3.6725)) * currentPrice)} تومان
              </strong>
              <span className="detail-stat-sub">حواله درهم دبی مبنای واردات</span>
            </div>

            <div className="detail-stat-card">
              <span className="detail-stat-label">انس جهانی طلا (XAU):</span>
              <strong className="detail-stat-value gold-text">
                {rates?.ons_gold?.price ? rates.ons_gold.price.toLocaleString('fa-IR') : '۲,۸۹۰'} دلار
              </strong>
              <span className="detail-stat-sub">قیمت هر اونس تروی در بازار جهانی نیویورک</span>
            </div>

            <div className="detail-stat-card">
              <span className="detail-stat-label">برابری با لیر ترکیه (TRY):</span>
              <strong className="detail-stat-value blue-text">
                {formatNum((1 / (forex?.TRY || 33.5)) * currentPrice)} تومان
              </strong>
              <span className="detail-stat-sub">نرخ اسکناس بر اساس بازار فارکس</span>
            </div>
          </div>
        )}

        {/* Physical Asset Specifications Note */}
        {assetSpecs && (
          <div className="asset-spec-box">
            <div className="spec-box-header">
              <Scale size={15} className="spec-icon" />
              <strong className="spec-title">مشخصات استاندارد ضرب و عیار</strong>
            </div>
            <div className="spec-items-row">
              <div className="spec-pill">
                <span className="spec-pill-label">عیار رسمی:</span>
                <span className="spec-pill-val">{assetSpecs.karat}</span>
              </div>
              <div className="spec-pill">
                <span className="spec-pill-label">خلوص طلا:</span>
                <span className="spec-pill-val">{assetSpecs.purity}</span>
              </div>
              <div className="spec-pill">
                <span className="spec-pill-label">وزن استاندارد:</span>
                <span className="spec-pill-val">{assetSpecs.weight}</span>
              </div>
            </div>
            <p className="spec-desc">{assetSpecs.standardDesc}</p>
          </div>
        )}

        {/* Update timestamp footer */}
        <div className="asset-modal-footer-meta">
          <div className="meta-time">
            <Clock size={13} />
            <span>آخرین همگام‌سازی: {formatPersianTime(asset.updated_at || new Date().toISOString())}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
