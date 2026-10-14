import React from 'react';
import { t } from '../../../utils/i18n.js';
import { GenericCsvExportButton } from '../../../shared/ui/index.js';
import { getDisplayRatePct } from '../../../utils/loanCalculator.js';

const HEADERS = [
  t('نام یا عنوان وام'),
  t('نام وام‌دهنده / بانک'),
  t('مبلغ اصل وام (تومان)'),
  t('نرخ سود سالانه (٪)'),
  t('تعداد کل اقساط'),
  t('دوره پرداخت (ماه)'),
  t('تاریخ دریافت وام'),
  t('کارمزد سالانه (تومان)'),
  t('مانده بدهی فعلی (تومان)'),
  t('تعداد اقساط پرداخت‌شده'),
  t('یادداشت'),
];

export default function LoanCsvExportButton({ loans = [], disabled = false }) {
  return (
    <GenericCsvExportButton
      items={loans}
      headers={HEADERS}
      mapRow={(loan) => [
        loan.title,
        loan.lenderName || '',
        loan.principalAmount,
        getDisplayRatePct(loan),
        loan.totalCount || loan.installmentCount || '',
        loan.intervalMonths || 1,
        loan.startDate || loan.start_date || '',
        loan.annualFeeAmount || 0,
        loan.remainingBalance,
        loan.paidCount || 0,
        loan.notes || '',
      ]}
      fileBaseName="loans"
      disabled={disabled}
      title={t('دریافت خروجی اکسل / CSV از وام‌ها')}
    />
  );
}
