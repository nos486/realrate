import React from 'react';
import { GenericCsvImportButton } from '../../../shared/ui/index.js';
import { parseInputNumber } from '../../portfolio/utils/holdingHelpers.js';
import { DEFAULT_INCOME_CATEGORY, LEGACY_CATEGORY_LABELS } from '../constants/incomeCategories.js';
import { listCategories } from '../../../shared/categories/categoryStore.js';
import { BASE_CURRENCY, CURRENCIES } from '../../../utils/currencies.js';

// Column headers must mirror IncomeCsvExportButton.jsx exactly so the exported file round-trips;
// an older file's «مبلغ (تومان)» (no currency column) is read as tomans
const HEADERS = {
  title: 'عنوان',
  category: 'دسته‌بندی',
  amount: ['مبلغ', 'مبلغ (تومان)'],
  currency: 'ارز',
  date: 'تاریخ دریافت',
  notes: 'یادداشت',
};

/** A currency's name in the file → its code (tomans when empty or unknown) */
const currencyFromLabel = (label) => CURRENCIES.find((c) => c.label === label || c.code === label)?.code || BASE_CURRENCY;

/** A category's name in the file → its key (the user's own categories and names too) */
const categoryFromLabel = (label) => new Map([
  ...Object.entries(LEGACY_CATEGORY_LABELS),
  ...listCategories('income', { includeHidden: true }).map((c) => [c.label, c.value]),
]).get(label);

function parseIncomeRow(row, headerIndex, i) {
  const get = (key) => {
    const idx = [HEADERS[key]].flat().map((h) => headerIndex[h]).find((x) => x !== undefined);
    return idx !== undefined && row[idx] !== undefined ? String(row[idx]) : '';
  };

  const title = get('title').trim();
  const amount = parseInputNumber(get('amount'));
  const dateRaw = get('date').trim();
  const incomeDate = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : '';

  if (!title || !amount || amount <= 0 || !incomeDate) {
    return { status: 'invalid', name: title || `ردیف ${i + 2}` };
  }

  const category = categoryFromLabel(get('category').trim()) || DEFAULT_INCOME_CATEGORY;
  const notes = get('notes').trim();

  const currency = currencyFromLabel(get('currency').trim());

  return { status: 'ok', name: title, data: { title, category, amount, currency, incomeDate, notes } };
}

export default function IncomeCsvImportButton({ saveIncome, onImported, disabled = false }) {
  return (
    <GenericCsvImportButton
      parseRow={parseIncomeRow}
      // The list reloads once at the end, not after every row
      onImportRow={(data) => saveIncome(data, null, { reload: false })}
      onFinished={onImported}
      itemLabel="درآمد"
      disabled={disabled}
    />
  );
}
