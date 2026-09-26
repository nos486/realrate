import React from 'react';
import { GenericCsvExportButton } from '../../../shared/ui/index.js';
import { getIncomeCategory } from '../constants/incomeCategories.js';

const HEADERS = ['عنوان', 'دسته‌بندی', 'مبلغ (تومان)', 'تاریخ دریافت', 'یادداشت'];

/** Exports every income (all dates), fetched when clicked */
export default function IncomeCsvExportButton({ loadIncomes, disabled = false }) {
  return (
    <GenericCsvExportButton
      loadItems={loadIncomes}
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
