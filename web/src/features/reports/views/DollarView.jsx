/**
 * DollarView.jsx — The reports page's «دلاری»: income and expenses in dollars month by month,
 * each at the dollar's rate on its own day (its stored rate, else the price history); one
 * without a rate is counted apart, never at today's rate
 */

import React from 'react';
import { CHART_COLORS } from '../../../shared/ui/chartColors.js';
import MonthBarChart from '../MonthBarChart.jsx';

export default function DollarView({ data, f, yearLabel }) {
  const { dollars } = data;
  return (
    <div className="report-view">
      <MonthBarChart
        title={`درآمد و هزینه به دلار — ${yearLabel}`}
        months={dollars.months}
        series={[
          { key: 'income', label: 'درآمد', color: CHART_COLORS[0], value: (m) => m.income },
          { key: 'expense', label: 'هزینه', color: CHART_COLORS[1], value: (m) => m.expense },
        ]}
        format={f.usd}
        ariaValue={(m) => `درآمد ${f.usd(m.income)}، هزینه ${f.usd(m.expense)}`}
        readout={(m) => (
          <>
            <div>
              <strong className={m.net < 0 ? 'text-loss' : ''}>{f.usd(m.net)}</strong>
              <span><bdi>{m.label}</bdi>، مانده (درآمد − هزینه)</span>
            </div>
            <span className="report-readout-detail">درآمد {f.usd(m.income)} · هزینه {f.usd(m.expense)}</span>
          </>
        )}
      />

      <section className="portfolio-table-card report-table-card">
        <div className="portfolio-table-header">
          <div className="table-title"><div className="table-title-main"><h3>ماه‌به‌ماه به دلار</h3></div></div>
        </div>
        <div className="table-card-body">
          <table className="flow-month-grid report-month-grid">
            <caption className="sr-only">درآمد، هزینه و مانده به دلار، ماه‌به‌ماه</caption>
            <thead>
              <tr><th scope="col">ماه</th><th scope="col">درآمد</th><th scope="col">هزینه</th><th scope="col">مانده</th></tr>
            </thead>
            <tbody>
              {dollars.months.map((m) => (
                <tr key={m.key}>
                  <th scope="row">
                    {m.monthLabel}
                    {m.unpriced > 0 && (
                      <small className="report-unpriced" title="این موارد نرخ دلار روزشان معلوم نبود و در این ماه حساب نشده‌اند">
                        {m.unpriced.toLocaleString('fa-IR')} مورد بدون نرخ
                      </small>
                    )}
                  </th>
                  <td>{f.usd(m.income)}</td>
                  <td>{f.usd(m.expense)}</td>
                  <td className={m.net < 0 ? 'text-loss' : ''}>{f.usd(m.net)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">جمع سال</th>
                <td>{f.usd(dollars.income)}</td>
                <td>{f.usd(dollars.expense)}</td>
                <td className={dollars.net < 0 ? 'text-loss' : ''}>{f.usd(dollars.net)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <p className="report-footnote">
        هر مورد به نرخ دلار روز خودش.
        {dollars.unpriced > 0 && ` ${dollars.unpriced.toLocaleString('fa-IR')} مورد نرخ روزش معلوم نبود و حساب نشده است.`}
      </p>
    </div>
  );
}
