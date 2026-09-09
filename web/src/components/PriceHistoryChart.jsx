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
    <div className="price-history-chart-card">
      {/* Card Header */}
      <div className="chart-header-row">
        <div className="chart-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={18} style={{ color: 'var(--accent-blue)' }} />
            <h3 className="chart-title">{title}</h3>
            {subtitle && <span className="chart-subtitle">{subtitle}</span>}
          </div>
          <div className="chart-metrics-row">
            {metrics.latest > 0 && (
              <div className="metric-chip current-price">
                <span className="metric-chip-label">آخرین قیمت:</span>
                <span className="metric-chip-val">{formatNum(metrics.latest)} تومان</span>
              </div>
            )}
            {sortedData.length > 1 && (
              <div className={`metric-chip change-chip ${metrics.isUp ? 'positive' : 'negative'}`}>
                {metrics.isUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
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
        <div className="chart-controls-group">
          <div className="range-pills-bar">
            {[
              { id: '24h', label: '۲۴ ساعت' },
              { id: '7d', label: '۷ روز' },
              { id: '30d', label: '۳۰ روز' },
              { id: 'all', label: 'همه' },
            ].map((r) => (
              <button
                key={r.id}
                type="button"
                className={`range-pill ${range === r.id ? 'active' : ''}`}
                onClick={() => onRangeChange(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn-sm site-link chart-refresh-btn"
            onClick={onRefresh}
            title="بروزرسانی داده‌های نمودار"
          >
            <RefreshCw size={12} className={loading ? 'spin-anim' : ''} />
            <span>بروزرسانی</span>
          </button>
        </div>
      </div>

      {/* Filter Selectors Bar */}
      <div className="chart-selectors-bar">
        <div className="selector-item">
          <label className="selector-label">نوع ارز / طلا:</label>
          <select
            className="chart-select"
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

        <div className="selector-item">
          <label className="selector-label">سورس قیمت:</label>
          <select
            className="chart-select"
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

      {/* Key Stats Bar */}
      {sortedData.length > 0 && (
        <div className="chart-stats-summary-bar">
          <div className="stat-item">
            <span className="stat-lbl">کمترین:</span>
            <span className="stat-val">{formatNum(metrics.min)} تومان</span>
          </div>
          <div className="stat-item">
            <span className="stat-lbl">بیشترین:</span>
            <span className="stat-val">{formatNum(metrics.max)} تومان</span>
          </div>
          <div className="stat-item">
            <span className="stat-lbl">میانگین:</span>
            <span className="stat-val">{formatNum(metrics.avg)} تومان</span>
          </div>
          <div className="stat-item">
            <span className="stat-lbl">نقاط ثبت‌شده:</span>
            <span className="stat-val">{sortedData.length.toLocaleString('fa-IR')} رکورد</span>
          </div>
        </div>
      )}

      {/* SVG Chart Area */}
      <div className="svg-chart-container">
        {loading && (
          <div className="chart-loading-overlay">
            <RefreshCw size={24} className="spin-anim" style={{ color: 'var(--accent-blue)' }} />
            <span>در حال دریافت داده‌های تاریخچه...</span>
          </div>
        )}

        {sortedData.length === 0 && !loading ? (
          <div className="chart-empty-state">
            <Activity size={32} style={{ color: 'var(--text-muted)', marginBottom: '8px' }} />
            <p>هنوز رکوردی از تاریخچه قیمت برای این بازه ثبت نشده است.</p>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              با دریافت قیمت از سورس‌ها یا کلیک روی «دریافت آنی قیمت همه سورس‌ها»، نقاط جدید ثبت و در این نمودار نمایش داده می‌شوند.
            </span>
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            className="price-svg"
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
