import React from 'react';
import { GenericCsvExportButton } from '../../../shared/ui/index.js';
import { getDisplayRatePct } from '../../../utils/loanCalculator.js';

const HEADERS = [
  'نام یا عنوان وام',
  'نام وام‌دهنده / بانک',
  'مبلغ اصل وام (تومان)',
  'نرخ سود سالانه (٪)',
  'تعداد کل اقساط',
  'دوره پرداخت (ماه)',
  'تاریخ دریافت وام',
  'کارمزد سالانه (تومان)',
  'مانده بدهی فعلی (تومان)',
  'تعداد اقساط پرداخت‌شده',
  'یادداشت',
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
      title="دریافت خروجی اکسل / CSV از وام‌ها"
    />
  );
}
