/**
 * ReportsPage.jsx — «گزارش‌ها»: a Shamsi year across incomes, everyday expenses and the
 * portfolios, all on one page (ReportDashboard) — the year's figures, what stands out, income
 * against expenses, by source and category, what was invested and where, the year in dollars, and
 * every month in one table — laid out in a grid of cards to read (and later print) as one report.
 *
 * The year is loaded once (useReportData); every card reads the same figures.
 */

import React, { useMemo, useState } from 'react';
import { ChartColumn } from 'lucide-react';
import { AlertBanner, FeaturePageHeader } from '../../shared/ui/index.js';
import Skeleton from '../../shared/ui/Skeleton.jsx';
import VaultUnlockCard from '../../shared/vault/VaultUnlockCard.jsx';
import { useVault } from '../../shared/vault/useVault.js';
import { usePrivacyMode } from '../../hooks/usePrivacyMode.js';
import { todayIso } from '../../shared/utils/dates.js';
import PeriodSwitcher from '../../shared/flow/PeriodSwitcher.jsx';
import { formatShamsiYear, shamsiMonthOf } from '../../shared/flow/flowYear.js';
import { useReportData } from './useReportData.js';
import { reportFormatters } from './reportFormat.js';
import ReportDashboard from './ReportDashboard.jsx';

const HEADER = {
  icon: <ChartColumn size={24} />,
  title: 'گزارش‌ها',
  subtitle: 'سال شما در یک نگاه: درآمد و هزینه، پس‌انداز، سرمایه‌گذاری و ارزش دلاری',
};

function ReportBody({ jy, throughMonth, hideValues }) {
  const data = useReportData(jy, throughMonth);
  const f = useMemo(() => reportFormatters(hideValues), [hideValues]);
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
      <ReportDashboard data={data} f={f} yearLabel={formatShamsiYear(jy)} hideValues={hideValues} />
    </>
  );
}

export default function ReportsPage() {
  const { status: vaultStatus } = useVault();
  const hideValues = usePrivacyMode();
  const today = todayIso();
  const thisMonth = useMemo(() => shamsiMonthOf(today), [today]);
  const [month, setMonth] = useState(thisMonth);
  const throughMonth = month.jy === thisMonth.jy ? thisMonth.jm : 12;

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
      <PeriodSwitcher mode="year" month={month} thisMonth={thisMonth} onMonthChange={setMonth} />
      <ReportBody jy={month.jy} throughMonth={throughMonth} hideValues={hideValues} />
    </div>
  );
}
