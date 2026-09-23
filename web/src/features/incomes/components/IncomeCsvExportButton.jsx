import React from 'react';
import { GenericCsvExportButton } from '../../../shared/ui/index.js';
import { getIncomeCategory } from '../constants/incomeCategories.js';

const HEADERS = ['عنوان', 'دسته‌بندی', 'مبلغ (تومان)', 'تاریخ دریافت', 'یادداشت'];

export default function IncomeCsvExportButton({ incomes = [], disabled = false }) {
  return (
    <GenericCsvExportButton
      items={incomes}
      headers={HEADERS}
      mapRow={(income) => [
        income.title,
        getIncomeCategory(income.category).label,
        income.amount,
        income.incomeDate,
        income.notes || '',
      ]}
      fileBaseName="incomes"
      disabled={disabled}
      title="دریافت خروجی اکسل / CSV از درآمدها"
    />
  );
}
