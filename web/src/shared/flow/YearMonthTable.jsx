/**
 * YearMonthTable.jsx — The yearly report's table: each month of the Shamsi year with its total,
 * the change from the month before, its share of the year and how many records; a row opens that
 * month
 */

import React from 'react';
import { formatAmountMasked } from './flowFormat.js';

const formatPct = (v) => `${Math.abs(v).toLocaleString('fa-IR', { maximumFractionDigits: Math.abs(v) < 10 ? 1 : 0 })}٪`;

/**
 * @param {{ series: Array<object>, kind: 'income'|'expense', onOpenMonth?: (jm: number) => void,
 *   hideValues?: boolean }} props
 */
export default function YearMonthTable({ series, kind, onOpenMonth, hideValues = false }) {
  const total = series.reduce((sum, m) => sum + m.total, 0);
  const max = Math.max(0, ...series.map((m) => m.total));
  const tone = (change) => ((change >= 0) === (kind === 'income') ? 'text-positive' : 'text-loss');
  return (
    <div className="portfolio-table-card flow-month-table">
      <div className="portfolio-table-header">
        <div className="table-title">
          <div className="table-title-main"><h3>ماه‌به‌ماه</h3></div>
          <p className="expense-month-total">جمع: <strong>{formatAmountMasked(total, hideValues)}</strong> تومان</p>
        </div>
      </div>
      <div className="table-card-body">
        <table className="flow-month-grid">
          <thead>
            <tr>
              <th>ماه</th>
              <th>جمع (تومان)</th>
              <th>نسبت به ماه قبل</th>
              <th className="flow-share-col">سهم از سال</th>
              <th>تعداد</th>
            </tr>
          </thead>
          <tbody>
            {[...series].reverse().map((m) => (
              <tr key={m.key} className={onOpenMonth ? 'is-clickable' : ''} onClick={onOpenMonth ? () => onOpenMonth(m.jm) : undefined}>
                <td><strong>{m.monthLabel}</strong></td>
                <td className="num">{m.total > 0 ? formatAmountMasked(m.total, hideValues) : '—'}</td>
                <td className={`num ${m.change !== null ? tone(m.change) : ''}`}>
                  {m.change === null ? '—' : `${m.change >= 0 ? '+' : '−'}${formatPct(m.change)}`}
                </td>
                <td className="flow-share-col">
                  <span className="flow-share">
                    <span className="flow-share-track">
                      <span className={`flow-share-bar is-${kind}`} style={{ width: `${max > 0 ? (m.total / max) * 100 : 0}%` }} />
                    </span>
                    <small>{total > 0 ? formatPct((m.total / total) * 100) : '—'}</small>
                  </span>
                </td>
                <td className="num">{m.count.toLocaleString('fa-IR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
