import React from 'react';
import { GenericCsvImportButton } from '../../../shared/ui/index.js';
import { parseInputNumber } from '../../portfolio/utils/holdingHelpers.js';

// Column headers must mirror LoanCsvExportButton.jsx exactly so the exported file round-trips.
// Each imported row creates a brand-new loan on the standard rate-based schedule — it can't
// restore already-paid installments or a custom per-installment distribution, since those aren't
// part of a loan's creation payload; "مانده بدهی فعلی" and "تعداد اقساط پرداخت‌شده" are exported
// for reference only and ignored on import.
const HEADERS = {
  title: 'نام یا عنوان وام',
  lenderName: 'نام وام‌دهنده / بانک',
  principalAmount: 'مبلغ اصل وام (تومان)',
  annualInterestRate: 'نرخ سود سالانه (٪)',
  installmentCount: 'تعداد کل اقساط',
  intervalMonths: 'دوره پرداخت (ماه)',
  startDate: 'تاریخ دریافت وام',
  annualFeeAmount: 'کارمزد سالانه (تومان)',
  notes: 'یادداشت',
};

function parseLoanRow(row, headerIndex, i) {
  const get = (key) => {
    const idx = headerIndex[HEADERS[key]];
    return idx !== undefined && row[idx] !== undefined ? String(row[idx]) : '';
  };

  const title = get('title').trim();
  const principalAmount = parseInputNumber(get('principalAmount'));
  const installmentCount = parseInt(get('installmentCount'), 10);
  const startDate = get('startDate').trim();

  if (!title || !principalAmount || principalAmount <= 0 || !installmentCount || installmentCount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return { status: 'invalid', name: title || `ردیف ${i + 2}` };
  }

  const annualInterestRate = parseInputNumber(get('annualInterestRate')) || 0;
  const intervalMonths = parseInt(get('intervalMonths'), 10) || 1;
  const annualFeeAmount = parseInputNumber(get('annualFeeAmount')) || 0;
  const notes = get('notes').trim();
  const lenderName = get('lenderName').trim();

  return {
    status: 'ok',
    name: title,
    data: {
      title,
      lenderName,
      principalAmount,
      annualInterestRate,
      installmentCount,
      intervalMonths,
      startDate,
      annualFeeAmount,
      notes,
      totalRepaymentAmount: null,
    },
  };
}

export default function LoanCsvImportButton({ addLoan, disabled = false }) {
  return (
    <GenericCsvImportButton
      parseRow={parseLoanRow}
      onImportRow={(data) => addLoan(data)}
      itemLabel="وام"
      disabled={disabled}
    />
  );
}
