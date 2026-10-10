import React from 'react';
import { GenericCsvExportButton } from '../../../shared/ui/index.js';
import { getIncomeCategory } from '../constants/incomeCategories.js';
import { currencyLabel } from '../../../utils/currencies.js';

/** IncomeCsvImportButton.jsx reads the same columns back */
const HEADERS = ['عنوان', 'دسته‌بندی', 'مبلغ', 'ارز', 'تاریخ دریافت', 'یادداشت'];

/** Exports every income (all dates), fetched when clicked: its amount in its own currency */
export default function IncomeCsvExportButton({ loadIncomes, disabled = false }) {
  return (
    <GenericCsvExportButton
      loadItems={loadIncomes}
      headers={HEADERS}
      mapRow={(income) => [
        income.title,
        getIncomeCategory(income.category).label,
        income.amount,
        currencyLabel(income.currency),
        income.incomeDate,
        income.notes || '',
      ]}
      fileBaseName="incomes"
      disabled={disabled}
      title="دریافت خروجی اکسل / CSV از درآمدها"
    />
  );
}
