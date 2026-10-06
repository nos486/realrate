/**
 * InvestView.jsx — The reports page's «سرمایه‌گذاری»: what went into the portfolios this year and
 * its share of income
 *
 * - The year's buys, sells, net and share of income
 * - The share month by month (a month that sold more than it bought hangs under the zero line),
 *   the year's share as the dashed line, and its table
 * - Where it went: the net per asset (a donut of the buys and a table of buy, sell and net)
 *
 * Loan-funded buys and swaps between assets are not new money and are left out (reportMath.js).
 */

import React from 'react';
import { ShoppingCart, HandCoins, TrendingUp, Percent } from 'lucide-react';
import { MiniCard, EmptyState } from '../../../shared/ui/index.js';
import DonutChart from '../../../shared/ui/DonutChart.jsx';
import { CHART_COLORS } from '../../../shared/ui/chartColors.js';
import { resolveAssetDisplayName } from '../../../config/sourceRegistry.js';
import MonthBarChart from '../MonthBarChart.jsx';

const assetName = (a) => a.assetName || resolveAssetDisplayName(a.assetId) || a.assetId;

export default function InvestView({ data, f, yearLabel, hideValues }) {
  const { shareMonths, shareYear, byAsset } = data;
  if (!shareYear.bought && !shareYear.sold) {
    return (
      <EmptyState
        title={`در ${yearLabel} خرید یا فروشی در پورتفوها ثبت نشده`}
        description="خرید و فروش دارایی‌ها را در پورتفو ثبت کنید تا ببینید هر ماه چه سهمی از درآمدتان سرمایه‌گذاری شده است."
      />
    );
  }
  const donutItems = byAsset.filter((a) => a.bought > 0).map((a) => ({ key: a.assetId, label: assetName(a), value: a.bought }));

  return (
    <div className="report-view">
      <div className="incomes-summary-grid report-summary">
        <MiniCard icon={<TrendingUp size={14} />} title="سرمایه‌گذاری خالص" value={f.money(shareYear.net)} unit="تومان" color="blue" className="incomes-summary-card is-primary" />
        <MiniCard icon={<Percent size={14} />} title="سهم از درآمد" value={f.pct(shareYear.share)} color="gold" className="incomes-summary-card" footer={<span>درآمد {f.compact(shareYear.income)}</span>} />
        <MiniCard icon={<ShoppingCart size={14} />} title="خرید" value={f.money(shareYear.bought)} unit="تومان" color="green" className="incomes-summary-card" />
        <MiniCard icon={<HandCoins size={14} />} title="فروش و برداشت" value={f.money(shareYear.sold)} unit="تومان" color="rose" className="incomes-summary-card" />
      </div>

      <div className="report-grid">
        <MonthBarChart
          title={`سهم سرمایه‌گذاری از درآمد — ${yearLabel}`}
          months={shareMonths}
          series={[{ key: 'share', label: 'سهم از درآمد', color: CHART_COLORS[0], value: (m) => m.share ?? 0 }]}
          negativeColor={CHART_COLORS[1]}
          format={f.pct}
          average={shareYear.share}
          averageLabel="کل سال"
          ariaValue={(m) => (m.share === null ? 'بدون درآمد' : `${f.pct(m.share)} از درآمد`)}
          readout={(m) => (
            <>
              <div>
                <strong>{f.pct(m.share)}</strong>
                <span><bdi>{m.label}</bdi>{m.share === null && m.net !== 0 ? '، بدون درآمد ثبت‌شده' : ''}</span>
              </div>
              <span className="report-readout-detail">
                درآمد {f.compact(m.income)} · خرید {f.compact(m.bought)} · فروش {f.compact(m.sold)} · خالص {f.compact(m.net)}
              </span>
            </>
          )}
        />
        <DonutChart title="خرید به تفکیک دارایی" items={donutItems} centerLabel={`خرید ${yearLabel}`} masked={hideValues} />
      </div>

      <section className="portfolio-table-card report-table-card">
        <div className="portfolio-table-header">
          <div className="table-title"><div className="table-title-main"><h3>به تفکیک دارایی</h3></div></div>
        </div>
        <div className="table-card-body">
          <table className="flow-month-grid report-month-grid">
            <caption className="sr-only">خرید، فروش و خالص هر دارایی در سال</caption>
            <thead>
              <tr><th scope="col">دارایی</th><th scope="col">خرید</th><th scope="col">فروش و برداشت</th><th scope="col">خالص</th></tr>
            </thead>
            <tbody>
              {byAsset.map((a) => (
                <tr key={a.assetId}>
                  <th scope="row">{assetName(a)}</th>
                  <td>{f.compact(a.bought)}</td>
                  <td>{f.compact(a.sold)}</td>
                  <td className={a.net < 0 ? 'text-loss' : ''}>{f.compact(a.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="report-footnote">خرید با وام و جابه‌جایی دارایی‌ها (خرید با دارایی دیگر یا فروش به دارایی دیگر) پول تازه نیست و حساب نمی‌شود.</p>
    </div>
  );
}
