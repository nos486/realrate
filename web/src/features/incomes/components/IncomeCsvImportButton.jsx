import React from 'react';
import { GenericCsvImportButton } from '../../../shared/ui/index.js';
import { parseInputNumber } from '../../portfolio/utils/holdingHelpers.js';
import { INCOME_CATEGORIES, DEFAULT_INCOME_CATEGORY } from '../constants/incomeCategories.js';

// Column headers must mirror IncomeCsvExportButton.jsx exactly so the exported file round-trips.
const HEADERS = {
  title: 'عنوان',
  category: 'دسته‌بندی',
  amount: 'مبلغ (تومان)',
  date: 'تاریخ دریافت',
  notes: 'یادداشت',
};

const CATEGORY_LABEL_TO_VALUE = new Map(INCOME_CATEGORIES.map((c) => [c.label, c.value]));

function parseIncomeRow(row, headerIndex, i) {
  const get = (key) => {
    const idx = headerIndex[HEADERS[key]];
    return idx !== undefined && row[idx] !== undefined ? String(row[idx]) : '';
  };

  const title = get('title').trim();
  const amount = parseInputNumber(get('amount'));
  const dateRaw = get('date').trim();
  const incomeDate = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : '';

  if (!title || !amount || amount <= 0 || !incomeDate) {
    return { status: 'invalid', name: title || `ردیف ${i + 2}` };
  }

  const category = CATEGORY_LABEL_TO_VALUE.get(get('category').trim()) || DEFAULT_INCOME_CATEGORY;
  const notes = get('notes').trim();

  return { status: 'ok', name: title, data: { title, category, amount, incomeDate, notes } };
}

export default function IncomeCsvImportButton({ saveIncome, disabled = false }) {
  return (
    <GenericCsvImportButton
      parseRow={parseIncomeRow}
      onImportRow={(data) => saveIncome(data)}
      itemLabel="درآمد"
      disabled={disabled}
    />
  );
}
