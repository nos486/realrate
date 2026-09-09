import React, { useState, useMemo, useRef } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Calendar,
  Layers,
  RefreshCw,
  Minus,
  Maximize2,
  Activity,
} from 'lucide-react';

function formatNum(num) {
  if (num === null || num === undefined || isNaN(num)) return '۰';
  return Math.round(num).toLocaleString('fa-IR');
}

function formatPersianDate(isoStr) {
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

function formatTooltipDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return (
      d.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }) +
      ' - ' +
      d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    );
  } catch {
    return isoStr;
  }
}

/**
 * Generate smooth SVG cubic Bézier path points
 */
function createBezierPath(points) {
  if (points.length === 0) return '';
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

export default function PriceHistoryChart({
  history = [],
  loading = false,
  title = 'نمودار تاریخچه قیمت',
  subtitle = '',
  range = '24h',
  onRangeChange = () => {},
  onRefresh = () => {},
  sources = [],
  selectedSourceId = '',
  onSelectSource = () => {},
  selectedPriceType = 'usd',
  onSelectPriceType = () => {},
  priceTypeInfo = {},
}) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const svgRef = useRef(null);

  // Filter & sort data points chronologically
  const sortedData = useMemo(() => {
    if (!Array.isArray(history)) return [];
    return [...history]
      .filter((item) => item && typeof item.price === 'number' && item.price > 0 && item.timestamp)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }, [history]);

  // Key metrics calculation
  const metrics = useMemo(() => {
    if (sortedData.length === 0) {
      return { min: 0, max: 0, avg: 0, latest: 0, first: 0, change: 0, changePct: 0, isUp: true };
    }
    const prices = sortedData.map((d) => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const sum = prices.reduce((acc, p) => acc + p, 0);
    const avg = sum / prices.length;
    const first = prices[0];
    const latest = prices[prices.length - 1];
    const change = latest - first;
    const changePct = first > 0 ? (change / first) * 100 : 0;
    const isUp = change >= 0;

    return { min, max, avg, latest, first, change, changePct, isUp };
  }, [sortedData]);

  // Chart dimensions
  const width = 800;
  const height = 280;
  const padding = { top: 30, right: 25, bottom: 40, left: 75 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Coordinate scales
  const chartPoints = useMemo(() => {
    if (sortedData.length === 0) return [];
    const minPrice = metrics.min;
    const maxPrice = metrics.max;
    const priceSpan = maxPrice - minPrice === 0 ? 1 : maxPrice - minPrice;
    // Add 8% vertical headroom
    const yMin = Math.max(0, minPrice - priceSpan * 0.08);
    const yMax = maxPrice + priceSpan * 0.08;
    const effectiveSpan = yMax - yMin;

    if (sortedData.length === 1) {
      return [
        {
          x: padding.left + chartW / 2,
          y: padding.top + chartH / 2,
          data: sortedData[0],
        },
      ];
    }

    return sortedData.map((item, idx) => {
      const x = padding.left + (idx / (sortedData.length - 1)) * chartW;
      const normalizedY = (item.price - yMin) / effectiveSpan;
      const y = padding.top + chartH - normalizedY * chartH;
      return { x, y, data: item };
    });
  }, [sortedData, metrics, chartW, chartH, padding.left, padding.top]);

  // SVG Paths
  const linePath = useMemo(() => {
    return createBezierPath(chartPoints);
  }, [chartPoints]);

  const areaPath = useMemo(() => {
    if (chartPoints.length < 2) return '';
    const first = chartPoints[0];
    const last = chartPoints[chartPoints.length - 1];
    const baseLine = padding.top + chartH;
    return `${linePath} L ${last.x} ${baseLine} L ${first.x} ${baseLine} Z`;
  }, [chartPoints, linePath, padding.top, chartH]);

  // Y-axis grid ticks (4 horizontal lines)
  const yTicks = useMemo(() => {
    if (sortedData.length === 0) return [];
    const minPrice = metrics.min;
    const maxPrice = metrics.max;
    const span = maxPrice - minPrice === 0 ? 1000 : maxPrice - minPrice;
    const yMin = Math.max(0, minPrice - span * 0.08);
    const yMax = maxPrice + span * 0.08;

    const ticks = [];
    const count = 4;
    for (let i = 0; i <= count; i++) {
      const val = yMin + (i / count) * (yMax - yMin);
      const y = padding.top + chartH - (i / count) * chartH;
      ticks.push({ val: Math.round(val), y });
    }
    return ticks;
  }, [sortedData, metrics, chartH, padding.top]);

  // Handle pointer tracking on SVG
  const handleMouseMove = (e) => {
    if (!svgRef.current || chartPoints.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.clientX;
    const relativeX = ((clientX - rect.left) / rect.width) * width;

    // Find nearest point
    let nearestIdx = 0;
    let minDist = Infinity;
    chartPoints.forEach((pt, idx) => {
      const dist = Math.abs(pt.x - relativeX);
      if (dist < minDist) {
        minDist = dist;
        nearestIdx = idx;
      }
    });
    setHoverIndex(nearestIdx);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const activeHoverPoint = hoverIndex !== null && chartPoints[hoverIndex] ? chartPoints[hoverIndex] : null;

  return (
    <div className="relative flex flex-col gap-5 rounded-2xl border border-white/[0.08] bg-[#0f1422]/95 p-6 sm:p-7 shadow-2xl backdrop-blur-md transition-all duration-200 light:border-slate-200 light:bg-white light:shadow-md">
      {/* Card Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-white/5 light:border-slate-100">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
              <Activity size={20} />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-white light:text-slate-900 m-0">{title}</h3>
                {subtitle && (
                  <span className="text-[11px] text-slate-300 light:text-slate-600 bg-white/[0.06] light:bg-slate-100 px-2.5 py-0.5 rounded-md font-medium">
                    {subtitle}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5">ثبت تاریخچه زنده و تحلیلی تغییرات قیمت</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {metrics.latest > 0 && (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-extrabold bg-sky-500/10 text-sky-300 border border-sky-500/30">
                <span className="text-[10px] opacity-70">آخرین نرخ:</span>
                <span className="text-sm font-black">{formatNum(metrics.latest)} تومان</span>
              </div>
            )}
            {sortedData.length > 1 && (
              <div
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold border ${
                  metrics.isUp
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                }`}
              >
                {metrics.isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                <span>
                  {metrics.isUp ? '+' : ''}
                  {formatNum(metrics.change)} تومان ({metrics.isUp ? '+' : ''}
                  {metrics.changePct.toFixed(2).replace('.', '/')}٪)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Range Selector & Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-black/30 light:bg-slate-100 p-1 rounded-xl border border-white/5 light:border-slate-200">
            {[
              { id: '24h', label: '۲۴ ساعت' },
              { id: '7d', label: '۷ روز' },
              { id: '30d', label: '۳۰ روز' },
              { id: 'all', label: 'همه' },
            ].map((r) => (
              <button
                key={r.id}
                type="button"
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                  range === r.id
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white light:text-slate-600 light:hover:text-slate-900'
                }`}
                onClick={() => onRangeChange(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 h-9 rounded-xl text-xs font-semibold border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white light:border-slate-200 light:bg-slate-100 light:text-slate-700 light:hover:bg-slate-200 transition-colors cursor-pointer select-none"
            onClick={onRefresh}
            title="بروزرسانی داده‌های نمودار"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>بروزرسانی</span>
          </button>
        </div>
      </div>

      {/* Filter Selectors Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3.5 sm:p-4 rounded-xl bg-black/25 border border-white/5 light:bg-slate-50 light:border-slate-200">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-400 light:text-slate-600 whitespace-nowrap">نوع ارز / طلا:</label>
            <select
              className="h-9 rounded-xl border border-white/10 bg-[#141b2a] light:bg-white px-3 text-xs text-slate-200 light:text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/40 min-w-[150px] cursor-pointer"
              value={selectedPriceType}
              onChange={(e) => onSelectPriceType(e.target.value)}
            >
              {Object.entries(priceTypeInfo).map(([key, info]) => (
                <option key={key} value={key}>
                  {info.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-400 light:text-slate-600 whitespace-nowrap">سورس قیمت:</label>
            <select
              className="h-9 rounded-xl border border-white/10 bg-[#141b2a] light:bg-white px-3 text-xs text-slate-200 light:text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/40 min-w-[220px] cursor-pointer"
              value={selectedSourceId}
              onChange={(e) => onSelectSource(e.target.value)}
            >
              <option value="">تمامی سورس‌های این نوع</option>
              {sources
                .filter((s) => !selectedPriceType || s.priceType === selectedPriceType)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.sourceType === 'telegram' ? `@${s.channelUsername}` : 'API'})
                  </option>
                ))}
            </select>
          </div>
        </div>

        {sortedData.length > 0 && (
          <span className="text-xs text-slate-400">
            تعداد رکوردهای ثبت‌شده: <strong className="text-amber-400 font-black">{sortedData.length.toLocaleString('fa-IR')}</strong>
          </span>
        )}
      </div>

      {/* Key Stats Bar */}
      {sortedData.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="flex flex-col p-3 rounded-xl bg-black/20 border border-white/5 light:bg-slate-50 light:border-slate-100">
            <span className="text-[11px] text-slate-400">کمترین نرخ بازه:</span>
            <span className="text-sm font-black text-emerald-400 mt-1">{formatNum(metrics.min)} تومان</span>
          </div>
          <div className="flex flex-col p-3 rounded-xl bg-black/20 border border-white/5 light:bg-slate-50 light:border-slate-100">
            <span className="text-[11px] text-slate-400">بیشترین نرخ بازه:</span>
            <span className="text-sm font-black text-rose-400 mt-1">{formatNum(metrics.max)} تومان</span>
          </div>
          <div className="flex flex-col p-3 rounded-xl bg-black/20 border border-white/5 light:bg-slate-50 light:border-slate-100">
            <span className="text-[11px] text-slate-400">میانگین موزون:</span>
            <span className="text-sm font-black text-amber-400 mt-1">{formatNum(metrics.avg)} تومان</span>
          </div>
          <div className="flex flex-col p-3 rounded-xl bg-black/20 border border-white/5 light:bg-slate-50 light:border-slate-100">
            <span className="text-[11px] text-slate-400">دامنه نوسان:</span>
            <span className="text-sm font-black text-sky-400 mt-1">
              {formatNum(Math.max(0, metrics.max - metrics.min))} تومان
            </span>
          </div>
        </div>
      )}

      {/* SVG Chart Area */}
      <div className="relative w-full overflow-hidden rounded-2xl border border-white/5 bg-black/25 p-3 sm:p-5 light:bg-slate-50/60 light:border-slate-100 min-h-[340px] sm:min-h-[380px] flex items-center justify-center">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/60 backdrop-blur-[2px] rounded-xl text-xs text-slate-300">
            <RefreshCw size={24} className="animate-spin text-sky-400" />
            <span>در حال دریافت داده‌های تاریخچه...</span>
          </div>
        )}

        {sortedData.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400 gap-1">
            <Activity size={32} className="text-slate-500 mb-2" />
            <p className="text-sm font-semibold">هنوز رکوردی از تاریخچه قیمت برای این بازه ثبت نشده است.</p>
            <span className="text-xs text-slate-500">
              با دریافت قیمت از سورس‌ها یا کلیک روی «دریافت آنی قیمت همه سورس‌ها»، نقاط جدید ثبت و در این نمودار نمایش داده می‌شوند.
            </span>
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto max-h-[340px] select-none block"

            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-blue, #3b82f6)" stopOpacity="0.38" />
                <stop offset="70%" stopColor="var(--accent-blue, #3b82f6)" stopOpacity="0.08" />
                <stop offset="100%" stopColor="var(--accent-blue, #3b82f6)" stopOpacity="0.0" />
              </linearGradient>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Grid Ticks & Horizontal Lines */}
            {yTicks.map((tick, i) => (
              <g key={i}>
                <line
                  x1={padding.left}
                  y1={tick.y}
                  x2={width - padding.right}
                  y2={tick.y}
                  stroke="var(--border-color, rgba(255,255,255,0.08))"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 8}
                  y={tick.y + 4}
                  textAnchor="end"
                  fill="var(--text-muted, #94a3b8)"
                  fontSize="10"
                  fontFamily="inherit"
                >
                  {formatNum(tick.val)}
                </text>
              </g>
            ))}

            {/* Area Fill */}
            {areaPath && (
              <path d={areaPath} fill="url(#chartGradient)" />
            )}

            {/* Main Bézier Curve Line */}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke="var(--accent-blue, #3b82f6)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Single Point Dot (if only 1 data point) */}
            {chartPoints.length === 1 && (
              <circle
                cx={chartPoints[0].x}
                cy={chartPoints[0].y}
                r="6"
                fill="var(--accent-blue, #3b82f6)"
                stroke="#ffffff"
                strokeWidth="2"
              />
            )}

            {/* X-axis date labels (First and Last) */}
            {chartPoints.length > 1 && (
              <>
                <text
                  x={chartPoints[0].x}
                  y={height - 12}
                  textAnchor="start"
                  fill="var(--text-muted, #94a3b8)"
                  fontSize="10"
                  fontFamily="inherit"
                >
                  {formatPersianDate(chartPoints[0].data.timestamp)}
                </text>
                <text
                  x={chartPoints[chartPoints.length - 1].x}
                  y={height - 12}
                  textAnchor="end"
                  fill="var(--text-muted, #94a3b8)"
                  fontSize="10"
                  fontFamily="inherit"
                >
                  {formatPersianDate(chartPoints[chartPoints.length - 1].data.timestamp)}
                </text>
              </>
            )}

            {/* Interactive Crosshair & Hover Tooltip */}
            {activeHoverPoint && (
              <g>
                {/* Vertical Crosshair Line */}
                <line
                  x1={activeHoverPoint.x}
                  y1={padding.top}
                  x2={activeHoverPoint.x}
                  y2={padding.top + chartH}
                  stroke="var(--accent-blue, #3b82f6)"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />

                {/* Point Highlight Circle */}
                <circle
                  cx={activeHoverPoint.x}
                  cy={activeHoverPoint.y}
                  r="5.5"
                  fill="#ffffff"
                  stroke="var(--accent-blue, #3b82f6)"
                  strokeWidth="3"
                  filter="url(#glow)"
                />

                {/* SVG Tooltip Box */}
                {(() => {
                  const tipW = 160;
                  const tipH = 58;
                  let tipX = activeHoverPoint.x - tipW / 2;
                  if (tipX < padding.left) tipX = padding.left;
                  if (tipX + tipW > width - padding.right) tipX = width - padding.right - tipW;
                  let tipY = activeHoverPoint.y - tipH - 12;
                  if (tipY < 8) tipY = activeHoverPoint.y + 12;

                  return (
                    <g transform={`translate(${tipX}, ${tipY})`}>
                      <rect
                        width={tipW}
                        height={tipH}
                        rx="6"
                        fill="var(--card-bg-elevated, #1e293b)"
                        stroke="var(--border-color, rgba(255,255,255,0.15))"
                        strokeWidth="1"
                        filter="drop-shadow(0 4px 12px rgba(0,0,0,0.3))"
                      />
                      <text
                        x={tipW / 2}
                        y="18"
                        textAnchor="middle"
                        fill="var(--text-heading, #f8fafc)"
                        fontSize="12"
                        fontWeight="bold"
                        fontFamily="inherit"
                      >
                        {formatNum(activeHoverPoint.data.price)} تومان
                      </text>
                      <text
                        x={tipW / 2}
                        y="34"
                        textAnchor="middle"
                        fill="var(--text-muted, #94a3b8)"
                        fontSize="9"
                        fontFamily="inherit"
                      >
                        {formatTooltipDate(activeHoverPoint.data.timestamp)}
                      </text>
                      {activeHoverPoint.data.sourceName && (
                        <text
                          x={tipW / 2}
                          y="48"
                          textAnchor="middle"
                          fill="var(--accent-blue, #60a5fa)"
                          fontSize="9"
                          fontFamily="inherit"
                        >
                          سورس: {activeHoverPoint.data.sourceName}
                        </text>
                      )}
                    </g>
                  );
                })()}
              </g>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}
