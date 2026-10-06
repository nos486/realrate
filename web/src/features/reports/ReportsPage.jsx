/**
 * ReportsPage.jsx — «گزارش‌ها»: a Shamsi year across incomes, everyday expenses and the
 * portfolios, in four views (the one open is kept in the address: ?view=)
 *
 * - «خلاصه» (OverviewView): the headline figures, what stands out, income against expenses month
 *   by month, and every month in one table with a CSV export
 * - «درآمد و هزینه» (FlowsView): the yearly reports of incomes and of everyday expenses
 * - «سرمایه‌گذاری» (InvestView): the share of income invested, month by month and by asset
 * - «دلاری» (DollarView): income and expenses in dollars, each at its own day's rate
 *
 * The year is loaded once (useReportData) and every view reads the same figures; only the open
 * view is drawn.
 */

import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChartColumn, LayoutDashboard, ArrowLeftRight, TrendingUp, DollarSign } from 'lucide-react';
import { AlertBanner, FeaturePageHeader, FilterPills } from '../../shared/ui/index.js';
import Skeleton from '../../shared/ui/Skeleton.jsx';
import VaultUnlockCard from '../../shared/vault/VaultUnlockCard.jsx';
import { useVault } from '../../shared/vault/useVault.js';
import { usePrivacyMode } from '../../hooks/usePrivacyMode.js';
import { todayIso } from '../../shared/utils/dates.js';
import PeriodSwitcher from '../../shared/flow/PeriodSwitcher.jsx';
import { formatShamsiYear, shamsiMonthOf } from '../../shared/flow/flowYear.js';
import { useReportData } from './useReportData.js';
import { reportFormatters } from './reportFormat.js';
import OverviewView from './views/OverviewView.jsx';
import FlowsView from './views/FlowsView.jsx';
import InvestView from './views/InvestView.jsx';
import DollarView from './views/DollarView.jsx';

const HEADER = {
  icon: <ChartColumn size={24} />,
  title: 'گزارش‌ها',
  subtitle: 'سال شما در یک نگاه: درآمد و هزینه، پس‌انداز، سرمایه‌گذاری و ارزش دلاری',
};

const VIEWS = [
  { value: 'overview', label: 'خلاصه', icon: <LayoutDashboard size={14} />, View: OverviewView },
  { value: 'flows', label: 'درآمد و هزینه', icon: <ArrowLeftRight size={14} />, View: FlowsView },
  { value: 'invest', label: 'سرمایه‌گذاری', icon: <TrendingUp size={14} />, View: InvestView },
  { value: 'dollar', label: 'دلاری', icon: <DollarSign size={14} />, View: DollarView },
];

const TABS = VIEWS.map(({ value, label, icon }) => ({ value, label, icon }));

function ReportBody({ jy, throughMonth, view, hideValues }) {
  const data = useReportData(jy, throughMonth);
  const f = useMemo(() => reportFormatters(hideValues), [hideValues]);
  const { View } = VIEWS.find((v) => v.value === view) || VIEWS[0];
  if (data.loading) {
    return (
      <div className="reports-loading" role="status" aria-label="در حال ساختن گزارش">
        <Skeleton height={96} radius={16} />
        <Skeleton height={260} radius={16} />
        <Skeleton height={260} radius={16} />
      </div>
    );
  }
  return (
    <>
      {data.errors.map((e) => <AlertBanner key={e} type="error" message={e} />)}
      <View data={data} f={f} yearLabel={formatShamsiYear(jy)} hideValues={hideValues} />
    </>
  );
}

export default function ReportsPage() {
  const { status: vaultStatus } = useVault();
  const hideValues = usePrivacyMode();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = VIEWS.some((v) => v.value === searchParams.get('view')) ? searchParams.get('view') : 'overview';
  const today = todayIso();
  const thisMonth = useMemo(() => shamsiMonthOf(today), [today]);
  const [month, setMonth] = useState(thisMonth);
  const throughMonth = month.jy === thisMonth.jy ? thisMonth.jm : 12;

  const changeView = (next) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'overview') params.delete('view');
    else params.set('view', next);
    setSearchParams(params, { replace: true });
  };

  if (vaultStatus === 'locked') {
    return (
      <div className="incomes-page-container">
        <FeaturePageHeader {...HEADER} />
        <VaultUnlockCard title="گزارش‌ها از داده‌های رمزنگاری‌شده‌ی شما ساخته می‌شوند" />
      </div>
    );
  }

  return (
    <div className="incomes-page-container reports-page">
      <FeaturePageHeader {...HEADER} />
      <div className="reports-toolbar">
        <nav className="reports-tabs" aria-label="نمای گزارش">
          <FilterPills options={TABS} activeValue={view} onChange={changeView} size="sm" />
        </nav>
        <PeriodSwitcher mode="year" month={month} thisMonth={thisMonth} onMonthChange={setMonth} />
      </div>
      <ReportBody jy={month.jy} throughMonth={throughMonth} view={view} hideValues={hideValues} />
    </div>
  );
}
