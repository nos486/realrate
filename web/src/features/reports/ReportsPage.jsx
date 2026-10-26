/**
 * ReportsPage.jsx — «گزارش‌ها»: a Shamsi year (or the 3 / 5 years ending with it) across incomes,
 * everyday expenses and the portfolios, all on one page (ReportDashboard) — the figures, what
 * stands out, income against expenses, by source and category, what was invested and where, the
 * net worth against the dollar (useNetWorth), the period in dollars, and every month in one table
 * — in sections, laid out in a grid of cards to read (and later print) as one report. Several
 * years are the same page, month by month, with a year-by-year table added.
 *
 * The period is loaded once (useReportData); every card reads the same figures. «خروجی PDF» prints
 * the page on its own (printReport.js: the browser's «Save as PDF»; the website — the Android
 * app's web view can't print).
 */

import { t } from '../../utils/i18n.js';
import { calendarLocale } from '../../shared/utils/dates.js';
import React, { useMemo, useRef, useState } from 'react';
import { ChartColumn, FileDown } from 'lucide-react';
import { AlertBanner, Button, FeaturePageHeader, FilterPills } from '../../shared/ui/index.js';
import Skeleton from '../../shared/ui/Skeleton.jsx';
import VaultUnlockCard from '../../shared/vault/VaultUnlockCard.jsx';
import { useVault } from '../../shared/vault/useVault.js';
import { usePrivacyMode } from '../../hooks/usePrivacyMode.js';
import { todayIso } from '../../shared/utils/dates.js';
import PeriodSwitcher from '../../shared/flow/PeriodSwitcher.jsx';
import { formatShamsiYear, currentSalaryMonth } from '../../shared/flow/flowYear.js';
import { useSalaryMonths } from '../../shared/salary/useSalaryMonths.js';
import { useReportData } from './useReportData.js';
import { useNetWorth } from './useNetWorth.js';
import { reportFormatters } from './reportFormat.js';
import ReportDashboard from './ReportDashboard.jsx';
import { printReport } from './printReport.js';
import { isNativeApp } from '../../shared/native/nativeApp.js';

/** «۱۴۰۵», or «۱۴۰۳–۱۴۰۵» for several years ending with it */
const spanOf = (jy, years) => (years > 1 ? `${formatShamsiYear(jy - years + 1)}–${formatShamsiYear(jy)}` : formatShamsiYear(jy));

/** How many years the page covers: the year shown, or that many years ending with it */
const SPANS = [
  { value: 1, label: t('یک سال') },
  { value: 3, label: t('۳ سال') },
  { value: 5, label: t('۵ سال') },
];

const HEADER = {
  icon: <ChartColumn size={24} />,
  title: t('گزارش‌ها'),
  help: 'reports',
  subtitle: t('سال شما در یک نگاه: درآمد و هزینه، پس‌انداز، سرمایه‌گذاری، ارزش خالص و ارزش دلاری'),
};

/** The year, or the years ending with it, month by month: the same page whatever the span */
function ReportBody({ jy, years, throughMonth, starts, hideValues }) {
  const data = useReportData(jy, throughMonth, years, starts);
  const netWorth = useNetWorth(jy, throughMonth, years, starts);
  const f = useMemo(() => reportFormatters(hideValues), [hideValues]);
  const spanLabel = spanOf(jy, years);
  if (data.loading) {
    return (
      <div className="reports-loading" role="status" aria-label={t('در حال ساختن گزارش')}>
        <Skeleton height={96} radius={16} />
        <Skeleton height={260} radius={16} />
        <Skeleton height={260} radius={16} />
      </div>
    );
  }
  return (
    <>
      {data.errors.map((e) => <AlertBanner key={e} type="error" message={e} />)}
      <ReportDashboard data={data} netWorth={netWorth} f={f} yearLabel={spanLabel} hideValues={hideValues} years={years} />
    </>
  );
}

export default function ReportsPage() {
  const { status: vaultStatus } = useVault();
  const hideValues = usePrivacyMode();
  const today = todayIso();
  // Months are the «ماه حقوقی» while the expenses and incomes show them so (useSalaryMonths)
  const starts = useSalaryMonths().activeStarts;
  const thisMonth = useMemo(() => currentSalaryMonth(today, starts), [today, starts]);
  // The year browsed to; none picked follows the current one (the salary days load after the page)
  const [picked, setMonth] = useState(null);
  const month = picked || thisMonth;
  const [years, setYears] = useState(1);
  const throughMonth = month.jy === thisMonth.jy ? thisMonth.jm : 12;
  const pageRef = useRef(null);
  const yearLabel = spanOf(month.jy, years);
  const canPrint = !isNativeApp() && typeof window !== 'undefined' && typeof window.print === 'function';

  if (vaultStatus === 'locked') {
    return (
      <div className="incomes-page-container">
        <FeaturePageHeader {...HEADER} />
        <VaultUnlockCard title={t('گزارش‌ها از داده‌های رمزنگاری‌شده‌ی شما ساخته می‌شوند')} />
      </div>
    );
  }

  return (
    <div className="incomes-page-container reports-page" ref={pageRef}>
      <FeaturePageHeader
        {...HEADER}
        actions={canPrint && (
          <Button variant="secondary" icon={<FileDown size={16} />} onClick={() => printReport(pageRef.current, t('گزارش {year} — RealRate', { year: yearLabel }))}>
            {t('خروجی PDF')}
          </Button>
        )}
      />
      <p className="report-print-meta">{t('گزارش سال {year} · ساخته‌شده در {date} · RealRate', { year: yearLabel, date: new Date().toLocaleDateString(calendarLocale()) })}</p>
      <FilterPills options={SPANS} activeValue={years} onChange={setYears} size="sm" />
      <PeriodSwitcher mode="year" month={month} thisMonth={thisMonth} onMonthChange={setMonth} />
      <ReportBody jy={month.jy} years={years} throughMonth={throughMonth} starts={starts} hideValues={hideValues} />
    </div>
  );
}
