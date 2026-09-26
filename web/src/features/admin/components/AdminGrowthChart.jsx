/**
 * AdminGrowthChart.jsx — Daily active users or sign-ups over the last 30 days (bar chart)
 *
 * One series at a time (switched with the shared ChartToggle), oldest day on the left. The
 * readout shows the selected day (the latest by default; hover / tap a bar to pick another)
 * and the header the period's figure: average daily active users, or total sign-ups.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ChartToggle } from '../../../shared/ui/DonutChart.jsx';
import { getAdminGrowth } from '../api/adminApi.js';
import { faNum } from '../utils/adminFormat.js';

const DAYS = 30;

const SERIES = [
  { id: 'active', label: 'کاربران فعال', unit: 'کاربر فعال', color: '#3987e5' },
  { id: 'signups', label: 'ثبت‌نام', unit: 'ثبت‌نام', color: '#199e70' },
];

/** «۴ مهر» for a YYYY-MM-DD day (read as UTC, the server's day boundary) */
const dayLabel = (day, withYear = false) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('fa-IR', { day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}) });

export default function AdminGrowthChart({ reloadToken = 0 }) {
  const [series, setSeries] = useState(null);
  const [error, setError] = useState('');
  const [measure, setMeasure] = useState('active');
  const [activeIndex, setActiveIndex] = useState(null);

  useEffect(() => {
    let active = true;
    getAdminGrowth(DAYS)
      .then((data) => {
        if (active) setSeries(Array.isArray(data.series) ? data.series : []);
      })
      .catch((err) => {
        if (active) setError(err.message || 'دریافت آمار رشد ناموفق بود.');
      });
    return () => {
      active = false;
    };
  }, [reloadToken]);

  const meta = SERIES.find((s) => s.id === measure);
  const values = useMemo(() => (series || []).map((d) => Number(d[measure]) || 0), [series, measure]);
  const max = Math.max(1, ...values);
  const sum = values.reduce((a, b) => a + b, 0);
  const headline = measure === 'active'
    ? `میانگین روزانه ${faNum(Math.round((sum / Math.max(values.length, 1)) * 10) / 10)}`
    : `مجموع ${faNum(sum)}`;

  const index = activeIndex ?? values.length - 1;
  const day = series?.[index];

  return (
    <div className="portfolio-stat-card admin-growth-card">
      <div className="stat-header">
        <span className="stat-label">روند ۳۰ روز اخیر</span>
        <ChartToggle
          label="نمودار"
          options={SERIES.map((s) => ({ id: s.id, label: s.label }))}
          value={measure}
          onChange={(id) => {
            setMeasure(id);
            setActiveIndex(null);
          }}
        />
      </div>

      {error ? (
        <div className="stat-sub">{error}</div>
      ) : !series ? (
        <div className="admin-growth-skeleton" aria-label="در حال دریافت آمار" role="status" />
      ) : (
        <>
          <div className="admin-growth-readout" aria-live="polite">
            <div>
              <strong>{faNum(values[index] || 0)}</strong>
              <span>
                {meta.unit}، {day ? dayLabel(day.day) : ''}
              </span>
            </div>
            <span className="admin-growth-headline">{headline}</span>
          </div>

          <div className="admin-growth-plot" onMouseLeave={() => setActiveIndex(null)}>
            {values.map((v, i) => (
              <button
                key={series[i].day}
                type="button"
                className={`admin-growth-col ${i === index ? 'is-active' : ''}`}
                onMouseEnter={() => setActiveIndex(i)}
                onFocus={() => setActiveIndex(i)}
                onClick={() => setActiveIndex(i)}
                aria-label={`${dayLabel(series[i].day, true)}: ${faNum(v)} ${meta.unit}`}
                aria-pressed={i === index}
              >
                <span className="admin-growth-bar" style={{ height: `${(v / max) * 100}%`, background: meta.color }} />
              </button>
            ))}
          </div>
          <div className="admin-growth-axis" aria-hidden="true">
            <span>{dayLabel(series[0].day)}</span>
            <span>{dayLabel(series[Math.floor(series.length / 2)].day)}</span>
            <span>{dayLabel(series[series.length - 1].day)}</span>
          </div>
        </>
      )}
    </div>
  );
}
